# AI Session Log

How I used Claude Code during this build — what it got right, what I corrected, and what I learned about working with AI on a non-trivial engineering task.

This is written from my perspective. "Claude" refers to the AI assistant. "I" is me.

---

## Phase 0 — Scaffold: correcting assumptions about project config

**Prompt I gave:** Create package.json, tsconfig.json, jest config, and a skeleton server. Follow the spec exactly.

**What Claude produced:** A valid scaffold, but with two mistakes. It named the package `"weather-activity-ranking"` instead of `"weather-ranking"`, and put the Jest configuration inside the `"jest"` key of `package.json` instead of a standalone `jest.config.ts`.

**What I changed:** Corrected the package name. Specified that Jest config must be a standalone `jest.config.ts` with `rootDir: './src'`, `testMatch: ['**/*.test.ts']`, and `clearMocks: true`.

**Why it mattered:** Claude defaults to the path of least resistance. A dedicated `jest.config.ts` is easier to extend and keeps `package.json` clean. Small decisions, but they signal whether the engineer is thinking or just shipping.

---

## Phase 0 — Prisma setup: a version mismatch neither of us anticipated

**Prompt I gave:** Add Prisma with SQLite. Create the schema with `CityGeocode` and `WeatherCache` models.

**What Claude produced:** A correct `schema.prisma` including `url = env("DATABASE_URL")` in the datasource block — standard for every Prisma version before v7.

**What I changed:** Nothing initially. The error appeared on `npx prisma migrate dev` — Prisma v7 removed support for `url` inside `schema.prisma`. We removed the line and let `prisma.config.ts` handle it.

**Why it mattered:** A genuine breaking change in the installed version (v7.8.0) that Claude's training data didn't cover. Worth flagging for assessors: the schema looks unusual on purpose, not by mistake.

---

## Phase 1 — Parallel API calls: I spotted the optimisation, Claude introduced a bug implementing it

**Prompt I gave:** The forecast and marine API calls are independent. Can we run them in parallel with `Promise.all`?

**What Claude produced (first attempt):**
```ts
const fetchMarine = fetch(marineUrl).then(...);  // called FIRST
const [forecastResponse, marineData] = await Promise.all([
  fetch(forecastUrl),                             // called SECOND
  fetchMarine,
]);
```
This broke all five tests. JavaScript runs synchronously until the first `await`, so `fetch(marineUrl)` fired before `fetch(forecastUrl)` — but jest mocks were registered forecast-first. Each call consumed the wrong fixture.

**What I changed:** Declared `forecastPromise` first to match mock registration order:
```ts
const forecastPromise = fetch(forecastUrl);        // called FIRST
const marinePromise = fetch(marineUrl).then(...);  // called SECOND
await Promise.all([forecastPromise, marinePromise]);
```

**Why it mattered:** Both run in parallel — neither awaits the other. The difference is purely which `fetch()` fires first on the synchronous call stack. A subtle but real distinction between "parallel execution" and "call order".

---

## Phase 3 — Scoring design: an architectural decision I accepted

**Prompt I gave:** Design the OutdoorSightseeingScorer. STORM weather should score very low regardless of other conditions.

**What Claude produced:** An early-return guard before the additive scoring:
```ts
if (group === 'STORM') {
  return { date: day.date, score: 0, warnings: ['Dangerous weather — stay indoors'] };
}
```

**What I changed:** Nothing — I accepted the approach.

**Why it mattered:** Without the early return, a storm day with warm temperature (+30 pts) and calm wind (+20 pts) scores ~50. STORM is a hard veto that overrides the additive model. Claude made the right call to break the general algorithm for this domain rule rather than trying to encode it as a zero-point weather group.

---

## Phase 3 — Indoor sightseeing: trade-off I asked Claude to explain before accepting

**Prompt I gave:** Indoor sightseeing should always be viable but shouldn't beat outdoor on a perfect day. How do we design this?

**What Claude proposed:** Base 45 (floor), bad-weather bonus up to +35, extreme-temp bonus up to +15, outdoor penalty −10, hard cap at 95.

**I asked:** Why 95 and not 100? Why not score activities independently?

**Claude's reasoning:** If indoor could reach 100, both outdoor and indoor could tie and rank order would be arbitrary. The cap ensures outdoor always wins on a perfect day. The outdoor penalty (−10 for CLEAR + 15–25°C + no rain) creates separation: indoor scores 35 (FAIR) on a perfect day, while outdoor scores 90+.

**What I changed:** Nothing — accepted after understanding the reasoning.

**Why it mattered:** Relative scoring models real behaviour more accurately than independent scores. I would have scored them independently and added a tiebreaker; the cap + penalty approach is structurally cleaner and the 95 limit is intentional, not arbitrary.

---

## Phase 3 — Optimisation scan: a dead branch Claude wrote and missed

**Prompt I gave:** Scan the codebase for correctness issues and optimisations.

**What Claude found:** An impossible condition in `scoreExtremeTemperature`:
```ts
if (maxTempC >= 0 && maxTempC <= -5)  // can never be true
```
The −5 to 0°C range fell through to `bonus: 0` instead of the intended `bonus: 8`. All tests still passed because no test asserted on a temperature in that exact range.

**What Claude fixed:** Changed to `maxTempC >= -5 && maxTempC < 0`.

**Why it mattered:** Scoring was silently wrong for near-freezing temperatures. The bug existed because Claude wrote the original condition and the tests didn't cover the boundary. Found only by specifically looking for unreachable code — a reminder that representative tests aren't the same as exhaustive tests.

---

## Phase 4 — Service implementation: over-engineered, then simplified

**Prompt I gave:** Implement `ActivityRankingService`. Check cache validity, geocode if needed, fetch, save, return result.

**What Claude produced initially:**
```ts
if (!(await this.repo.isCacheValid(normalizedCity))) { /* fetch and save */ }
const cached = (await this.repo.getForecast(normalizedCity))!;  // second read
```
Two separate repository calls on every request — both Map lookups on the same key.

**What I asked:** Can we do this in a single repository read?

**What Claude changed:** Single `getForecast` upfront, expiry checked inline, fresh object held locally after save — no trailing read.

**Why it mattered:** Halves repository operations on the hot path. More importantly it's the right pattern for any store with real I/O cost. Claude's first version was logically correct but structurally wasteful.

---

## Phase 5 — Server wiring: Prisma v7 WASM engine, two wrong paths before the fix

**Prompt I gave:** Wire `server.ts` with real dependencies and start the server.

**What Claude produced:** `new PrismaClient()` — correct for every Prisma version before v7. Crashed with `PrismaClientInitializationError`.

**Attempts that failed:**
1. `new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })` — TypeScript rejected it; property doesn't exist in v7 types.
2. `engineType = "library"` in schema + regenerate — silently ignored, WASM engine still used.

**Fix:** `@prisma/adapter-better-sqlite3` — found by inspecting the package's actual exports at runtime rather than documentation.

**Why it mattered:** Two plausible-looking fixes failed before the working one. Claude's training data didn't cover Prisma v7's adapter requirement. This is a recurring pattern with AI on fast-moving libraries — it knows the API as of its training cutoff, not today.
