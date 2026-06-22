import { IWeatherRepository, CachedForecast } from './weather.repository.interface';

export class InMemoryWeatherRepository implements IWeatherRepository {
  private forecasts = new Map<string, CachedForecast>();
  private geocodes = new Map<string, { lat: number; lon: number; country: string }>();

  async getForecast(cityName: string): Promise<CachedForecast | null> {
    return this.forecasts.get(cityName.toLowerCase()) ?? null;
  }

  async saveForecast(data: CachedForecast): Promise<void> {
    this.forecasts.set(data.cityName.toLowerCase(), { ...data, cityName: data.cityName.toLowerCase() });
  }

  async isCacheValid(cityName: string): Promise<boolean> {
    const cached = this.forecasts.get(cityName.toLowerCase());
    if (!cached) return false;
    return cached.expiresAt > new Date();
  }

  async getCityGeocode(cityName: string): Promise<{ lat: number; lon: number; country: string } | null> {
    return this.geocodes.get(cityName.toLowerCase()) ?? null;
  }

  async saveCityGeocode(cityName: string, lat: number, lon: number, country: string): Promise<void> {
    this.geocodes.set(cityName.toLowerCase(), { lat, lon, country });
  }
}
