import { DayForecast, DayScore } from './types';
import { classifyWeatherCode } from './weather-code';

function scoreSnowfall(snowfallCm: number): { points: number; highlights: string[]; warnings: string[] } {
  if (snowfallCm >= 15) return { points: 35, highlights: ['Heavy snowfall'],  warnings: [] };
  if (snowfallCm >= 10) return { points: 28, highlights: ['Good snowfall'],   warnings: [] };
  if (snowfallCm >= 5)  return { points: 20, highlights: ['Light snowfall'],  warnings: [] };
  if (snowfallCm >= 1)  return { points: 10, highlights: ['Dusting of snow'], warnings: [] };
  return                       { points: 0,  highlights: [],                  warnings: ['Insufficient snowfall'] };
}

function scoreTemperature(maxTempC: number): { points: number; highlights: string[]; warnings: string[] } {
  if (maxTempC < -15) return { points: 15, highlights: [], warnings: ['Extremely cold — dress appropriately'] };
  if (maxTempC < -10) return { points: 20, highlights: [], warnings: [] };
  if (maxTempC <= -2) return { points: 30, highlights: ['Ideal powder conditions'], warnings: [] };
  if (maxTempC <= 0)  return { points: 25, highlights: ['Good snow temperature'],   warnings: [] };
  if (maxTempC <= 3)  return { points: 15, highlights: [], warnings: [] };
  if (maxTempC <= 6)  return { points: 8,  highlights: [], warnings: [] };
  return                     { points: 0,  highlights: [], warnings: ['Too warm — slushy conditions'] };
}

function scoreWind(windSpeedKmh: number): { points: number; highlights: string[]; warnings: string[] } {
  if (windSpeedKmh < 20)  return { points: 20, highlights: ['Calm conditions'], warnings: [] };
  if (windSpeedKmh <= 35) return { points: 12, highlights: [],                  warnings: [] };
  if (windSpeedKmh <= 50) return { points: 5,  highlights: [],                  warnings: ['Windy conditions'] };
  return                         { points: 0,  highlights: [],                  warnings: ['Dangerous wind speeds — lifts may close'] };
}

function scoreNoRainBonus(day: DayForecast): { points: number; warnings: string[] } {
  const group = classifyWeatherCode(day.weatherCode);
  if (day.precipitationMm === 0 || group === 'SNOW') {
    return { points: 15, warnings: [] };
  }
  return { points: 0, warnings: ['Rain on snow'] };
}

export function scoreDay(day: DayForecast): DayScore {
  const snowfall    = scoreSnowfall(day.snowfallCm);
  const temperature = scoreTemperature(day.maxTempC);
  const wind        = scoreWind(day.windSpeedKmh);
  const noRain      = scoreNoRainBonus(day);

  const score = Math.min(100, Math.max(0,
    snowfall.points + temperature.points + wind.points + noRain.points
  ));

  return {
    date: day.date,
    score,
    highlights: [...snowfall.highlights, ...temperature.highlights, ...wind.highlights],
    warnings:   [...snowfall.warnings,   ...temperature.warnings,   ...wind.warnings, ...noRain.warnings],
  };
}
