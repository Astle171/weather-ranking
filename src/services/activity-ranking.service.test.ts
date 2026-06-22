import { ActivityRankingService } from './activity-ranking.service';
import { InMemoryWeatherRepository } from '../repository/in-memory-weather.repository';
import { GeocodingClient } from '../weather/geocoding.client';
import { OpenMeteoClient } from '../weather/open-meteo.client';
import { CityNotFoundError } from '../shared/errors/city-not-found.error';
import { WeatherFetchError } from '../shared/errors/weather-fetch.error';
import { DayForecast } from '../scoring/types';
import { CACHE_TTL_MS } from '../repository/cache-policy';

jest.mock('../weather/geocoding.client');
jest.mock('../weather/open-meteo.client');

const MockGeocodingClient = GeocodingClient as jest.MockedClass<typeof GeocodingClient>;
const MockOpenMeteoClient = OpenMeteoClient as jest.MockedClass<typeof OpenMeteoClient>;

const FORECAST_FIXTURE: DayForecast[] = [
  { date: '2025-07-01', maxTempC: 28, minTempC: 18, precipitationMm: 0,   windSpeedKmh: 12, snowfallCm: 0,  weatherCode: 0,  sunshineDurationHours: 10, precipitationHours: 0, waveHeightM: 1.2, swellHeightM: 0.8 },
  { date: '2025-07-02', maxTempC: 22, minTempC: 15, precipitationMm: 3,   windSpeedKmh: 20, snowfallCm: 0,  weatherCode: 61, sunshineDurationHours: 3,  precipitationHours: 2, waveHeightM: 1.8, swellHeightM: 1.1 },
  { date: '2025-07-03', maxTempC: 15, minTempC: 8,  precipitationMm: 12,  windSpeedKmh: 35, snowfallCm: 0,  weatherCode: 63, sunshineDurationHours: 1,  precipitationHours: 5, waveHeightM: 2.5, swellHeightM: 1.9 },
  { date: '2025-07-04', maxTempC: -2, minTempC: -8, precipitationMm: 0,   windSpeedKmh: 10, snowfallCm: 15, weatherCode: 71, sunshineDurationHours: 4,  precipitationHours: 0, waveHeightM: null, swellHeightM: null },
  { date: '2025-07-05', maxTempC: 32, minTempC: 24, precipitationMm: 0,   windSpeedKmh: 8,  snowfallCm: 0,  weatherCode: 1,  sunshineDurationHours: 12, precipitationHours: 0, waveHeightM: 0.4, swellHeightM: 0.3 },
  { date: '2025-07-06', maxTempC: 18, minTempC: 12, precipitationMm: 0.5, windSpeedKmh: 18, snowfallCm: 0,  weatherCode: 2,  sunshineDurationHours: 6,  precipitationHours: 0, waveHeightM: 1.0, swellHeightM: 0.7 },
  { date: '2025-07-07', maxTempC: 10, minTempC: 4,  precipitationMm: 8,   windSpeedKmh: 55, snowfallCm: 0,  weatherCode: 95, sunshineDurationHours: 0,  precipitationHours: 6, waveHeightM: 3.5, swellHeightM: 2.8 },
];

const GEO_RESULT = { lat: 51.5074, lon: -0.1278, country: 'United Kingdom', name: 'London' };

describe('ActivityRankingService', () => {
  let repo: InMemoryWeatherRepository;
  let mockGeocodingClient: jest.Mocked<GeocodingClient>;
  let mockOpenMeteoClient: jest.Mocked<OpenMeteoClient>;
  let service: ActivityRankingService;

  beforeEach(() => {
    repo = new InMemoryWeatherRepository();

    MockGeocodingClient.mockClear();
    MockOpenMeteoClient.mockClear();

    mockGeocodingClient = new MockGeocodingClient() as jest.Mocked<GeocodingClient>;
    mockOpenMeteoClient = new MockOpenMeteoClient() as jest.Mocked<OpenMeteoClient>;

    mockGeocodingClient.search.mockResolvedValue(GEO_RESULT);
    mockOpenMeteoClient.getForecast.mockResolvedValue(FORECAST_FIXTURE);

    service = new ActivityRankingService(repo, mockGeocodingClient, mockOpenMeteoClient);
  });

  describe('rankActivities', () => {
    it('should return RankingResult with 4 ranked activities', async () => {
      const result = await service.rankActivities('London');
      expect(result.rankings).toHaveLength(4);
      expect(result.rankings.map(r => r.rank).sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
    });

    it('should include city name and coordinates in result', async () => {
      const result = await service.rankActivities('London');
      expect(result.city).toBe('London');
      expect(result.country).toBe('United Kingdom');
      expect(result.lat).toBe(GEO_RESULT.lat);
      expect(result.lon).toBe(GEO_RESULT.lon);
    });

    it('should include all 7 days of forecast', async () => {
      const result = await service.rankActivities('London');
      expect(result.forecast).toHaveLength(7);
    });

    it('should set generatedAt to current ISO timestamp', async () => {
      const before = new Date();
      const result = await service.rankActivities('London');
      const after = new Date();
      const generatedAt = new Date(result.generatedAt);
      expect(generatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(generatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should set cacheExpiresAt to 1 hour from now', async () => {
      const before = Date.now();
      const result = await service.rankActivities('London');
      const after = Date.now();
      const expiresAt = new Date(result.cacheExpiresAt).getTime();
      expect(expiresAt).toBeGreaterThanOrEqual(before + CACHE_TTL_MS);
      expect(expiresAt).toBeLessThanOrEqual(after + CACHE_TTL_MS);
    });
  });

  describe('caching', () => {
    it('should call OpenMeteoClient only once for repeated calls to same city', async () => {
      await service.rankActivities('London');
      await service.rankActivities('London');
      expect(mockOpenMeteoClient.getForecast).toHaveBeenCalledTimes(1);
    });

    it('should call OpenMeteoClient again when cache has expired', async () => {
      const expiredAt = new Date(Date.now() - 1);
      await repo.saveForecast({
        cityName: 'london',
        lat: GEO_RESULT.lat,
        lon: GEO_RESULT.lon,
        country: GEO_RESULT.country,
        forecast: FORECAST_FIXTURE,
        cachedAt: new Date(Date.now() - CACHE_TTL_MS - 1000),
        expiresAt: expiredAt,
      });

      await service.rankActivities('London');
      expect(mockOpenMeteoClient.getForecast).toHaveBeenCalledTimes(1);
    });

    it('should use cached geocode on second call for same city', async () => {
      await service.rankActivities('London');
      await service.rankActivities('London');
      expect(mockGeocodingClient.search).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('should throw CityNotFoundError when geocoding fails', async () => {
      mockGeocodingClient.search.mockRejectedValue(new CityNotFoundError('Atlantis'));
      await expect(service.rankActivities('Atlantis')).rejects.toThrow(CityNotFoundError);
    });

    it('should propagate WeatherFetchError from OpenMeteoClient', async () => {
      mockOpenMeteoClient.getForecast.mockRejectedValue(new WeatherFetchError('API down', 503));
      await expect(service.rankActivities('London')).rejects.toThrow(WeatherFetchError);
    });
  });
});
