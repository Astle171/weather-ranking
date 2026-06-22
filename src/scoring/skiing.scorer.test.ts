import { scoreDay } from './skiing.scorer';
import { DayForecast } from './types';

function makeForecastDay(overrides: Partial<DayForecast> = {}): DayForecast {
  return {
    date: '2025-01-15',
    maxTempC: -3,
    minTempC: -8,
    snowfallCm: 15,
    precipitationMm: 0,
    windSpeedKmh: 12,
    weatherCode: 71,
    sunshineDurationHours: 4,
    precipitationHours: 0,
    waveHeightM: null,
    swellHeightM: null,
    ...overrides,
  };
}

describe('SkiingScorer', () => {
  describe('perfect ski day', () => {
    it('should score above 85 with heavy snow, cold temp, calm wind', () => {
      const result = scoreDay(makeForecastDay());
      expect(result.score).toBeGreaterThan(85);
    });

    it('should include "Heavy snowfall" in highlights', () => {
      const result = scoreDay(makeForecastDay());
      expect(result.highlights).toContain('Heavy snowfall');
    });

    it('should include "Ideal powder conditions" in highlights', () => {
      const result = scoreDay(makeForecastDay());
      expect(result.highlights).toContain('Ideal powder conditions');
    });

    it('should have empty warnings array', () => {
      const result = scoreDay(makeForecastDay());
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('snowfall scoring', () => {
    it('should score snowfallCm >= 15 highest', () => {
      const heavy = scoreDay(makeForecastDay({ snowfallCm: 15 }));
      const light = scoreDay(makeForecastDay({ snowfallCm: 5 }));
      expect(heavy.score).toBeGreaterThan(light.score);
    });

    it('should score snowfallCm < 1 as 0 points for snowfall component', () => {
      const noSnow = scoreDay(makeForecastDay({ snowfallCm: 0 }));
      const heavySnow = scoreDay(makeForecastDay({ snowfallCm: 15 }));
      expect(heavySnow.score - noSnow.score).toBe(35);
    });

    it('should add warning "Insufficient snowfall" when snowfallCm < 1', () => {
      const result = scoreDay(makeForecastDay({ snowfallCm: 0 }));
      expect(result.warnings).toContain('Insufficient snowfall');
    });
  });

  describe('temperature scoring', () => {
    it('should score maxTempC > 6 lowest — add warning about slush', () => {
      const warm = scoreDay(makeForecastDay({ maxTempC: 8 }));
      const cold = scoreDay(makeForecastDay({ maxTempC: -3 }));
      expect(warm.score).toBeLessThan(cold.score);
    });

    it('should add warning "Too warm — slushy conditions" when maxTempC > 6', () => {
      const result = scoreDay(makeForecastDay({ maxTempC: 8 }));
      expect(result.warnings).toContain('Too warm — slushy conditions');
    });

    it('should add warning "Extremely cold" when maxTempC < -15', () => {
      const result = scoreDay(makeForecastDay({ maxTempC: -18 }));
      expect(result.warnings).toContain('Extremely cold — dress appropriately');
    });
  });

  describe('wind scoring', () => {
    it('should add warning about lift closure when windSpeedKmh > 50', () => {
      const result = scoreDay(makeForecastDay({ windSpeedKmh: 60 }));
      expect(result.warnings).toContain('Dangerous wind speeds — lifts may close');
    });

    it('should score calm wind (< 20 km/h) highest', () => {
      const calm = scoreDay(makeForecastDay({ windSpeedKmh: 10 }));
      const gusty = scoreDay(makeForecastDay({ windSpeedKmh: 40 }));
      expect(calm.score).toBeGreaterThan(gusty.score);
    });
  });

  describe('rain penalty', () => {
    it('should add warning "Rain on snow" when precipitationMm > 0 and weatherCode is RAIN', () => {
      const result = scoreDay(makeForecastDay({ precipitationMm: 5, weatherCode: 61 }));
      expect(result.warnings).toContain('Rain on snow');
    });

    it('should give full no-rain bonus when precipitationMm is 0', () => {
      const dry = scoreDay(makeForecastDay({ precipitationMm: 0 }));
      const wet = scoreDay(makeForecastDay({ precipitationMm: 5, weatherCode: 61 }));
      expect(dry.score - wet.score).toBe(15);
    });
  });
});
