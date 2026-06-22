# Weather Activity Ranking Service

A Node.js + GraphQL backend that takes a city name and ranks four activities — **Skiing, Surfing, Outdoor Sightseeing, Indoor Sightseeing** — based on the 7-day weather forecast from [Open-Meteo](https://open-meteo.com/) (free, no API key required).

---

## Setup & Running

```bash
npm install
npx prisma migrate dev --name init   # creates the SQLite database
npm run dev                          # starts Apollo Server at http://localhost:4000
```

Run tests:

```bash
npm test                                          # all tests
npm test -- --testPathPattern=skiing.scorer       # single test file
```

---

## Tech Stack

| Concern  | Choice |
|----------|--------|
| Runtime  | Node.js 20 + TypeScript (strict) |
| API      | GraphQL — Apollo Server v4 |
| Storage  | SQLite via Prisma ORM |
| Testing  | Jest + ts-jest |
| HTTP     | native `fetch` (Node 20) |

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

**Key dependency rules:**
- `ActivityRankingService` depends on `IWeatherRepository` (interface), never on Prisma directly
- Scorers are pure `(DayForecast) => DayScore` functions — no I/O, fully deterministic
- Prisma is imported only inside `PrismaWeatherRepository`

---

## Why SQLite

The workload is read-heavy, write-infrequent (cache refreshes every hour). With a single-process Node.js service there are no write-concurrency issues, and SQLite needs zero infrastructure — `npm install` is enough to run it.

Prisma abstracts the database layer so switching to Postgres for production is a one-line change in `schema.prisma`.

**Alternative considered:** Redis — rejected because it adds an external service dependency with no benefit for a single-process take-home exercise. For production at scale, Redis or a Bull queue with background refresh would be the right call (documented in [docs/tradeoffs.md](docs/tradeoffs.md)).

---

## Cache Strategy

**Lazy refresh (synchronous on-request):**

1. Check `WeatherCache` for the city
2. If missing or `expiresAt < now()` → fetch from Open-Meteo, store, return fresh data
3. If fresh → return cached data immediately

**TTL: 1 hour** — matches Open-Meteo's forecast update frequency. City names are normalised to lowercase as the cache key.

Trade-off: a background job would serve cached-city requests faster by pre-fetching. For this exercise the added scheduler complexity isn't justified. The lazy approach handles cold-cache and stale-cache correctly with no race conditions.

---

## Scoring

All scorers are pure functions in `src/scoring/`. Each receives a `DayForecast` and returns `{ score: 0–100, highlights: string[], warnings: string[] }`. The final rank is the 7-day average score.

### Skiing (max 100)

| Factor | Weight | Notes |
|--------|--------|-------|
| Snowfall | 35 pts | ≥15cm → 35, 10–15cm → 28, 5–10cm → 20, 1–5cm → 10, <1cm → 0 |
| Temperature | 30 pts | −10 to −2°C ideal; >6°C → 0 (slushy) |
| Wind | 20 pts | <20 km/h → 20; >50 km/h → 0 (lifts may close) |
| No-rain bonus | 15 pts | No precipitation or snow-only weather code |

### Surfing (max 100, capped at 20 for landlocked cities)

| Factor | Weight | Notes |
|--------|--------|-------|
| Wave height | 40 pts | 1.0–2.5m ideal; null marine data → 0 + "landlocked" warning |
| Wind | 30 pts | <15 km/h glassy; >40 km/h rough |
| Precipitation | 20 pts | 0mm → 20, <2mm → 10, ≥2mm → 0 |
| Temperature | 10 pts | >20°C comfort bonus |

When the marine API returns no data (landlocked city), the total is capped at 20/100 — not an error, just a low score with a clear explanation.

### Outdoor Sightseeing (max 100)

| Factor | Weight | Notes |
|--------|--------|-------|
| WMO weather group | 40 pts | CLEAR → 40; STORM/RAIN → 0 |
| Temperature | 30 pts | 15–22°C perfect; <0°C → 4 |
| Wind | 20 pts | <15 km/h → 20; >45 km/h → 0 |
| Sunshine duration | 10 pts | >8hrs → 10 |

### Indoor Sightseeing (max 95)

Deliberately capped at 95 so perfect outdoor weather beats indoor.

| Factor | Points | Notes |
|--------|--------|-------|
| Base score | 45 | Always a viable option |
| Bad-weather bonus | +35 | STORM → 35; RAIN/heavy SNOW → 28; DRIZZLE/FOG → 18 |
| Extreme-temp bonus | +15 | <−5°C or >33°C → 15 |
| Ideal-outdoor penalty | −10 | CLEAR + 15–25°C + no rain |

**WMO code groups:** `CLEAR(0,1)` `PARTLY_CLOUDY(2)` `OVERCAST(3)` `FOG(45,48)` `DRIZZLE(51–57)` `RAIN(61–67,80–82)` `SNOW(71–77,85–86)` `STORM(95,96,99)`

---

## GraphQL API

### Example Query

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

### Expected Shape (Innsbruck in winter)

```json
{
  "data": {
    "rankActivities": {
      "city": "Innsbruck",
      "country": "Austria",
      "rankings": [
        { "rank": 1, "activity": "SKIING",               "verdict": "EXCELLENT", "overallScore": 82 },
        { "rank": 2, "activity": "OUTDOOR_SIGHTSEEING",  "verdict": "GOOD",      "overallScore": 68 },
        { "rank": 3, "activity": "INDOOR_SIGHTSEEING",   "verdict": "FAIR",      "overallScore": 55 },
        { "rank": 4, "activity": "SURFING",              "verdict": "POOR",      "overallScore": 8  }
      ]
    }
  }
}
```

### Verdict Thresholds

| Verdict   | Score     |
|-----------|-----------|
| EXCELLENT | ≥ 75      |
| GOOD      | ≥ 55      |
| FAIR      | ≥ 35      |
| POOR      | < 35      |

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| City not found | `CityNotFoundError` → clear GraphQL error message |
| Open-Meteo API down | `WeatherFetchError` → meaningful error, no stack trace |
| Landlocked city (no marine data) | Marine API 400/empty → `waveHeightM: null` → surfing capped at 20/100 silently |
| Malformed city name | Validated before any API call |

---

## Assumptions

See [ASSUMPTIONS.md](ASSUMPTIONS.md) for the full list. Key decisions:

- **Skill level:** intermediate assumed — 1–2.5m waves ideal for surfing, −2 to −10°C ideal for skiing
- **Geographic scope:** worldwide; landlocked cities get surfing capped at 20/100 with explanation
- **Cache staleness:** 1 hour matches Open-Meteo's update frequency
- **Ranking scope:** weekly average, with per-day breakdown also returned
- **Indoor vs outdoor:** indoor scores relative to outdoor conditions (higher when outdoor is poor)

---

## How I Worked

AI session log: [docs/ai-session.md](docs/ai-session.md)

Engineering trade-offs: [docs/tradeoffs.md](docs/tradeoffs.md)
