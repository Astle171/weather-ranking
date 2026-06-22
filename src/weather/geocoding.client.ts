import { CityNotFoundError } from '../shared/errors/city-not-found.error';

export class GeocodingClient {
  private readonly baseUrl = 'https://geocoding-api.open-meteo.com/v1/search';

  async search(cityName: string): Promise<{ lat: number; lon: number; country: string; name: string }> {
    const url = `${this.baseUrl}?name=${encodeURIComponent(cityName)}&count=1&language=en&format=json`;
    const response = await fetch(url);
    const data = await response.json() as { results?: { latitude: number; longitude: number; country: string; name: string }[] };

    if (!data.results || data.results.length === 0) {
      throw new CityNotFoundError(cityName);
    }

    const { latitude, longitude, country, name } = data.results[0];
    return { lat: latitude, lon: longitude, country, name };
  }
}
