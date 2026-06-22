export type WeatherGroup =
  | 'CLEAR'
  | 'PARTLY_CLOUDY'
  | 'OVERCAST'
  | 'FOG'
  | 'DRIZZLE'
  | 'RAIN'
  | 'SNOW'
  | 'STORM';

export function classifyWeatherCode(code: number): WeatherGroup {
  if (code <= 1)                              return 'CLEAR';
  if (code === 2)                             return 'PARTLY_CLOUDY';
  if (code === 3)                             return 'OVERCAST';
  if (code === 45 || code === 48)             return 'FOG';
  if (code >= 51 && code <= 57)              return 'DRIZZLE';
  if ((code >= 61 && code <= 67) ||
      (code >= 80 && code <= 82))            return 'RAIN';
  if ((code >= 71 && code <= 77) ||
      (code === 85 || code === 86))          return 'SNOW';
  if (code === 95 || code === 96 ||
      code === 99)                           return 'STORM';

  return 'OVERCAST'; // unknown codes default to overcast
}
