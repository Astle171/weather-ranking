import { DayForecast, DayScore } from './types';
import { classifyWeatherCode, WeatherGroup } from './weather-code';

const BASE_SCORE = 45;
const MAX_SCORE = 95;

function scoreBadWeather(group: WeatherGroup, precipitationMm: number): { bonus: number; highlights: string[] } {
  if (group === 'STORM' && precipitationMm > 5) return { bonus: 35, highlights: ['Perfect day for museums/galleries'] };
  if (group === 'STORM')                        return { bonus: 28, highlights: ['Great day to explore indoors'] };
  if (group === 'RAIN')                         return { bonus: 28, highlights: ['Great day to explore indoors'] };
  if (group === 'DRIZZLE' || group === 'FOG')   return { bonus: 18, highlights: [] };
  if (group === 'OVERCAST')                     return { bonus: 8,  highlights: [] };
  return                                               { bonus: 0,  highlights: [] };
}

function scoreExtremeTemperature(maxTempC: number): { bonus: number; highlights: string[] } {
  if (maxTempC < -5)                      return { bonus: 15, highlights: ['Too cold to be outside long'] };
  if (maxTempC > 33)                      return { bonus: 15, highlights: ['Too hot to be outside long'] };
  if (maxTempC >= 0 && maxTempC <= -5)    return { bonus: 8,  highlights: [] }; // 0 to -5 range (unreachable — covered above)
  if (maxTempC >= 28 && maxTempC <= 33)   return { bonus: 8,  highlights: [] };
  if (maxTempC >= 0 && maxTempC < 5)      return { bonus: 8,  highlights: [] }; // 0 to 5
  return                                         { bonus: 0,  highlights: [] };
}

function applyOutdoorPenalty(group: WeatherGroup, maxTempC: number, precipitationMm: number): number {
  if (group === 'CLEAR' && maxTempC >= 15 && maxTempC <= 25 && precipitationMm === 0) return -10;
  return 0;
}

export function scoreDay(day: DayForecast): DayScore {
  const group       = classifyWeatherCode(day.weatherCode);
  const weather     = scoreBadWeather(group, day.precipitationMm);
  const temperature = scoreExtremeTemperature(day.maxTempC);
  const penalty     = applyOutdoorPenalty(group, day.maxTempC, day.precipitationMm);

  const raw = BASE_SCORE + weather.bonus + temperature.bonus + penalty;
  const score = Math.min(MAX_SCORE, Math.max(BASE_SCORE, raw));

  return {
    date: day.date,
    score,
    highlights: [...weather.highlights, ...temperature.highlights],
    warnings: [],
  };
}
