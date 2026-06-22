import { IWeatherRepository, CachedForecast } from '../repository/weather.repository.interface';
import { buildExpiresAt, isCacheExpired } from '../repository/cache-policy';
import { GeocodingClient } from '../weather/geocoding.client';
import { OpenMeteoClient } from '../weather/open-meteo.client';
import { rankActivities as rankByEngine } from '../scoring/ranking-engine';
import { RankingResult } from '../scoring/types';

export class ActivityRankingService {
  constructor(
    private readonly repo: IWeatherRepository,
    private readonly geocodingClient: GeocodingClient,
    private readonly weatherClient: OpenMeteoClient,
  ) {}

  async rankActivities(cityName: string): Promise<RankingResult> {
    const normalizedCity = cityName.toLowerCase();

    // Single repo read — check existence and freshness in one step
    let cached: CachedForecast | null = await this.repo.getForecast(normalizedCity);

    if (!cached || isCacheExpired(cached.expiresAt)) {
      let geo = await this.repo.getCityGeocode(normalizedCity);

      if (!geo) {
        const result = await this.geocodingClient.search(cityName);
        geo = { lat: result.lat, lon: result.lon, country: result.country };
        await this.repo.saveCityGeocode(normalizedCity, result.lat, result.lon, result.country);
      }

      const forecast = await this.weatherClient.getForecast(geo.lat, geo.lon);
      const cachedAt = new Date();

      cached = {
        cityName: normalizedCity,
        lat: geo.lat,
        lon: geo.lon,
        country: geo.country,
        forecast,
        cachedAt,
        expiresAt: buildExpiresAt(cachedAt),
      };
      await this.repo.saveForecast(cached);
    }

    const rankings = rankByEngine(cached.forecast);

    return {
      city: cityName,
      country: cached.country,
      lat: cached.lat,
      lon: cached.lon,
      generatedAt: new Date().toISOString(),
      cacheExpiresAt: cached.expiresAt.toISOString(),
      rankings,
      forecast: cached.forecast,
    };
  }
}
