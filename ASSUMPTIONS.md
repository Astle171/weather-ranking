# Assumptions & Open Questions

## Questions I would ask a PM

1. **Skill level for surfing/skiing?**
   Assumed intermediate — 1-2.5m waves ideal for surfing,
   -2 to -5°C ideal for skiing. Scoring weights adjustable.

2. **Geographic scope?**
   Assumed worldwide. Landlocked cities get surfing capped at 20/100.

3. **How stale can cached data be?**
   Assumed 1 hour — matches Open-Meteo's update frequency.

4. **Rank across the week or per day?**
   Returning both: weekly average rank + daily breakdown per activity.

5. **Should indoor sightseeing score independently or relative to outdoor?**
   Chose relative — indoor scores higher when outdoor is poor.

## Decisions made

- Cache TTL: 1 hour (see docs/tradeoffs.md)
- Marine API failure: silent fallback (surfing capped, not an error)
- City name normalised to lowercase for cache key consistency
