import { GeocodingClient } from './geocoding.client';
import { CityNotFoundError } from '../shared/errors/city-not-found.error';

describe('GeocodingClient', () => {
  let client: GeocodingClient;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    client = new GeocodingClient();
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return lat, lon, country for a valid city', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            latitude: 47.26,
            longitude: 11.39,
            country: 'Austria',
            name: 'Innsbruck',
            admin1: 'Tyrol',
          },
        ],
      }),
    } as unknown as Response);

    const result = await client.search('Innsbruck');

    expect(result.lat).toBeCloseTo(47.26, 1);
    expect(result.lon).toBeCloseTo(11.39, 1);
    expect(result.country).toBe('Austria');
  });

  it('should throw CityNotFoundError when results array is empty', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    } as unknown as Response);

    await expect(client.search('ZZZtest')).rejects.toThrow(CityNotFoundError);
    await expect(client.search('ZZZtest')).rejects.toThrow('ZZZtest');
  });

  it('should call the correct Open-Meteo geocoding URL', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            latitude: 51.5,
            longitude: -0.12,
            country: 'United Kingdom',
            name: 'London',
            admin1: 'England',
          },
        ],
      }),
    } as unknown as Response);

    await client.search('London');

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('geocoding-api.open-meteo.com')
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('London')
    );
  });
});
