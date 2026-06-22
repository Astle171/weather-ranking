import { classifyWeatherCode } from './weather-code';

describe('classifyWeatherCode', () => {
  it('should classify 0 as CLEAR',          () => expect(classifyWeatherCode(0)).toBe('CLEAR'));
  it('should classify 1 as CLEAR',          () => expect(classifyWeatherCode(1)).toBe('CLEAR'));
  it('should classify 2 as PARTLY_CLOUDY',  () => expect(classifyWeatherCode(2)).toBe('PARTLY_CLOUDY'));
  it('should classify 3 as OVERCAST',       () => expect(classifyWeatherCode(3)).toBe('OVERCAST'));
  it('should classify 45 as FOG',           () => expect(classifyWeatherCode(45)).toBe('FOG'));
  it('should classify 61 as RAIN',          () => expect(classifyWeatherCode(61)).toBe('RAIN'));
  it('should classify 63 as RAIN',          () => expect(classifyWeatherCode(63)).toBe('RAIN'));
  it('should classify 71 as SNOW',          () => expect(classifyWeatherCode(71)).toBe('SNOW'));
  it('should classify 80 as RAIN',          () => expect(classifyWeatherCode(80)).toBe('RAIN'));
  it('should classify 95 as STORM',         () => expect(classifyWeatherCode(95)).toBe('STORM'));
  it('should classify 99 as STORM',         () => expect(classifyWeatherCode(99)).toBe('STORM'));
});
