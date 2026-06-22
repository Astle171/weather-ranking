# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project

A Node.js + GraphQL backend service (senior engineer take-home assessment). Accepts a city name, fetches a 7-day weather forecast from Open-Meteo (free, no API key), scores four activities per day, and returns them ranked with explanations.

Activities: `SKIING` | `SURFING` | `OUTDOOR_SIGHTSEEING` | `INDOOR_SIGHTSEEING`

---

## Commands

```bash
npm install
npm run build                          # tsc compile
npm run dev                            # start Apollo Server (ts-node src/server.ts)
npm test                               # jest (all)
npm test -- --testPathPattern=skiing   # single test file
npm test -- --watch
npx prisma migrate dev --name <name>   # run a DB migration
npx prisma studio                      # inspect SQLite data
```

---

## Tech Stack

| Concern  | Choice |
|----------|--------|
| Runtime  | Node.js 20 + TypeScript strict |
| API      | GraphQL — Apollo Server v4 |
| Storage  | SQLite via Prisma ORM v7 |
| Testing  | Jest + ts-jest |
| HTTP     | native fetch (Node 20) |

**Why SQLite over Redis:** read-heavy/write-infrequent workload, single-process Node, zero infrastructure, Prisma abstracts it (Postgres = 1-line change). Redis rejected because it adds an external service dependency for a take-home exercise.

**Prisma v7 note:** v7 removed the native binary engine. `new PrismaClient()` without arguments throws. Fix: use `@prisma/adapter-better-sqlite3` — see `src/lib/prisma.ts`.

---

## Architecture

```
GraphQL Query
     │
     ▼
ActivityRankingResolver          (src/graphql/resolvers.ts)
     │
     ▼
ActivityRankingService           (src/services/activity-ranking.service.ts)
     │
     ├── GeocodingClient         (src/weather/geocoding.client.ts)
     │
     ├── IWeatherRepository      (src/repository/weather.repository.interface.ts)
     │    ├── InMemoryWeatherRepository   (tests only)
     │    └── PrismaWeatherRepository     (production)
     │         └── OpenMeteoClient        (src/weather/open-meteo.client.ts)
     │
     └── ScoringEngine
          ├── SkiingScorer
          ├── SurfingScorer
          ├── OutdoorSightseeingScorer
          └── IndoorSightseeingScorer     (src/scoring/*.scorer.ts)
```

**Dependency rules:**
- Service depends on `IWeatherRepository` interface, never on Prisma directly
- Scorers are pure `(DayForecast) => DayScore` — no I/O, no mocks needed in tests
- Prisma imported only inside `PrismaWeatherRepository`

---

## Key Domain Types (`src/scoring/types.ts`)

- `DayForecast` — one day of weather (temp, wind, snow, wave height, WMO code, sunshine)
- `DayScore` — `{ date, score: 0–100, highlights: string[], warnings: string[] }`
- `ActivityRanking` — `{ activity, rank, overallScore, verdict, reasoning, dailyScores[] }`
- `RankingResult` — `{ city, country, lat, lon, generatedAt, cacheExpiresAt, rankings[], forecast[] }`
- `Verdict` — `EXCELLENT (≥75) | GOOD (≥55) | FAIR (≥35) | POOR (<35)`

---

## Cache Strategy

**Lazy refresh on-request:** single `getForecast` call checks freshness inline (`isCacheExpired`). If stale/missing: geocode (or use cached geocode) → fetch → save. TTL = **1 hour**. City name normalised to lowercase as cache key.

Rationale: no scheduler/race conditions, works correctly for cold-cache. Documented trade-off in `docs/tradeoffs.md`.

---

## Edge Cases

| Scenario | Behaviour |
|---|---|
| Landlocked city (no marine data) | Marine API 400 → `waveHeightM: null` → surfing capped at 20/100 |
| City not found | `GeocodingClient` throws `CityNotFoundError` → `BAD_USER_INPUT` GraphQL error |
| Open-Meteo down | `WeatherFetchError` → `INTERNAL_SERVER_ERROR` GraphQL error, no stack trace |
| Malformed city name | Geocoding API returns empty results → `CityNotFoundError` |

---

## Database Schema (`prisma/schema.prisma`)

```prisma
model CityGeocode {
  id        String   @id @default(uuid())
  cityName  String   @unique   // normalised lowercase
  lat       Float
  lon       Float
  country   String
  cachedAt  DateTime @default(now())
}

model WeatherCache {
  id           String   @id @default(uuid())
  cityName     String   @unique
  lat          Float
  lon          Float
  country      String
  forecastJson String   // JSON-serialised DayForecast[]
  marineJson   String?  // null for landlocked cities
  cachedAt     DateTime @default(now())
  expiresAt    DateTime // cachedAt + 1 hour
}
```

---

## Open-Meteo Endpoints

- **Geocoding:** `https://geocoding-api.open-meteo.com/v1/search?name={city}&count=1&language=en&format=json`
- **Forecast:** `https://api.open-meteo.com/v1/forecast?latitude=…&longitude=…&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,snowfall_sum,weather_code,sunshine_duration,precipitation_hours&timezone=auto&forecast_days=7`
- **Marine:** `https://marine-api.open-meteo.com/v1/marine?…&daily=wave_height_max,swell_wave_height_max&forecast_days=7` — returns 400 for landlocked, handled gracefully with `null` wave data

Both forecast and marine are fired in parallel via `Promise.all`. Forecast promise must be declared first to match jest mock registration order.

---

## Scoring

All scorers are pure functions in `src/scoring/`. Each receives `DayForecast` → returns `DayScore`. `overallScore` = 7-day average. Rank 1 = highest average.

### Skiing (max 100)

| Factor | Weight | Detail |
|--------|--------|--------|
| Snowfall | 35 pts | ≥15cm→35, 10–15→28, 5–10→20, 1–5→10, <1→0 + warning |
| Temperature | 30 pts | −10 to −2°C ideal→30; >6°C→0 "slushy"; <−15→15 + warning |
| Wind | 20 pts | <20 km/h→20; 20–35→12; 35–50→5; >50→0 warning "lifts may close" |
| No-rain bonus | 15 pts | precipMm=0 OR SNOW group→15; else→0 + warning "Rain on snow" |

### Surfing (max 100, capped at 20 for landlocked)

| Factor | Weight | Detail |
|--------|--------|--------|
| Wave height | 40 pts | 1.0–2.5m ideal→40; >4m→10 warning "experts only"; null→cap 20 |
| Wind | 30 pts | <15→30; 15–25→20; 25–40→10; >40→5 warning "onshore winds" |
| Precipitation | 20 pts | 0mm→20; <2mm→10; ≥2mm→0 |
| Temp comfort | 10 pts | >20°C→10; 15–20→5; <15→0 warning "full wetsuit" |

### Outdoor Sightseeing (max 100)

STORM returns `score: 0` immediately (early return — prevents warm calm storm day scoring ~60).

| Factor | Weight | Detail |
|--------|--------|--------|
| WMO group | 40 pts | CLEAR→40; PARTLY_CLOUDY→32; OVERCAST→20; SNOW→22; FOG→10; DRIZZLE→8; RAIN/STORM→0 |
| Temperature | 30 pts | 15–22°C→30 "Perfect"; 22–28→25; 10–15→22; 5–10→14; 0–5→8; >28→15; <0→4 |
| Wind | 20 pts | <15→20; ≤30→14; ≤45→6; >45→0 |
| Sunshine | 10 pts | >8h→10; ≥5h→7; ≥2h→4; <2h→0 |

### Indoor Sightseeing (max 95, floor 45)

Deliberately capped at 95 so perfect outdoor weather beats indoor.

| Factor | Points | Detail |
|--------|--------|--------|
| Base | 45 | Always a viable option |
| Bad-weather bonus | +35 | STORM+precip>5→35; STORM/RAIN→28; DRIZZLE/FOG→18; OVERCAST→8 |
| Extreme-temp bonus | +15 | <−5°C or >33°C→15; 28–33°C or −5–0°C→8 |
| Ideal-outdoor penalty | −10 | CLEAR + 15–25°C + precipMm=0 |

Clamp: `Math.min(95, Math.max(45, raw))`

### WMO Code Groups

`CLEAR(0,1)` `PARTLY_CLOUDY(2)` `OVERCAST(3)` `FOG(45,48)` `DRIZZLE(51–57)` `RAIN(61–67,80–82)` `SNOW(71–77,85–86)` `STORM(95,96,99)`

---

## GraphQL Schema (`src/graphql/schema.ts`)

```graphql
enum Activity { SKIING SURFING OUTDOOR_SIGHTSEEING INDOOR_SIGHTSEEING }
enum Verdict  { EXCELLENT GOOD FAIR POOR }

type Coordinates { lat: Float!  lon: Float! }

type DayScore {
  date: String!  score: Int!
  highlights: [String!]!  warnings: [String!]!
}

type DayForecast {
  date: String!  maxTempC: Float!  minTempC: Float!
  precipitationMm: Float!  windSpeedKmh: Float!  snowfallCm: Float!
  weatherDescription: String!  waveHeightM: Float  swellHeightM: Float
}

type ActivityRanking {
  rank: Int!  activity: Activity!  overallScore: Float!
  verdict: Verdict!  reasoning: String!  dailyScores: [DayScore!]!
}

type RankingResult {
  city: String!  country: String!  coordinates: Coordinates!
  generatedAt: String!  cacheExpiresAt: String!
  rankings: [ActivityRanking!]!  forecast: [DayForecast!]!
}

type Query {
  rankActivities(city: String!): RankingResult!
}
```

**Mapping note:** `RankingResult.lat/lon` (flat) → GraphQL `coordinates: { lat, lon }` (nested). `DayForecast.weatherCode` (int) → `weatherDescription` (human-readable string) via `classifyWeatherCode` in the resolver.

---

## TDD Discipline

Commit order: **red → green → refactor**. Test file committed before implementation file.
- Scorer tests use literal `DayForecast` fixtures — no mocks (pure functions)
- Service tests use `InMemoryWeatherRepository` — no DB calls
- Resolver tests call `resolvers.Query.rankActivities` directly — no HTTP server

**Phases:** 0 Scaffold → 1 Weather clients → 2 Repository → 3 Scoring → 4 Service → 5 GraphQL → 6 Docs

Commit message format: `type: description — detail (SOLID principle if relevant)`

---

## Documentation Files

- `ASSUMPTIONS.md` — open PM questions + decisions made
- `docs/tradeoffs.md` — SQLite vs Redis, lazy vs eager refresh rationale
- `docs/ai-session.md` — log of meaningful AI interactions and decisions
