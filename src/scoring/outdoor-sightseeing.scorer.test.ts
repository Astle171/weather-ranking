import { scoreDay } from './outdoor-sightseeing.scorer';
import { DayForecast } from './types';

function makeOutdoorDay(overrides: Partial<DayForecast> = {}): DayForecast {
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

describe('OutdoorSightseeingScorer', () => {
  it('should score clear warm day above 85', () => {
    const result = scoreDay(makeOutdoorDay({ weatherCode: 0, maxTempC: 20, windSpeedKmh: 10, sunshineDurationHours: 9 }));
    expect(result.score).toBeGreaterThan(85);
  });

  it('should score storm day below 10', () => {
    const result = scoreDay(makeOutdoorDay({ weatherCode: 95, precipitationMm: 15 }));
    expect(result.score).toBeLessThan(10);
  });

  it('should score light snow above 50 (scenic)', () => {
    const result = scoreDay(makeOutdoorDay({ weatherCode: 71, snowfallCm: 3, maxTempC: -1 }));
    expect(result.score).toBeGreaterThan(50);
  });

  it('should include "Clear skies" highlight for weatherCode 0', () => {
    const result = scoreDay(makeOutdoorDay({ weatherCode: 0 }));
    expect(result.highlights).toContain('Clear skies');
  });

  it('should include "Perfect temperature" for 15-22°C', () => {
    const result = scoreDay(makeOutdoorDay({ maxTempC: 18 }));
    expect(result.highlights).toContain('Perfect temperature');
  });

  it('should warn about rain for RAIN weather group', () => {
    const result = scoreDay(makeOutdoorDay({ weatherCode: 63, precipitationMm: 6 }));
    expect(result.warnings).toContain('Wet conditions');
  });

  it('should warn about strong winds above 45 km/h', () => {
    const result = scoreDay(makeOutdoorDay({ windSpeedKmh: 50 }));
    expect(result.warnings).toContain('Very strong winds');
  });

  it('should include sunshine highlight when sunshineDurationHours > 8', () => {
    const result = scoreDay(makeOutdoorDay({ sunshineDurationHours: 9 }));
    expect(result.highlights).toContain('Plenty of sunshine');
  });
});
