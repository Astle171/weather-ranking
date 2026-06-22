import prisma from '../lib/prisma';
import { IWeatherRepository, CachedForecast } from './weather.repository.interface';
import { DayForecast } from '../scoring/types';
import { buildExpiresAt, isCacheExpired } from './cache-policy';

export class PrismaWeatherRepository implements IWeatherRepository {
  async getForecast(cityName: string): Promise<CachedForecast | null> {
    const record = await prisma.weatherCache.findUnique({
      where: { cityName: cityName.toLowerCase() },
    });

    if (!record) return null;

    return {
      cityName: record.cityName,
      lat: record.lat,
      lon: record.lon,
      country: record.country,
      forecast: JSON.parse(record.forecastJson) as DayForecast[],
      cachedAt: record.cachedAt,
      expiresAt: record.expiresAt,
    };
  }

  async saveForecast(data: CachedForecast): Promise<void> {
    const city = data.cityName.toLowerCase();
    const cachedAt = data.cachedAt;
    const expiresAt = buildExpiresAt(cachedAt);

    const hasMarineData = data.forecast.some((day) => day.waveHeightM !== null);
    const marineJson = hasMarineData
      ? JSON.stringify(
          data.forecast.map((day) => ({
            waveHeightM: day.waveHeightM,
            swellHeightM: day.swellHeightM,
          }))
        )
      : null;

    await prisma.weatherCache.upsert({
      where: { cityName: city },
      create: {
        cityName: city,
        lat: data.lat,
        lon: data.lon,
        country: data.country,
        forecastJson: JSON.stringify(data.forecast),
        marineJson,
        cachedAt,
        expiresAt,
      },
      update: {
        lat: data.lat,
        lon: data.lon,
        country: data.country,
        forecastJson: JSON.stringify(data.forecast),
        marineJson,
        cachedAt,
        expiresAt,
      },
    });
  }

  async isCacheValid(cityName: string): Promise<boolean> {
    const record = await prisma.weatherCache.findUnique({
      where: { cityName: cityName.toLowerCase() },
    });
    if (!record) return false;
    return !isCacheExpired(record.expiresAt);
  }

  async getCityGeocode(
    cityName: string
  ): Promise<{ lat: number; lon: number; country: string } | null> {
    const record = await prisma.cityGeocode.findUnique({
      where: { cityName: cityName.toLowerCase() },
    });
    if (!record) return null;
    return { lat: record.lat, lon: record.lon, country: record.country };
  }

  async saveCityGeocode(
    cityName: string,
    lat: number,
    lon: number,
    country: string
  ): Promise<void> {
    const city = cityName.toLowerCase();
    await prisma.cityGeocode.upsert({
      where: { cityName: city },
      create: { cityName: city, lat, lon, country },
      update: { lat, lon, country },
    });
  }
}
