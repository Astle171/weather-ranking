import { scoreDay } from './surfing.scorer';
import { DayForecast } from './types';

function makeSurfDay(overrides: Partial<DayForecast> = {}): DayForecast {
  return {
    date: '2025-06-15',
    maxTempC: 22,
    minTempC: 17,
    precipitationMm: 0,
    windSpeedKmh: 10,
    snowfallCm: 0,
    weatherCode: 0,
    sunshineDurationHours: 8,
    precipitationHours: 0,
    waveHeightM: 1.5,
    swellHeightM: 1.2,
    ...overrides,
  };
}

describe('SurfingScorer', () => {
  it('should score ideal surf day above 80', () => {
    const result = scoreDay(makeSurfDay({ waveHeightM: 1.5, windSpeedKmh: 10, precipitationMm: 0, maxTempC: 22 }));
    expect(result.score).toBeGreaterThan(80);
  });

  it('should cap score at 20 when waveHeightM is null', () => {
    const result = scoreDay(makeSurfDay({ waveHeightM: null, swellHeightM: null }));
    expect(result.score).toBeLessThanOrEqual(20);
    expect(result.warnings).toContain('No coastal data — landlocked location');
  });

  it('should include "Ideal wave height" highlight for 1-2.5m waves', () => {
    const result = scoreDay(makeSurfDay({ waveHeightM: 1.8 }));
    expect(result.highlights).toContain('Ideal wave height');
  });

  it('should warn about flat conditions when waveHeightM < 0.3', () => {
    const result = scoreDay(makeSurfDay({ waveHeightM: 0.1 }));
    expect(result.warnings).toContain('Flat — poor surfing conditions');
  });

  it('should warn about extremely large surf when waveHeightM > 4', () => {
    const result = scoreDay(makeSurfDay({ waveHeightM: 5 }));
    expect(result.warnings).toContain('Extremely large surf — experts only');
  });

  it('should warn about choppy conditions when windSpeedKmh > 40', () => {
    const result = scoreDay(makeSurfDay({ windSpeedKmh: 45 }));
    expect(result.warnings).toContain('Onshore winds — rough conditions');
  });

  it('should give full precipitation bonus when precipMm is 0', () => {
    const dry = scoreDay(makeSurfDay({ precipitationMm: 0 }));
    const wet = scoreDay(makeSurfDay({ precipitationMm: 5 }));
    expect(dry.score - wet.score).toBe(20);
  });

  it('should warn about cold water when maxTempC < 15', () => {
    const result = scoreDay(makeSurfDay({ maxTempC: 12 }));
    expect(result.warnings).toContain('Cold water — full wetsuit recommended');
  });
});
