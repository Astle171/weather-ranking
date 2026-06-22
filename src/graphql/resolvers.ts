import { GraphQLError } from 'graphql';
import { ActivityRankingService } from '../services/activity-ranking.service';
import { CityNotFoundError } from '../shared/errors/city-not-found.error';
import { classifyWeatherCode, WeatherGroup } from '../scoring/weather-code';
import { DayForecast } from '../scoring/types';

const WEATHER_DESCRIPTIONS: Record<WeatherGroup, string> = {
  CLEAR:         'Clear skies',
  PARTLY_CLOUDY: 'Partly cloudy',
  OVERCAST:      'Overcast',
  FOG:           'Foggy',
  DRIZZLE:       'Light drizzle',
  RAIN:          'Rain',
  SNOW:          'Snow',
  STORM:         'Thunderstorm',
};

function mapForecastDay(day: DayForecast) {
  return {
    date:             day.date,
    maxTempC:         day.maxTempC,
    minTempC:         day.minTempC,
    precipitationMm:  day.precipitationMm,
    windSpeedKmh:     day.windSpeedKmh,
    snowfallCm:       day.snowfallCm,
    weatherDescription: WEATHER_DESCRIPTIONS[classifyWeatherCode(day.weatherCode)],
    waveHeightM:      day.waveHeightM,
    swellHeightM:     day.swellHeightM,
  };
}

export function createResolvers(service: ActivityRankingService) {
  return {
    Query: {
      rankActivities: async (_: unknown, args: { city: string }) => {
        try {
          const result = await service.rankActivities(args.city);
          return {
            city:           result.city,
            country:        result.country,
            coordinates:    { lat: result.lat, lon: result.lon },
            generatedAt:    result.generatedAt,
            cacheExpiresAt: result.cacheExpiresAt,
            rankings:       result.rankings,
            forecast:       result.forecast.map(mapForecastDay),
          };
        } catch (err) {
          if (err instanceof CityNotFoundError) {
            throw new GraphQLError(err.message, {
              extensions: { code: 'BAD_USER_INPUT' },
            });
          }
          throw new GraphQLError('Failed to fetch weather data. Please try again later.', {
            extensions: { code: 'INTERNAL_SERVER_ERROR' },
          });
        }
      },
    },
  };
}
