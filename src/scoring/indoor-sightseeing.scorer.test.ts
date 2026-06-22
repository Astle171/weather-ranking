import { scoreDay } from './indoor-sightseeing.scorer';
import { DayForecast } from './types';

function makeIndoorDay(overrides: Partial<DayForecast> = {}): DayForecast {
  return {
    date: '2025-06-15',
    maxTempC: 20,
    minTempC: 14,
    precipitationMm: 0,
    windSpeedKmh: 10,
    snowfallCm: 0,
    weatherCode: 0,
    sunshineDurationHours: 9,
    precipitationHours: 0,
    waveHeightM: null,
    swellHeightM: null,
    ...overrides,
  };
}

describe('IndoorSightseeingScorer', () => {
  it('should always score above 40 even on a perfect outdoor day', () => {
    const result = scoreDay(makeIndoorDay({ weatherCode: 0, maxTempC: 20, precipitationMm: 0 }));
    expect(result.score).toBeGreaterThan(40);
  });

  it('should score higher on stormy day than clear day', () => {
    const storm = scoreDay(makeIndoorDay({ weatherCode: 95, precipitationMm: 20 }));
    const clear = scoreDay(makeIndoorDay({ weatherCode: 0, precipitationMm: 0 }));
    expect(storm.score).toBeGreaterThan(clear.score);
  });

  it('should score higher on rainy day than sunny day', () => {
    const rainy = scoreDay(makeIndoorDay({ weatherCode: 63, precipitationMm: 8 }));
    const sunny = scoreDay(makeIndoorDay({ weatherCode: 0, precipitationMm: 0 }));
    expect(rainy.score).toBeGreaterThan(sunny.score);
  });

  it('should add highlight about museums/galleries on storm days', () => {
    const result = scoreDay(makeIndoorDay({ weatherCode: 95, precipitationMm: 20 }));
    expect(result.highlights).toContain('Perfect day for museums/galleries');
  });

  it('should give extreme cold bonus when maxTempC < -5', () => {
    const freezing = scoreDay(makeIndoorDay({ maxTempC: -8 }));
    const mild     = scoreDay(makeIndoorDay({ maxTempC: 15 }));
    expect(freezing.score).toBeGreaterThan(mild.score);
  });

  it('should give extreme heat bonus when maxTempC > 33', () => {
    const scorching = scoreDay(makeIndoorDay({ maxTempC: 36 }));
    const mild      = scoreDay(makeIndoorDay({ maxTempC: 15 }));
    expect(scorching.score).toBeGreaterThan(mild.score);
  });

  it('should not exceed 95', () => {
    const result = scoreDay(makeIndoorDay({ weatherCode: 95, precipitationMm: 20, maxTempC: -8 }));
    expect(result.score).toBeLessThanOrEqual(95);
  });

  it('should apply outdoor penalty on clear warm day', () => {
    const clear    = scoreDay(makeIndoorDay({ weatherCode: 0, maxTempC: 20, precipitationMm: 0 }));
    const overcast = scoreDay(makeIndoorDay({ weatherCode: 3, maxTempC: 20, precipitationMm: 0 }));
    expect(overcast.score).toBeGreaterThan(clear.score);
  });
});
