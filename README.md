# Weather Activity Ranking Service

A Node.js + GraphQL API that accepts a city name, fetches a 7-day forecast from [Open-Meteo](https://open-meteo.com/) (free, no API key), and returns four activities — **Skiing, Surfing, Outdoor Sightseeing, Indoor Sightseeing** — ranked by suitability with scores, verdicts, and daily breakdowns. Results are cached for 1 hour per city.

**Live:** `https://weather-ranking-production.up.railway.app`

---

## Tech Stack

| Concern | Choice | Why |
|---------|--------|-----|
| Runtime | Node.js 20 + TypeScript (strict) | Type safety end-to-end |
| API | GraphQL — Apollo Server v4 | Flexible query shape, introspection |
| Storage | PostgreSQL via Prisma ORM v7 | Zero-friction swap from SQLite via `IWeatherRepository` interface |
| Testing | Jest + ts-jest | 85 tests, pure scorer functions need no mocks |
| HTTP | native `fetch` | No extra dependency for Node 20 |

---

## Try It (Live)

Send a POST to `https://weather-ranking-production.up.railway.app`:

```bash
curl -X POST https://weather-ranking-production.up.railway.app \
  -H "Content-Type: application/json" \
  -d '{"query":"{ rankActivities(city: \"Innsbruck\") { city country rankings { rank activity overallScore verdict } } }"}'
```

Or open `https://weather-ranking-production.up.railway.app` in a browser — Apollo Sandbox loads automatically.

---

## Example Query

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
      weatherDescription
      snowfallCm
      waveHeightM
    }
  }
}
```

### Example Response (Innsbruck, winter)

```json
{
  "data": {
    "rankActivities": {
      "city": "Innsbruck",
      "country": "Austria",
      "coordinates": { "lat": 47.2654, "lon": 11.3927 },
      "rankings": [
        { "rank": 1, "activity": "SKIING",              "overallScore": 82, "verdict": "EXCELLENT" },
        { "rank": 2, "activity": "OUTDOOR_SIGHTSEEING", "overallScore": 61, "verdict": "GOOD"      },
        { "rank": 3, "activity": "INDOOR_SIGHTSEEING",  "overallScore": 53, "verdict": "FAIR"      },
        { "rank": 4, "activity": "SURFING",             "overallScore": 20, "verdict": "POOR"      }
      ]
    }
  }
}
```

Surfing scores 20 because Innsbruck is landlocked — the marine API returns no data, capping surfing at 20/100 with a clear explanation in `warnings`.

### Verdict Thresholds

| Verdict | Score |
|---------|-------|
| EXCELLENT | ≥ 75 |
| GOOD      | ≥ 55 |
| FAIR      | ≥ 35 |
| POOR      | < 35 |

---

## Running Locally

Requires a PostgreSQL database. Set `DATABASE_URL` in a `.env` file:

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/weather_ranking
```

Then:

```bash
npm install
npx prisma migrate deploy   # creates tables
npm run dev                 # Apollo Server at http://localhost:4000
```

Open **http://localhost:4000** in your browser — Apollo Sandbox opens automatically.

---

## Running Tests

```bash
npm test                                        # all 85 tests
npm test -- --testPathPattern=skiing.scorer     # single file
npm test -- --coverage                          # with coverage report
```

Tests use an `InMemoryWeatherRepository` — no database required.

---

## Architecture

```
GraphQL Query (city: String!)
        │
        ▼
  ActivityRankingResolver
        │  maps result shape, handles errors
        ▼
  ActivityRankingService        ← orchestrates; lazy cache refresh
        │
        ├── GeocodingClient     ← Open-Meteo geocoding API
        ├── IWeatherRepository  ← interface (Prisma in prod, InMemory in tests)
        │     └── OpenMeteoClient (forecast + marine in parallel)
        └── RankingEngine       ← pure: score 4 activities × 7 days, sort, rank
```

---

## Error Handling

| Scenario | GraphQL response |
|----------|-----------------|
| City not found | `BAD_USER_INPUT` error with the city name in the message |
| Open-Meteo API down | `INTERNAL_SERVER_ERROR` — generic message, no stack trace |
| Landlocked city | Not an error — surfing score capped at 20 with explanation |

---

## Assumptions

See [ASSUMPTIONS.md](ASSUMPTIONS.md) for all product decisions (skill level assumed, scoring rationale, cache TTL choice, etc.).

Upfront plan: [docs/plan.md](docs/plan.md)

Engineering trade-offs: [docs/tradeoffs.md](docs/tradeoffs.md)

AI session log: [docs/ai-session.md](docs/ai-session.md)
