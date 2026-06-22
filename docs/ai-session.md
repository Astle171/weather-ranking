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
