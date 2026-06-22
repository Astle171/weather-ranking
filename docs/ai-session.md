# AI Session Log

Decisions, mistakes, and corrections made during this build.
Format: phase → what happened → why it mattered.

---

## Phase 0 — Scaffold

### Claude used the wrong package name
- **What happened:** Claude named the package `"weather-activity-ranking"` in package.json.
- **Correction:** I changed it back to `"weather-ranking"` to match the repository name.

### Claude inlined Jest config instead of creating a separate file
- **What happened:** Claude put the Jest config inside the `"jest"` key of package.json instead of creating `jest.config.ts`.
- **Correction:** I specified a standalone `jest.config.ts` with `rootDir`, `testMatch`, and `clearMocks: true`.
- **Why it mattered:** A dedicated config file is more explicit and easier to extend.

### Prisma v7 breaking change — discovered during setup
- **What happened:** Running `npx prisma init` installed v7.8.0. Prisma v7 removed support for `url = env("DATABASE_URL")` in `schema.prisma` — the connection URL now belongs exclusively in the generated `prisma.config.ts`.
- **Decision:** We removed the `url` line from the datasource block and let `prisma.config.ts` handle it via `process.env["DATABASE_URL"]`, loaded from `.env`.
- **Why it mattered:** Without this fix, `prisma migrate dev` throws a P1012 validation error. Worth documenting so the assessor understands we're running Prisma v7, not v5.

---

## Phase 1 — Weather Clients

### I spotted that forecast and marine calls could run in parallel — Claude introduced a mock order bug while implementing it
- **What happened:** Claude's initial implementation fetched forecast and marine sequentially. I noticed the two calls are completely independent and asked Claude to parallelise them with `Promise.all`.
- **Claude's first attempt had a bug:**
  ```ts
  const fetchMarine = fetch(marineUrl).then(...)   // fired FIRST
  const [forecastResponse, marineData] = await Promise.all([
    fetch(forecastUrl),                            // fired SECOND
    fetchMarine,
  ]);
  ```
  JavaScript executes synchronously before hitting `await`, so `fetch(marineUrl)` was called before `fetch(forecastUrl)`. The test mocks were registered forecast-first, marine-second — so each call consumed the wrong fixture and all 5 tests broke.
- **Fix:** Declare `forecastPromise` first so it consumes the first mock:
  ```ts
  const forecastPromise = fetch(forecastUrl);       // fired FIRST
  const marinePromise = fetch(marineUrl).then(...)  // fired SECOND
  await Promise.all([forecastPromise, marinePromise]);
  ```
- **Why it mattered:** Both calls still run in parallel — neither is awaited before the other starts. But synchronous declaration order must match the test mock registration order. A subtle distinction between "parallel execution" and "call order".

---

## Post Phase 3 — Optimisation Scan

### I asked Claude to scan for optimisations — it found a correctness bug and two reliability gaps

**Correctness bug in `indoor-sightseeing.scorer.ts`:**
- **What happened:** Claude's `scoreExtremeTemperature` function had an impossible condition: `maxTempC >= 0 && maxTempC <= -5`. A number cannot be both ≥ 0 and ≤ -5 simultaneously, so that branch was always dead. The -5 to 0°C range fell through to the default `bonus: 0` instead of getting the intended `bonus: 8`.
- **Fix:** Changed to `maxTempC >= -5 && maxTempC < 0`.
- **Why it mattered:** The scoring logic was silently wrong for near-freezing temperatures. All existing tests still passed because no test used a temperature in the -5 to 0 range as the primary assertion — the bug had been hiding behind test gaps.

**Missing `response.ok` guards in weather clients:**
- **What happened:** The marine API fetch correctly checked `r.ok` before parsing, but the forecast fetch (`open-meteo.client.ts`) and geocoding fetch (`geocoding.client.ts`) called `.json()` directly without checking the HTTP status code first. A 4xx or 5xx response with a JSON error body would be silently cast to the expected type and produce garbage data downstream.
- **Fix:** Added `if (!response.ok) throw new WeatherFetchError(...)` before `.json()` in both clients.
- **Why it mattered:** The inconsistency was easy to miss because the marine path was already correct. The forecast and geocoding paths were subtly more fragile — they would not throw a meaningful error on API failure, making outages very hard to diagnose.

---

## Phase 5 — GraphQL + Server Wiring

### Prisma v7 WASM engine requires a driver adapter — `new PrismaClient()` no longer works

- **What happened:** When wiring the real server in Phase 5, `npm run dev` crashed immediately with `PrismaClientInitializationError: PrismaClient needs to be constructed with a non-empty, valid PrismaClientOptions`. `new PrismaClient()` with no arguments had always worked in prior Prisma versions.
- **Root cause:** Prisma v7 changed the default engine from the native binary (`library`) to a WASM-based query compiler (`client`). The WASM engine has no way to resolve a database URL on its own — it requires either an Accelerate proxy URL or a driver adapter. Without one, the constructor throws.
- **Attempts that failed:**
  - `new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })` — TypeScript rejected it; `datasourceUrl` is not in the v7 types.
  - `engineType = "library"` in `schema.prisma` + `prisma generate` — the option was silently ignored; the generated client still used the WASM engine and had no native binary bundled.
- **Fix:** Installed `@prisma/adapter-better-sqlite3` and `better-sqlite3`. Updated `src/lib/prisma.ts` to use the factory adapter:
  ```ts
  const adapter = new PrismaBetterSqlite3({ url: dbPath });
  const prisma = new PrismaClient({ adapter });
  ```
  The `url` field takes a plain file path (no `file:` prefix), so the `.env` value is stripped before passing.
- **Why it mattered:** This is a silent breaking change in Prisma v7 that affects any project using SQLite without a connection URL in `schema.prisma`. The migration guide documents it but only for users who explicitly upgrade. Worth flagging for the assessor since it required investigation mid-phase.

---

## Phase 4 — ActivityRankingService

### Double repository lookup on every request — eliminated

- **What happened:** The initial implementation of `ActivityRankingService.rankActivities` called `isCacheValid(city)` and then, separately, `getForecast(city)` — two Map lookups on the same key for every request, even cache hits. In the cache-miss path there was also a trailing `getForecast` after `saveForecast`, reading back data we'd just constructed.
- **Fix:** Replaced the pair of calls with a single `getForecast` upfront. Validity is now checked inline with `isCacheExpired(cached.expiresAt)`. In the miss path, the freshly-built `CachedForecast` object is held in the local `cached` variable after saving, so no trailing read is needed.
- **Why it mattered:** Halves the repository operations on the hot path (cache hit: 2 → 1). The pattern — fetch once, check freshness, reuse the object — is also how you'd write this against a real database where each call has real I/O cost.
