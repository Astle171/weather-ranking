import { InMemoryWeatherRepository } from './in-memory-weather.repository';
import { CachedForecast } from './weather.repository.interface';
import { DayForecast } from '../scoring/types';

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const BASE_DAY: DayForecast = {
  date: '2025-01-15',
  maxTempC: -3,
  minTempC: -8,
  precipitationMm: 0,
  windSpeedKmh: 10,
  snowfallCm: 20,
  weatherCode: 71,
  sunshineDurationHours: 4,
  precipitationHours: 0,
  waveHeightM: null,
  swellHeightM: null,
};

function makeCachedForecast(overrides: Partial<CachedForecast> = {}): CachedForecast {
  const now = new Date();
  return {
    cityName: 'london',
    lat: 51.5,
    lon: -0.12,
    country: 'United Kingdom',
    forecast: [BASE_DAY],
    cachedAt: now,
    expiresAt: new Date(now.getTime() + CACHE_TTL_MS),
    ...overrides,
  };
}

describe('InMemoryWeatherRepository', () => {
  let repo: InMemoryWeatherRepository;

  beforeEach(() => {
    repo = new InMemoryWeatherRepository();
  });

  it('should return null when no cache exists for city', async () => {
    const result = await repo.getForecast('london');
    expect(result).toBeNull();
  });

  it('should return stored forecast after saveForecast', async () => {
    const data = makeCachedForecast();
    await repo.saveForecast(data);

    const result = await repo.getForecast('london');
    expect(result).not.toBeNull();
    expect(result!.cityName).toBe('london');
    expect(result!.lat).toBe(51.5);
    expect(result!.lon).toBe(-0.12);
    expect(result!.forecast).toHaveLength(1);
  });

  it('should be case-insensitive — normalise city to lowercase', async () => {
    await repo.saveForecast(makeCachedForecast({ cityName: 'London' }));

    const result = await repo.getForecast('LONDON');
    expect(result).not.toBeNull();
  });

  it('should return false for isCacheValid when expiresAt is in the past', async () => {
    await repo.saveForecast(
      makeCachedForecast({ expiresAt: new Date(Date.now() - 1000) })
    );

    const valid = await repo.isCacheValid('london');
    expect(valid).toBe(false);
  });

  it('should return true for isCacheValid when expiresAt is in the future', async () => {
    await repo.saveForecast(
      makeCachedForecast({ expiresAt: new Date(Date.now() + CACHE_TTL_MS) })
    );

    const valid = await repo.isCacheValid('london');
    expect(valid).toBe(true);
  });

  it('should return null for getCityGeocode when not stored', async () => {
    const result = await repo.getCityGeocode('paris');
    expect(result).toBeNull();
  });

  it('should return stored geocode after saveCityGeocode', async () => {
    await repo.saveCityGeocode('paris', 48.85, 2.35, 'France');

    const result = await repo.getCityGeocode('paris');
    expect(result).not.toBeNull();
    expect(result!.lat).toBe(48.85);
    expect(result!.lon).toBe(2.35);
    expect(result!.country).toBe('France');
  });
});
