import { DayForecast, DayScore } from './types';
import { classifyWeatherCode, WeatherGroup } from './weather-code';

function scoreWeatherGroup(group: WeatherGroup): { points: number; highlights: string[]; warnings: string[] } {
  switch (group) {
    case 'CLEAR':         return { points: 40, highlights: ['Clear skies'],              warnings: [] };
    case 'PARTLY_CLOUDY': return { points: 32, highlights: ['Mostly sunny'],             warnings: [] };
    case 'OVERCAST':      return { points: 20, highlights: [],                           warnings: [] };
    case 'SNOW':          return { points: 22, highlights: ['Scenic winter conditions'], warnings: [] };
    case 'FOG':           return { points: 10, highlights: [],                           warnings: ['Low visibility'] };
    case 'DRIZZLE':       return { points: 8,  highlights: [],                           warnings: ['Light rain — bring an umbrella'] };
    case 'RAIN':          return { points: 0,  highlights: [],                           warnings: ['Wet conditions'] };
    case 'STORM':         return { points: 0,  highlights: [],                           warnings: ['Dangerous weather — stay indoors'] };
  }
}

function scoreTemperature(maxTempC: number): { points: number; highlights: string[]; warnings: string[] } {
  if (maxTempC >= 15 && maxTempC <= 22) return { points: 30, highlights: ['Perfect temperature'],   warnings: [] };
  if (maxTempC >  22 && maxTempC <= 28) return { points: 25, highlights: ['Warm and pleasant'],     warnings: [] };
  if (maxTempC >= 10)                   return { points: 22, highlights: [],                        warnings: [] };
  if (maxTempC >= 5)                    return { points: 14, highlights: [],                        warnings: ['Cool — dress in layers'] };
  if (maxTempC >= 0)                    return { points: 8,  highlights: [],                        warnings: ['Cold conditions'] };
  if (maxTempC > 28)                    return { points: 15, highlights: [],                        warnings: ['Very hot — stay hydrated'] };
  return                                       { points: 4,  highlights: [],                        warnings: ['Freezing temperatures'] };
}

function scoreWind(windSpeedKmh: number): { points: number; highlights: string[]; warnings: string[] } {
  if (windSpeedKmh < 15)  return { points: 20, highlights: ['Calm conditions'], warnings: [] };
  if (windSpeedKmh <= 30) return { points: 14, highlights: [],                  warnings: [] };
  if (windSpeedKmh <= 45) return { points: 6,  highlights: [],                  warnings: ['Windy'] };
  return                         { points: 0,  highlights: [],                  warnings: ['Very strong winds'] };
}

function scoreSunshine(hours: number): { points: number; highlights: string[] } {
  if (hours > 8)  return { points: 10, highlights: ['Plenty of sunshine'] };
  if (hours >= 5) return { points: 7,  highlights: [] };
  if (hours >= 2) return { points: 4,  highlights: [] };
  return                 { points: 0,  highlights: [] };
}

export function scoreDay(day: DayForecast): DayScore {
  const group = classifyWeatherCode(day.weatherCode);

  // Storm: outdoor sightseeing is unsafe regardless of other conditions
  if (group === 'STORM') {
    return {
      date: day.date,
      score: 0,
      highlights: [],
      warnings: ['Dangerous weather — stay indoors'],
    };
  }

  const weather   = scoreWeatherGroup(group);
  const temp      = scoreTemperature(day.maxTempC);
  const wind      = scoreWind(day.windSpeedKmh);
  const sunshine  = scoreSunshine(day.sunshineDurationHours);

  const score = Math.min(100, Math.max(0,
    weather.points + temp.points + wind.points + sunshine.points
  ));

  return {
    date: day.date,
    score,
    highlights: [...weather.highlights, ...temp.highlights, ...wind.highlights, ...sunshine.highlights],
    warnings:   [...weather.warnings,   ...temp.warnings,   ...wind.warnings],
  };
}
