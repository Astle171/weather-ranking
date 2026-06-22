# Plan — Weather Activity Ranking Service

Written before writing any code. This is what I gave to Claude Code as context (see CLAUDE.md for full version).

## What I understood from the brief

- Node.js + GraphQL backend (specified)
- Storage: my choice, must justify
- Persist weather data — not call API every request
- Score 4 activities per day for 7 days
- Rank them

## Questions I would ask a PM (before building)

1. What skill level are we targeting for skiing/surfing?
   Assumed intermediate — affects ideal wave height and temperature ranges.

2. Worldwide cities or specific regions?
   Assumed worldwide — need to handle landlocked cities for surfing.

3. How fresh does the data need to be?
   Assumed 1 hour — matches Open-Meteo's update cadence.

4. Is indoor sightseeing scored independently or relative to outdoor?
   Made a call: relative. See ai-session.md for reasoning.

## Architecture decision (made before coding)

Layered: Resolver → Service → IRepository (interface) → Prisma
Scorers: pure functions, no dependencies

Why this matters: scorers are trivially testable, storage is swappable,
service has no knowledge of HTTP or GraphQL.

## Storage decision (made before coding)

SQLite via Prisma (local dev); PostgreSQL in production (Railway).

Rejected Redis: adds external service dependency for a take-home.
SQLite: zero config, Prisma makes the storage layer swappable.
PostgreSQL: used for Railway deployment — the `IWeatherRepository` interface
means this was a single new adapter, no service or scorer changes.

## TDD approach (decided before coding)

Commit order: red → green → refactor. Test file committed before implementation.

Reason: forces the interface to be designed from the consumer's perspective,
not retrofitted. Scorer tests use literal `DayForecast` fixtures — no mocks,
no setup. Service tests use `InMemoryWeatherRepository` — no database.

This is visible in the git history: every `*.test.ts` commit precedes its
paired implementation commit.

## What I prioritised

Phase 3 (scoring engine) over Phase 5 (GraphQL layer).
Reason: the scoring logic is the interesting part. A working scorer
with a basic GraphQL wrapper is more impressive than a polished API
with weak scoring.
