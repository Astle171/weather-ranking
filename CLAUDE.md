# CLAUDE.md — Weather Activity Ranking Service

You are helping build a **production-quality backend service** for a Senior/Lead
Engineer take-home assessment. Every decision must reflect senior engineering
standards: clean architecture, TDD, meaningful trade-offs, and transparent
documentation of assumptions.

**Read this entire file before writing a single line of code.**

---

## The Brief

Build a Node.js + GraphQL service that:
1. Accepts a city or town name
2. Fetches 7-day weather forecast from Open-Meteo (free, no API key)
3. Scores and ranks 4 activities per day: Skiing, Surfing, Outdoor Sightseeing, Indoor Sightseeing
4. Persists weather data — do NOT call Open-Meteo on every request
5. Returns ranked activities with scores, reasoning, and daily breakdown

**This is what a senior engineer is being evaluated on:**
- How you model and store data (justify the choice)
- How you refresh cached data (document the strategy)
- How you make the scoring transparent and explainable
- How you handle edge cases gracefully (landlocked city → surfing, geocoding failure)
- TDD discipline with meaningful tests
- Clean layered architecture with SOLID principles

---

## Tech Stack (non-negotiable per assignment)

```
Runtime:    Node.js 20 + TypeScript (strict)
API:        GraphQL — Apollo Server v4
Storage:    SQLite via Prisma ORM  ← justified below
Testing:    Jest + ts-jest
HTTP fetch: node-fetch or native fetch (Node 20)
```

### Why SQLite

Document this explicitly in README and tradeoffs.md:
- Weather forecasts are **read-heavy, write-infrequent** (refresh every 1hr)
- Single-process Node.js — no write concurrency issues
- Zero infrastructure — runs locally with `npm install`
- Prisma abstracts the DB — switching to Postgres for production = 1 line change
- Alternative considered: Redis (better for pure caching with TTL) — rejected
  because it adds an external service dependency for a take-home exercise

---

## Architecture (SOLID, layered)

```
GraphQL Query
     │
     ▼
ActivityRankingResolver
     │ calls
     ▼
ActivityRankingService         ← orchestrates everything
     │
     ├── GeocodingClient        ← calls Open-Meteo geocoding API
     │
     ├── IWeatherRepository     ← interface (Dependency Inversion)
     │    ├── InMemoryWeatherRepository   (tests)
     │    └── PrismaWeatherRepository     (production)
     │         └── OpenMeteoClient        ← calls forecast + marine APIs
     │
     └── ScoringEngine          ← pure functions, easily tested
          ├── SkiingScorer
          ├── SurfingScorer
          ├── OutdoorSightseeingScorer
          └── IndoorSightseeingScorer
```

**Dependency rules:**
- Resolvers depend on Service
- Service depends on IWeatherRepository (interface, not implementation)
- Scorers are pure functions — no dependencies, fully unit-testable
- Prisma is only imported inside PrismaWeatherRepository

---

## Project File Structure

```
weather-activity-ranking/
├── src/
│   ├── graphql/
│   │   ├── schema.ts               GraphQL type definitions
│   │   ├── resolvers.ts            Query resolvers
│   │   └── server.ts               Apollo Server setup
│   │
│   ├── services/
│   │   └── activity-ranking.service.ts
│   │   └── activity-ranking.service.test.ts
│   │
│   ├── scoring/
│   │   ├── types.ts                DayForecast, ActivityScore, ScoringResult
│   │   ├── skiing.scorer.ts        + .test.ts
│   │   ├── surfing.scorer.ts       + .test.ts
│   │   ├── outdoor-sightseeing.scorer.ts   + .test.ts
│   │   ├── indoor-sightseeing.scorer.ts    + .test.ts
│   │   └── score-normalizer.ts     Normalise raw scores to 0-100 + ranking
│   │
│   ├── weather/
│   │   ├── geocoding.client.ts     Open-Meteo geocoding API
│   │   ├── geocoding.client.test.ts
│   │   ├── open-meteo.client.ts    Open-Meteo forecast + marine APIs
│   │   ├── open-meteo.client.test.ts
│   │   └── weather.types.ts        Raw API response types
│   │
│   ├── repository/
│   │   ├── weather.repository.interface.ts
│   │   ├── in-memory-weather.repository.ts
│   │   ├── in-memory-weather.repository.test.ts
│   │   └── prisma-weather.repository.ts
│   │
│   ├── shared/
│   │   └── errors/
│   │       ├── city-not-found.error.ts
│   │       └── weather-fetch.error.ts
│   │
│   └── lib/
│       └── prisma.ts
│
├── prisma/
│   └── schema.prisma
├── jest.config.ts
├── tsconfig.json
├── package.json
├── README.md
├── ASSUMPTIONS.md             ← questions you would ask a PM + what you assumed
└── docs/
    ├── tradeoffs.md
    └── ai-session.md          ← log of meaningful AI interactions
```

---

## Database Schema

```prisma
model CityGeocode {
  id        String   @id @default(uuid())
  cityName  String   @unique   // normalised lowercase
  lat       Float
  lon       Float
  cachedAt  DateTime @default(now())
}

model WeatherCache {
  id           String   @id @default(uuid())
  cityName     String   @unique   // normalised lowercase
  lat          Float
  lon          Float
  forecastJson String   // JSON array of DayForecast
  marineJson   String?  // JSON array of MarineDay (null for landlocked cities)
  cachedAt     DateTime @default(now())
  expiresAt    DateTime // cachedAt + 1 hour
}
```

**Cache TTL: 1 hour**
Rationale: Open-Meteo updates forecasts every hour. Refreshing more often
wastes API calls; refreshing less often serves stale data. 1 hour is the
sweet spot for a 7-day forecast.

---

## Open-Meteo API Reference

### 1. Geocoding (city → lat/lon)
```
GET https://geocoding-api.open-meteo.com/v1/search
  ?name={city}
  &count=1
  &language=en
  &format=json

Response: { results: [{ name, latitude, longitude, country, admin1 }] }
```

### 2. Weather Forecast
```
GET https://api.open-meteo.com/v1/forecast
  ?latitude={lat}
  &longitude={lon}
  &daily=temperature_2m_max,temperature_2m_min,precipitation_sum,
         wind_speed_10m_max,snowfall_sum,weather_code,sunshine_duration,
         precipitation_hours
  &timezone=auto
  &forecast_days=7

Response: { daily: { time[], temperature_2m_max[], ... } }
```

### 3. Marine Forecast (for surfing — may 404 for landlocked)
```
GET https://marine-api.open-meteo.com/v1/marine
  ?latitude={lat}
  &longitude={lon}
  &daily=wave_height_max,wind_wave_height_max,swell_wave_height_max
  &forecast_days=7

Returns 400/empty for landlocked cities — handle gracefully.
Surfing score = low (max 20) when no marine data available.
```

---

## Domain Types

```typescript
// src/scoring/types.ts

export interface DayForecast {
  date: string                 // ISO: "2025-01-15"
  maxTempC: number
  minTempC: number
  precipitationMm: number
  windSpeedKmh: number
  snowfallCm: number
  weatherCode: number          // WMO code
  sunshineDurationHours: number
  precipitationHours: number
  waveHeightM: number | null   // null = no marine data
  swellHeightM: number | null
}

export type ActivityType =
  | 'SKIING'
  | 'SURFING'
  | 'OUTDOOR_SIGHTSEEING'
  | 'INDOOR_SIGHTSEEING'

export interface DayScore {
  date: string
  score: number             // 0-100
  highlights: string[]      // ["Fresh powder", "Light winds"]
  warnings: string[]        // ["Rain expected", "Strong gusts"]
}

export interface ActivityRanking {
  activity: ActivityType
  rank: number              // 1-4
  overallScore: number      // average across 7 days, 0-100
  verdict: Verdict          // EXCELLENT | GOOD | FAIR | POOR
  reasoning: string         // human-readable summary
  dailyScores: DayScore[]
}

export type Verdict = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR'

export interface RankingResult {
  city: string
  country: string
  lat: number
  lon: number
  generatedAt: string
  cacheExpiresAt: string
  rankings: ActivityRanking[]
  forecast: DayForecast[]
}
```

---

## WMO Weather Code Classification

Implement this as a pure utility (easy to test):

```typescript
// src/scoring/weather-code.ts

export type WeatherGroup =
  | 'CLEAR'      // 0, 1
  | 'PARTLY_CLOUDY'  // 2
  | 'OVERCAST'   // 3
  | 'FOG'        // 45, 48
  | 'DRIZZLE'    // 51-57
  | 'RAIN'       // 61-67, 80-82
  | 'SNOW'       // 71-77, 85-86
  | 'STORM'      // 95, 96, 99

export function classifyWeatherCode(code: number): WeatherGroup
```

---

## Scoring Algorithms

These are **pure functions** — no side effects, fully deterministic, easily testable.
Each scorer receives a `DayForecast` and returns a `DayScore`.

### SkiingScorer

```
SNOWFALL (max 35 pts):
  >= 15cm  → 35   "Heavy snowfall"
  10-15cm  → 28   "Good snowfall"
  5-10cm   → 20   "Light snowfall"
  1-5cm    → 10   "Dusting of snow"
  < 1cm    →  0   warning: "Insufficient snowfall"

TEMPERATURE (max 30 pts):
  -10 to -2°C  → 30  highlight: "Ideal powder conditions"
  -2 to  0°C   → 25  highlight: "Good snow temperature"
   0 to  3°C   → 15
   3 to  6°C   → 8
  > 6°C        →  0  warning: "Too warm — slushy conditions"
  < -15°C      → 15  warning: "Extremely cold — dress appropriately"

WIND (max 20 pts):
  < 20 km/h    → 20  highlight: "Calm conditions"
  20-35 km/h   → 12
  35-50 km/h   →  5  warning: "Windy conditions"
  > 50 km/h    →  0  warning: "Dangerous wind speeds — lifts may close"

NO RAIN BONUS (max 15 pts):
  precipitationMm = 0 OR weatherCode in SNOW  → 15
  otherwise                                    →  0  warning: "Rain on snow"

Max: 100
```

### SurfingScorer

```
WAVE HEIGHT (max 40 pts) — null marine data caps total at 20:
  1.0-2.5m  → 40  highlight: "Ideal wave height"
  0.5-1.0m  → 20  highlight: "Mellow waves — good for beginners"
  2.5-4.0m  → 30  highlight: "Powerful surf — advanced riders"
  > 4.0m    → 10  warning: "Extremely large surf — experts only"
  < 0.3m    →  5  warning: "Flat — poor surfing conditions"
  null      →  0  warning: "No coastal data — landlocked location"

WIND (max 30 pts):
  < 15 km/h  → 30  highlight: "Clean, glassy conditions"
  15-25 km/h → 20
  25-40 km/h → 10  warning: "Choppy surface"
  > 40 km/h  →  5  warning: "Onshore winds — rough conditions"

PRECIPITATION (max 20 pts):
  precipitationMm = 0  → 20
  < 2mm                → 10
  >= 2mm               →  0  warning: "Rain expected"

TEMPERATURE COMFORT (max 10 pts):
  > 20°C    → 10  highlight: "Warm water conditions"
  15-20°C   →  5
  < 15°C    →  0  warning: "Cold water — full wetsuit recommended"

Max: 100 (or 20 if no marine data)
```

### OutdoorSightseeingScorer

```
WEATHER CODE GROUP (max 40 pts):
  CLEAR         → 40  highlight: "Clear skies"
  PARTLY_CLOUDY → 32  highlight: "Mostly sunny"
  OVERCAST      → 20
  SNOW (light)  → 22  highlight: "Scenic winter conditions"
  FOG           → 10  warning: "Low visibility"
  DRIZZLE       →  8  warning: "Light rain — bring an umbrella"
  RAIN          →  0  warning: "Wet conditions"
  STORM         →  0  warning: "Dangerous weather — stay indoors"

TEMPERATURE (max 30 pts):
  15-22°C  → 30  highlight: "Perfect temperature"
  10-15°C  → 22
  22-28°C  → 25  highlight: "Warm and pleasant"
   5-10°C  → 14  warning: "Cool — dress in layers"
   0-5°C   →  8  warning: "Cold conditions"
  > 28°C   → 15  warning: "Very hot — stay hydrated"
  < 0°C    →  4  warning: "Freezing temperatures"

WIND (max 20 pts):
  < 15 km/h  → 20  highlight: "Calm conditions"
  15-30 km/h → 14
  30-45 km/h →  6  warning: "Windy"
  > 45 km/h  →  0  warning: "Very strong winds"

SUNSHINE (max 10 pts):
  > 8 hrs    → 10  highlight: "Plenty of sunshine"
  5-8 hrs    →  7
  2-5 hrs    →  4
  < 2 hrs    →  0

Max: 100
```

### IndoorSightseeingScorer

```
DESIGN NOTE: Indoor sightseeing is always viable but most valuable
when outdoor conditions are poor. Score reflects the relative
appeal of going indoors vs outside.

BASE SCORE: 45 (always a good option)

BAD WEATHER BONUS (max 35 pts):
  STORM + heavy rain   → 35  highlight: "Perfect day for museums/galleries"
  RAIN or heavy SNOW   → 28  highlight: "Great day to explore indoors"
  DRIZZLE or FOG       → 18
  OVERCAST             →  8
  CLEAR/PARTLY_CLOUDY  →  0

EXTREME TEMPERATURE BONUS (max 15 pts):
  < -5°C   → 15  highlight: "Too cold to be outside long"
  > 33°C   → 15  highlight: "Too hot to be outside long"
  0 to 5°C →  8
  28-33°C  →  8
  otherwise →  0

IDEAL OUTDOOR PENALTY:
  CLEAR + 15-25°C + no rain → -10
  (you'd rather be outside — indoor is less compelling)

Max: 95 (deliberately capped below 100 so perfect outdoor weather
     beats indoor unless outdoor is genuinely hostile)
```

---

## GraphQL Schema

```graphql
type Query {
  rankActivities(city: String!): RankingResult!
}

type RankingResult {
  city: String!
  country: String!
  coordinates: Coordinates!
  generatedAt: String!        # ISO timestamp
  cacheExpiresAt: String!     # when this result will be refreshed
  rankings: [ActivityRanking!]!
  forecast: [DayForecast!]!
}

type ActivityRanking {
  rank: Int!                  # 1 = best activity for this location/week
  activity: Activity!
  overallScore: Float!        # 0-100, average across 7 days
  verdict: Verdict!
  reasoning: String!          # "Excellent powder conditions on 4 of 7 days..."
  dailyScores: [DayScore!]!
}

type DayScore {
  date: String!               # "2025-01-15"
  score: Float!               # 0-100
  highlights: [String!]!      # positive factors
  warnings: [String!]!        # negative factors or cautions
}

type DayForecast {
  date: String!
  maxTempC: Float!
  minTempC: Float!
  precipitationMm: Float!
  windSpeedKmh: Float!
  snowfallCm: Float!
  weatherCode: Int!
  weatherDescription: String! # human-readable WMO code description
  sunshineDurationHours: Float!
  waveHeightM: Float          # null for landlocked cities
}

type Coordinates {
  lat: Float!
  lon: Float!
}

enum Activity {
  SKIING
  SURFING
  OUTDOOR_SIGHTSEEING
  INDOOR_SIGHTSEEING
}

enum Verdict {
  EXCELLENT   # score >= 75
  GOOD        # score >= 55
  FAIR        # score >= 35
  POOR        # score < 35
}
```

---

## Cache Refresh Strategy

**Chosen: Lazy refresh (synchronous on-request)**

On every `rankActivities` query:
1. Check `WeatherCache` for the city
2. If no cache OR `expiresAt < now()` → fetch fresh from Open-Meteo, store, return
3. If cache is fresh → return cached data immediately

**Why lazy over eager (background job):**
- Simpler to implement correctly — no scheduler, no race conditions
- For a take-home exercise, a background job adds complexity without user-visible benefit
- Works correctly on first request for a new city

**Trade-off documented in ASSUMPTIONS.md:**
> A background refresh job would give faster response times for frequently-queried
> cities by pre-fetching data. For production at scale, I would add a Bull queue
> that refreshes caches for the top N queried cities every hour, keeping the lazy
> fallback for cold-cache scenarios.

---

## IWeatherRepository Interface

```typescript
export interface CachedForecast {
  cityName: string
  lat: number
  lon: number
  country: string
  forecast: DayForecast[]
  cachedAt: Date
  expiresAt: Date
}

export interface IWeatherRepository {
  getForecast(cityName: string): Promise<CachedForecast | null>
  saveForecast(data: CachedForecast): Promise<void>
  isCacheValid(cityName: string): Promise<boolean>
  getCityGeocode(cityName: string): Promise<{ lat: number; lon: number; country: string } | null>
  saveCityGeocode(cityName: string, lat: number, lon: number, country: string): Promise<void>
}
```

---

## Phase-by-Phase TDD Plan

Follow strict TDD: **red commit → green commit → refactor commit**.
Each phase must have all tests passing before moving to the next.

---

### PHASE 0 — Scaffold (3 commits)

**Commit 1:** `chore: init Node + TypeScript + Apollo Server + Jest`
```bash
npm init -y
npm install apollo-server-core graphql @apollo/server
npm install -D typescript ts-node ts-jest @types/node jest
# tsconfig.json with strict: true
# jest.config.ts
# src/server.ts — minimal Apollo Server health check
```

**Commit 2:** `chore: add Prisma + SQLite, WeatherCache + CityGeocode models`
```bash
npm install prisma @prisma/client
npx prisma init --datasource-provider sqlite
# schema.prisma with WeatherCache + CityGeocode models
npx prisma migrate dev --name init
```

**Commit 3:** `chore: add dotenv, shared error classes, project structure`
```bash
npm install dotenv
# src/shared/errors/city-not-found.error.ts
# src/shared/errors/weather-fetch.error.ts
# src/lib/prisma.ts
```

---

### PHASE 1 — Weather clients (4 commits)

**Commit 1:** `test: failing — GeocodingClient returns lat/lon for valid city`
```typescript
// src/weather/geocoding.client.test.ts
describe('GeocodingClient', () => {
  it('should return coordinates for a valid city', async () => {
    // Mock fetch, verify correct URL called, return fixture response
    const result = await client.search('Innsbruck')
    expect(result.lat).toBeCloseTo(47.26, 1)
    expect(result.lon).toBeCloseTo(11.39, 1)
    expect(result.country).toBe('Austria')
  })

  it('should throw CityNotFoundError when city does not exist', async () => {
    // Mock fetch returning empty results array
    await expect(client.search('ZZZnonexistent')).rejects.toThrow(CityNotFoundError)
  })
})
```

**Commit 2:** `feat: GeocodingClient — geocode city to lat/lon via Open-Meteo`

**Commit 3:** `test: failing — OpenMeteoClient returns 7-day forecast`
```typescript
// src/weather/open-meteo.client.test.ts
describe('OpenMeteoClient', () => {
  it('should return 7 DayForecast objects for given coordinates', async () => {
    // Mock fetch with fixture response
    const forecast = await client.getForecast(47.26, 11.39)
    expect(forecast).toHaveLength(7)
    expect(forecast[0]).toMatchObject({
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      maxTempC: expect.any(Number),
      snowfallCm: expect.any(Number),
    })
  })

  it('should return marine data for coastal coordinates', async () => {
    const forecast = await client.getForecast(48.8, -2.3) // Brest, France
    expect(forecast[0].waveHeightM).not.toBeNull()
  })

  it('should set waveHeightM to null when marine API returns no data', async () => {
    // Mock marine API returning 400
    const forecast = await client.getForecast(47.26, 11.39) // Innsbruck
    expect(forecast[0].waveHeightM).toBeNull()
  })
})
```

**Commit 4:** `feat: OpenMeteoClient — forecast + graceful marine API fallback`

---

### PHASE 2 — Repository layer (5 commits)

**Commit 1:** `feat: IWeatherRepository interface + CachedForecast types (D, I)`

**Commit 2:** `test: failing — InMemoryWeatherRepository cache operations`
```typescript
describe('InMemoryWeatherRepository', () => {
  it('should return null when no cache exists for city', async () => {})
  it('should return cached forecast after saveForecast', async () => {})
  it('should return false for isCacheValid when cache is expired', async () => {})
  it('should return true for isCacheValid when cache is fresh', async () => {})
  it('should store and retrieve geocode', async () => {})
})
```

**Commit 3:** `feat: InMemoryWeatherRepository — in-memory cache with TTL (L)`

**Commit 4:** `feat: PrismaWeatherRepository — SQLite-backed cache (L, D)`

**Commit 5:** `refactor: extract CachePolicy — TTL and expiry logic (S)`

---

### PHASE 3 — Scoring engine (10 commits — most important phase)

**Commit 1:** `feat: weather-code classifier — WMO codes → WeatherGroup enum`
```typescript
// test first:
describe('classifyWeatherCode', () => {
  it('should classify 0 as CLEAR', () => {})
  it('should classify 63 as RAIN', () => {})
  it('should classify 71 as SNOW', () => {})
  it('should classify 95 as STORM', () => {})
})
```

**Commit 2:** `test: failing — SkiingScorer scores optimal ski day at ~90+`
```typescript
describe('SkiingScorer', () => {
  const perfectSkiDay: DayForecast = {
    date: '2025-01-15',
    maxTempC: -3,
    minTempC: -8,
    precipitationMm: 0,
    windSpeedKmh: 10,
    snowfallCm: 20,
    weatherCode: 71,          // snow
    sunshineDurationHours: 4,
    precipitationHours: 0,
    waveHeightM: null,
    swellHeightM: null,
  }

  it('should score a perfect ski day above 85', () => {
    const result = scoreDay(perfectSkiDay)
    expect(result.score).toBeGreaterThan(85)
    expect(result.highlights).toContain('Heavy snowfall')
  })

  it('should score a warm rainy day below 15', () => {
    const result = scoreDay({ ...perfectSkiDay, maxTempC: 8, snowfallCm: 0,
                               precipitationMm: 5, weatherCode: 61 })
    expect(result.score).toBeLessThan(15)
    expect(result.warnings).toContain('Too warm — slushy conditions')
  })

  it('should warn about dangerous wind speeds above 50km/h', () => {
    const result = scoreDay({ ...perfectSkiDay, windSpeedKmh: 65 })
    expect(result.warnings).toContain('Dangerous wind speeds — lifts may close')
  })
})
```

**Commit 3:** `feat: SkiingScorer — snowfall, temperature, wind, no-rain scoring`

**Commit 4:** `test: failing — SurfingScorer with and without marine data`
```typescript
describe('SurfingScorer', () => {
  it('should score ideal surf conditions above 80', () => {
    // 1.5m waves, light wind, warm
  })
  it('should cap score at 20 when waveHeightM is null', () => {
    // landlocked city — no marine data
    const result = scoreDay({ ...day, waveHeightM: null })
    expect(result.score).toBeLessThanOrEqual(20)
    expect(result.warnings).toContain('No coastal data — landlocked location')
  })
  it('should warn about extremely large surf', () => {
    // 5m waves
  })
})
```

**Commit 5:** `feat: SurfingScorer — wave height, wind, precipitation, graceful landlocked handling`

**Commit 6:** `test: failing — OutdoorSightseeingScorer`
```typescript
describe('OutdoorSightseeingScorer', () => {
  it('should score clear warm day above 85', () => {})
  it('should score rainy storm day below 15', () => {})
  it('should score light snow as scenic (above 50)', () => {})
  it('should include sunshine highlights', () => {})
})
```

**Commit 7:** `feat: OutdoorSightseeingScorer — weather code, temperature, wind, sunshine`

**Commit 8:** `test: failing — IndoorSightseeingScorer`
```typescript
describe('IndoorSightseeingScorer', () => {
  it('should always score above 40 (always viable)', () => {})
  it('should score higher on rainy days than clear days', () => {
    const rainyScore = scoreDay({ ...day, weatherCode: 63, precipitationMm: 8 })
    const sunnyScore = scoreDay({ ...day, weatherCode: 0, precipitationMm: 0 })
    expect(rainyScore.score).toBeGreaterThan(sunnyScore.score)
  })
  it('should highlight being indoors on storm days', () => {})
  it('should not exceed 95 (outdoor beats indoor on perfect days)', () => {
    const result = scoreDay({ ...day, weatherCode: 0, maxTempC: 20, precipitationMm: 0 })
    expect(result.score).toBeLessThanOrEqual(95)
  })
})
```

**Commit 9:** `feat: IndoorSightseeingScorer — base + bad-weather bonus + ideal-outdoor penalty`

**Commit 10:** `feat: RankingEngine — aggregate daily scores, calculate verdict and reasoning`
```typescript
// Combines 4 scorers, computes 7-day averages, assigns ranks 1-4
// Generates human-readable reasoning:
// "Skiing: Excellent conditions on 5 of 7 days with consistent snowfall.
//  Best day: Tuesday (score 92) — Heavy powder and light winds."

describe('RankingEngine', () => {
  it('should rank 4 activities with no ties', () => {})
  it('should generate reasoning mentioning best day', () => {})
  it('should assign EXCELLENT to scores >= 75', () => {})
  it('should correctly identify best day per activity', () => {})
})
```

---

### PHASE 4 — ActivityRankingService (4 commits)

**Commit 1:** `test: failing — ActivityRankingService returns ranked activities for city`
```typescript
describe('ActivityRankingService', () => {
  let repo: InMemoryWeatherRepository
  let service: ActivityRankingService

  beforeEach(() => {
    repo = new InMemoryWeatherRepository()
    service = new ActivityRankingService(repo, mockGeocodingClient, mockWeatherClient)
  })

  it('should return 4 ranked activities', async () => {
    const result = await service.rankActivities('Innsbruck')
    expect(result.rankings).toHaveLength(4)
    expect(result.rankings.map(r => r.rank)).toEqual([1, 2, 3, 4])
  })

  it('should use cached data on second call for same city', async () => {
    await service.rankActivities('Innsbruck')
    await service.rankActivities('Innsbruck')
    expect(mockWeatherClient.getForecast).toHaveBeenCalledTimes(1)
  })

  it('should refresh cache when expired', async () => {
    // Seed repo with expired cache
    await repo.saveForecast({ ...data, expiresAt: new Date(Date.now() - 1000) })
    await service.rankActivities('Innsbruck')
    expect(mockWeatherClient.getForecast).toHaveBeenCalledTimes(1)
  })

  it('should throw CityNotFoundError when city does not exist', async () => {
    mockGeocodingClient.search.mockRejectedValue(new CityNotFoundError('ZZZ'))
    await expect(service.rankActivities('ZZZnonexistent'))
      .rejects.toThrow(CityNotFoundError)
  })
})
```

**Commit 2:** `feat: ActivityRankingService — orchestrate geocode + cache + score + rank (D)`

**Commit 3:** `test: failing — cache is refreshed after TTL expires`

**Commit 4:** `feat: ActivityRankingService — lazy cache refresh on expiry`

---

### PHASE 5 — GraphQL layer (4 commits)

**Commit 1:** `feat: GraphQL schema — rankActivities query, all types and enums`

**Commit 2:** `feat: GraphQL resolver — map service result to GraphQL response`
```typescript
// Map domain types to GraphQL response
// Handle CityNotFoundError → GraphQL error with helpful message
// Handle network errors → generic error
```

**Commit 3:** `feat: Apollo Server setup — CORS, introspection, health endpoint`

**Commit 4:** `test: integration — GraphQL query returns correct shape for known city`
```typescript
// Use apollo-server-testing or supertest
// Query for "London" with mocked weather client
// Assert response shape matches schema exactly
```

---

### PHASE 6 — Polish (3 commits)

**Commit 1:** `docs: README — setup, example queries, assumptions, architecture`

**Commit 2:** `docs: ASSUMPTIONS.md — open questions + decisions made`

**Commit 3:** `docs: tradeoffs.md + ai-session.md — engineering decisions and AI usage log`

---

## Senior-Level Requirements Checklist

Before considering the project complete, verify:

### Architecture
- [ ] Service never imports Prisma directly (only through IWeatherRepository)
- [ ] Scorers are pure functions with no side effects
- [ ] CityNotFoundError and WeatherFetchError are domain-typed, not strings
- [ ] Marine API failure is handled gracefully — not an error, just null data

### GraphQL
- [ ] Response includes `cacheExpiresAt` so clients know data freshness
- [ ] Each day score includes `highlights` and `warnings` arrays
- [ ] Verdict enum (EXCELLENT/GOOD/FAIR/POOR) is present
- [ ] `reasoning` field gives a human-readable weekly summary per activity
- [ ] Introspection enabled (useful for demo)

### Error handling
- [ ] City not found → clear GraphQL error message
- [ ] Open-Meteo API down → meaningful error (not 500 with stack trace)
- [ ] Marine API 4xx for landlocked city → silently scores surfing low (not an error)
- [ ] Malformed city name → validation before API call

### Testing
- [ ] All scorers have tests for best case, worst case, and edge cases
- [ ] Service tests use InMemoryRepository — no real DB calls
- [ ] Cache hit vs cache miss both tested
- [ ] GeocodingClient tested with mocked fetch

### Documentation (what they're most interested in)
- [ ] ASSUMPTIONS.md answers: "What would I ask a PM?"
- [ ] tradeoffs.md explains: SQLite vs Redis, lazy vs eager refresh
- [ ] ai-session.md logs: meaningful AI interactions, where you pushed back
- [ ] README has working `curl` or GraphQL playground example

---

## ASSUMPTIONS.md Template

Fill this in as you work:

```markdown
# Assumptions & Open Questions

## Questions I would ask a PM

1. **Skill level for surfing/skiing?**
   Assumed intermediate — 1-2.5m waves score highest for surfing,
   -2 to -5°C scores highest for skiing. Would adjust scoring weights
   based on target audience.

2. **Geographic scope?**
   Assumed worldwide. Landlocked cities (no marine data) get surfing
   scores capped at 20/100 with a clear explanation.

3. **How stale can cached data be?**
   Assumed 1 hour — matches Open-Meteo's forecast update frequency.
   Would discuss with PM whether users need real-time accuracy.

4. **What does "rank" mean across the week vs per day?**
   Assumed weekly average — one rank per activity for the 7-day period.
   Also returning daily scores so clients can show day-by-day breakdown.

5. **Should indoor sightseeing score independently or relative to outdoor?**
   Chose: relative — indoor scores higher when outdoor conditions are poor.
   Rationale: the user is implicitly asking "what should I do?" so relative
   value is more useful than absolute.

## Decisions made

- Cache TTL: 1 hour (see tradeoffs.md)
- Marine API failure: silent (surfing capped at 20, not an error)
- Scoring weights: documented per scorer (can be adjusted via config)
- City name normalised to lowercase for cache key consistency
```

---

## Example GraphQL Query (for README)

```graphql
query RankActivities {
  rankActivities(city: "Innsbruck") {
    city
    country
    coordinates { lat lon }
    generatedAt
    cacheExpiresAt
    rankings {
      rank
      activity
      overallScore
      verdict
      reasoning
      dailyScores {
        date
        score
        highlights
        warnings
      }
    }
    forecast {
      date
      maxTempC
      minTempC
      precipitationMm
      windSpeedKmh
      snowfallCm
      weatherDescription
      waveHeightM
    }
  }
}
```

Expected shape for Innsbruck in winter:
```json
{
  "rankings": [
    { "rank": 1, "activity": "SKIING", "verdict": "EXCELLENT", "overallScore": 82 },
    { "rank": 2, "activity": "OUTDOOR_SIGHTSEEING", "verdict": "GOOD", "overallScore": 68 },
    { "rank": 3, "activity": "INDOOR_SIGHTSEEING", "verdict": "FAIR", "overallScore": 55 },
    { "rank": 4, "activity": "SURFING", "verdict": "POOR", "overallScore": 8 }
  ]
}
```

---

## Starting Instructions for Claude Code

1. Read this entire CLAUDE.md before writing any code
2. Create the project structure exactly as specified above
3. Start with Phase 0 — get a running Apollo Server with health check first
4. Follow TDD strictly — write the test file and commit it RED before writing implementation
5. After each phase, run `npm test` — must be green before proceeding
6. Commit messages follow the pattern: `type: description — detail (SOLID principle if relevant)`
7. Keep `docs/ai-session.md` updated as you work — log every meaningful decision or correction
8. When you make an assumption, add it to `ASSUMPTIONS.md` immediately
9. Do not add features beyond the spec — prioritise correctness over breadth

**The assessment values one well-implemented feature over several rushed ones.
If time runs short, complete Phases 0-5 thoroughly rather than rushing Phase 6.**