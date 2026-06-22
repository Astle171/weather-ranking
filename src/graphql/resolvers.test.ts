import { GraphQLError } from 'graphql';
import { createResolvers } from './resolvers';
import { ActivityRankingService } from '../services/activity-ranking.service';
import { InMemoryWeatherRepository } from '../repository/in-memory-weather.repository';
import { GeocodingClient } from '../weather/geocoding.client';
import { OpenMeteoClient } from '../weather/open-meteo.client';
import { CityNotFoundError } from '../shared/errors/city-not-found.error';
import { DayForecast } from '../scoring/types';

jest.mock('../weather/geocoding.client');
jest.mock('../weather/open-meteo.client');

const MockGeocodingClient = GeocodingClient as jest.MockedClass<typeof GeocodingClient>;
const MockOpenMeteoClient = OpenMeteoClient as jest.MockedClass<typeof OpenMeteoClient>;

const FORECAST_FIXTURE: DayForecast[] = Array.from({ length: 7 }, (_, i) => ({
  date: `2025-07-${String(i + 1).padStart(2, '0')}`,
  maxTempC: 20, minTempC: 12, precipitationMm: 0, windSpeedKmh: 10,
  snowfallCm: 0, weatherCode: 0, sunshineDurationHours: 8,
  precipitationHours: 0, waveHeightM: 1.2, swellHeightM: 0.8,
}));

describe('rankActivities resolver', () => {
  let resolver: (parent: unknown, args: { city: string }) => Promise<unknown>;
  let mockGeocodingClient: jest.Mocked<GeocodingClient>;
  let mockOpenMeteoClient: jest.Mocked<OpenMeteoClient>;

  beforeEach(() => {
    MockGeocodingClient.mockClear();
    MockOpenMeteoClient.mockClear();

    mockGeocodingClient = new MockGeocodingClient() as jest.Mocked<GeocodingClient>;
    mockOpenMeteoClient = new MockOpenMeteoClient() as jest.Mocked<OpenMeteoClient>;

    mockGeocodingClient.search.mockResolvedValue({
      lat: 51.5074, lon: -0.1278, country: 'United Kingdom', name: 'London',
    });
    mockOpenMeteoClient.getForecast.mockResolvedValue(FORECAST_FIXTURE);

    const repo = new InMemoryWeatherRepository();
    const service = new ActivityRankingService(repo, mockGeocodingClient, mockOpenMeteoClient);
    const resolvers = createResolvers(service);
    resolver = resolvers.Query.rankActivities;
  });

  it('should return RankingResult with correct shape', async () => {
    const result = await resolver(null, { city: 'London' }) as any;

    expect(result.city).toBe('London');
    expect(result.rankings).toHaveLength(4);
    expect(result.forecast).toHaveLength(7);
    expect(result.coordinates).toMatchObject({ lat: 51.5074, lon: -0.1278 });
    expect(result.country).toBe('United Kingdom');
    expect(typeof result.generatedAt).toBe('string');
    expect(typeof result.cacheExpiresAt).toBe('string');
  });

  it('should throw GraphQLError with helpful message when city not found', async () => {
    mockGeocodingClient.search.mockRejectedValue(new CityNotFoundError('Atlantis'));

    await expect(resolver(null, { city: 'Atlantis' }))
      .rejects
      .toThrow(GraphQLError);

    await expect(resolver(null, { city: 'Atlantis' }))
      .rejects
      .toThrow('Atlantis');
  });

  it('should return rankings sorted rank 1 first', async () => {
    const result = await resolver(null, { city: 'London' }) as any;

    expect(result.rankings[0].rank).toBe(1);
    expect(result.rankings[3].rank).toBe(4);
    const scores = result.rankings.map((r: any) => r.overallScore);
    expect(scores[0]).toBeGreaterThanOrEqual(scores[1]);
    expect(scores[1]).toBeGreaterThanOrEqual(scores[2]);
    expect(scores[2]).toBeGreaterThanOrEqual(scores[3]);
  });
});
