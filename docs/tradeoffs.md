# Engineering Trade-offs

Decisions made during this build, with reasoning. Written for assessors who want to understand *why*, not just *what*.

---

## 1. SQLite vs Redis vs PostgreSQL

**Chose: PostgreSQL in production (Railway), SQLite viable locally**

The workload is read-heavy and write-infrequent — a city's cache entry is written once per hour and read on every subsequent request within that window. There are no concurrent writes (single-process Node.js), no cross-service cache invalidation, and no need for pub/sub or TTL eviction built into the store.

**Redis** is the instinctive choice for a cache, but it requires running an external service. For a take-home exercise, a Redis dependency is pure overhead. Redis adds value when you need cross-process cache sharing, sub-millisecond latency at scale, or built-in TTL eviction — none of which apply here.

**SQLite** was the original local choice: zero-infrastructure persistence, survives process restarts, and Prisma abstracts the storage layer. The `IWeatherRepository` interface means switching databases is a single new implementation — no service, scorer, or resolver changes required. Switching to PostgreSQL for deployment was a one-line provider change in `prisma.config.ts` and one migration.

**PostgreSQL** is used in production (Railway) for compatibility with hosted infrastructure. The trade-off vs SQLite is an external service dependency — acceptable when the host provides it managed.

---

## 2. Lazy Cache Refresh vs Background Job

**Chose: lazy refresh (synchronous, on-request)**

Algorithm: check freshness on every request; if stale or missing, fetch fresh data before returning the response.

**Background job** (pre-fetch on a scheduler) would serve faster responses for cities that are already cached, because the refresh happens asynchronously in the background. The cost is complexity: you need a scheduler (cron, BullMQ, etc.), a way to know *which* cities to pre-fetch, and careful handling of the race condition where a request arrives mid-refresh.

**Lazy refresh** handles both cold-cache (first request for a city) and stale-cache (TTL expired) correctly with no scheduler. The first request after a TTL expiry pays a ~200ms penalty for the Open-Meteo round trip; every subsequent request within the hour is instant. For a take-home service without a known traffic pattern, lazy refresh is simpler, correct, and requires no additional infrastructure.

The concrete trade-off: if the same city is queried by 1000 concurrent users at the exact moment the cache expires, all 1000 requests would fan out to Open-Meteo simultaneously (thundering herd). The fix at scale is a refresh lock (see §7).

---

## 3. Marine API Graceful Degradation

**Chose: null wave data → surfing capped at 20, not an error**

The marine API returns HTTP 400 for landlocked cities. Treating this as an error would mean that querying "Paris" or "Zurich" fails entirely — which is wrong. The user asked a valid question; the system knows Paris is landlocked and should score surfing accordingly.

Capping surfing at 20/100 with a `warnings: ["No coastal data — landlocked location"]` explanation is the correct product behaviour: the ranking still works, and the user sees *why* surfing ranked last. Returning an error would force the client to handle a partial failure case and give the user no useful information.

The only scenario where marine failure *should* surface as an error is if a coastal city (e.g. Sydney) gets a marine API failure for an unexpected reason — network error, API outage. This is handled: `fetch` errors propagate as `WeatherFetchError` through to a GraphQL `INTERNAL_SERVER_ERROR`. The distinction is: expected absence of data (landlocked) vs unexpected failure.

---

## 4. Scoring Algorithm — Pure Functions

**Chose: pure `(DayForecast) => DayScore` functions with no I/O**

Each scorer is a stateless function. Given the same `DayForecast`, it always returns the same `DayScore`. No database calls, no external dependencies, no mocking required in tests.

The alternative — embedding scoring logic inside a service with access to config from a database or external source — would allow dynamic weight adjustment but at a significant testing cost. Every scorer test would need the full service stack or complex mocking.

Pure functions mean scorer tests are just data: a `DayForecast` object in, a `DayScore` assertion out. The entire scoring engine (72 tests across 4 scorers) runs in under 1 second with zero setup. The scoring weights are embedded in the functions themselves, which is correct for this exercise — the weights are domain knowledge that changes rarely and should be reviewed as code, not config.

If dynamic weights were a real requirement (A/B testing scoring, per-user customisation), the signature would change to `(day: DayForecast, weights: ScoringWeights) => DayScore` — still pure, still testable, but parameterised.

---

## 5. Indoor Sightseeing Relative Scoring

**Chose: base score of 45, capped at 95, with outdoor-penalty**

Indoor sightseeing is always a reasonable option — museums and galleries exist regardless of weather. The floor of 45/100 reflects this: even on a perfect sunny day, it's still a viable activity.

The cap of 95 (not 100) is deliberate: a perfect outdoor day should beat indoor. If both scored 100, the sort order between them would be arbitrary. The cap ensures that EXCELLENT outdoor weather ranks above indoor sightseeing, which is the correct intuition.

The outdoor penalty (−10 for CLEAR + 15–25°C + no rain) is what creates this separation. On a perfect day, indoor scores 45 + 0 bad-weather bonus − 10 penalty = 35 (FAIR). On a stormy day, indoor scores 45 + 35 bad-weather bonus = 80 (EXCELLENT). This relative scoring models real human behaviour: you go to the museum when it's raining, you go outside when it's sunny.

The alternative — scoring indoor activities on absolute criteria unrelated to outdoor conditions — produces a flat, unhelpful ranking where indoor always scores the same regardless of weather. The whole point of the ranking is to recommend the *best* activity given current conditions.

---

## 6. GraphQL over REST

**Assignment specified GraphQL**, but it is genuinely the right choice here.

The response shape is deeply nested: a ranking result contains rankings, each ranking contains daily scores, each day has highlights and warnings. A single REST endpoint would either return everything (over-fetching for clients that only need the summary) or require multiple endpoints with client-side joining.

GraphQL lets the client specify exactly what it needs. A mobile app showing only the top-ranked activity requests `rankings { activity verdict }`. A dashboard showing the full 7-day breakdown requests `dailyScores { date score highlights warnings }`. The server does the same work; the wire payload shrinks.

Introspection is also useful during development — Apollo Sandbox at `localhost:4000` gives an always-accurate, self-documenting API explorer with no extra tooling.

The cost of GraphQL is resolver complexity and the N+1 problem (not applicable here since all data is fetched upfront in the service layer, not per-field). For a simple query-only API with no mutations, GraphQL adds schema boilerplate but not architectural complexity.

---

## 7. What Would Change at Production Scale

This service is correct and complete for a take-home exercise. At production scale, these specific things would change:

**Storage:** Replace SQLite with PostgreSQL (or CockroachDB for global distribution). The `IWeatherRepository` interface means this is a single new implementation — no service, scorer, or resolver changes required.

**Cache refresh:** Add a distributed lock (Redis `SETNX`, or a Postgres advisory lock) around the refresh path to prevent thundering herd. Only the first request to acquire the lock triggers a fetch; concurrent requests wait and read the refreshed value.

**Weather client resilience:** Open-Meteo's free tier has rate limits. At scale, add retry with exponential backoff and a circuit breaker. Consider caching at the CDN edge for popular cities.

**Process model:** SQLite cannot be shared across multiple Node.js processes. Move to PostgreSQL and run multiple replicas behind a load balancer. The service is stateless beyond the database connection — no in-process state to migrate.

**Geocode cache:** `CityGeocode` has no TTL. City coordinates don't change, so this is fine for this exercise. If the schema expanded to include timezone or regional metadata, a periodic refresh strategy would be needed.

**Observability:** Add structured logging (city, cache hit/miss, Open-Meteo latency per call), metrics (p99 response time, cache hit rate by city), and distributed tracing. The service layer is the right injection point — each `rankActivities` call already has all the context needed.
