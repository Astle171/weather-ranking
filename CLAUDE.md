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
npm run dev                            # start Apollo Server (ts-node src/graphql/server.ts)
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
| Storage  | SQLite via Prisma ORM |
| Testing  | Jest + ts-jest |
| HTTP     | native fetch (Node 20) |

**Why SQLite over Redis:** read-heavy/write-infrequent workload, single-process Node, zero infrastructure, Prisma abstracts it (Postgres = 1-line change). Redis rejected because it adds an external service dependency for a take-home exercise.

---

## Architecture

```
GraphQL Query
     │
     ▼
ActivityRankingResolver
     │
     ▼
ActivityRankingService         ← orchestrates everything
     │
     ├── GeocodingClient        ← Open-Meteo geocoding API
     │
     ├── IWeatherRepository     ← interface (Dependency Inversion)
     │    ├── InMemoryWeatherRepository   (tests only)
     │    └── PrismaWeatherRepository     (production)
     │         └── OpenMeteoClient        ← forecast + marine APIs
     │
     └── ScoringEngine          ← pure functions, no side effects
          ├── SkiingScorer
          ├── SurfingScorer
          ├── OutdoorSightseeingScorer
          └── IndoorSightseeingScorer
```

**Dependency rules:**
- Service depends on `IWeatherRepository` interface, never on Prisma directly
- Scorers are pure `(DayForecast) => DayScore` — no I/O, no mocks needed in tests
- Prisma imported only inside `PrismaWeatherRepository`

---

## Key Domain Types (`src/scoring/types.ts`)

- `DayForecast` — one day of weather (temp, wind, snow, wave height, WMO code, sunshine)
- `DayScore` — `{ score: 0–100, highlights: string[], warnings: string[] }`
- `ActivityRanking` — `{ rank, overallScore, verdict, reasoning, dailyScores[] }`
- `RankingResult` — top-level response: `{ city, country, generatedAt, cacheExpiresAt, rankings[], forecast[] }`
- `Verdict` — `EXCELLENT (≥75) | GOOD (≥55) | FAIR (≥35) | POOR (<35)`

---

## Cache Strategy

**Lazy refresh on-request (synchronous):** check `WeatherCache`, fetch+store if missing or expired, return immediately if fresh. TTL = **1 hour** (matches Open-Meteo's update cadence). City name normalised to lowercase as cache key.

Rationale for lazy over background job: no scheduler/race conditions, works correctly for cold-cache. Documented trade-off in `docs/tradeoffs.md`.

---

## Edge Cases

| Scenario | Behaviour |
|---|---|
| Landlocked city (no marine data) | Marine API 400 → `waveHeightM: null` → surfing capped at 20/100 |
| City not found | `GeocodingClient` throws `CityNotFoundError` → surfaced as GraphQL error |
| Open-Meteo down | `WeatherFetchError` → meaningful error, no stack trace |
| Malformed city name | Validate before hitting any API |

---

## Database Schema (`prisma/schema.prisma`)

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
  cityName     String   @unique
  lat          Float
  lon          Float
  forecastJson String   // JSON-serialised DayForecast[]
  marineJson   String?  // null for landlocked cities
  cachedAt     DateTime @default(now())
  expiresAt    DateTime // cachedAt + 1 hour
}
```

---

## Open-Meteo Endpoints

- **Geocoding:** `https://geocoding-api.open-meteo.com/v1/search?name={city}&count=1&language=en`
- **Forecast:** `https://api.open-meteo.com/v1/forecast?latitude=…&longitude=…&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,snowfall_sum,weather_code,sunshine_duration,precipitation_hours&timezone=auto&forecast_days=7`
- **Marine:** `https://marine-api.open-meteo.com/v1/marine?…&daily=wave_height_max,wind_wave_height_max,swell_wave_height_max&forecast_days=7` — returns 400 for landlocked, handle gracefully

---

## Scoring Overview

All scorers are pure functions in `src/scoring/`. Scoring weights are fully documented there. Key design decisions:

- **Skiing:** snowfall (35 pts) + temperature (30) + wind (20) + no-rain bonus (15). Max 100.
- **Surfing:** wave height (40) + wind (30) + precipitation (20) + temp comfort (10). Capped at 20 when `waveHeightM` is null. Max 100.
- **Outdoor sightseeing:** WMO weather group (40) + temperature (30) + wind (20) + sunshine (10). Max 100.
- **Indoor sightseeing:** base 45 + bad-weather bonus (35) + extreme-temp bonus (15) − ideal-outdoor penalty (10). Max 95 deliberately, so perfect outdoor weather beats indoor.

WMO code groups: `CLEAR(0,1)` `PARTLY_CLOUDY(2)` `OVERCAST(3)` `FOG(45,48)` `DRIZZLE(51–57)` `RAIN(61–67,80–82)` `SNOW(71–77,85–86)` `STORM(95,96,99)`

---

## TDD Discipline

Commit order: **red → green → refactor**. Test file committed before implementation file.
- Scorer tests use literal `DayForecast` fixtures — no mocks (pure functions)
- Service tests use `InMemoryWeatherRepository` — no DB calls

**Phases:** 0 Scaffold → 1 Weather clients → 2 Repository → 3 Scoring → 4 Service → 5 GraphQL → 6 Docs

Commit message format: `type: description — detail (SOLID principle if relevant)`

---

## Documentation Files

- `ASSUMPTIONS.md` — open PM questions + decisions made
- `docs/tradeoffs.md` — SQLite vs Redis, lazy vs eager refresh rationale
- `docs/ai-session.md` — log of meaningful AI interactions and decisions
