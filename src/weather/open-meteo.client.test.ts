import { OpenMeteoClient } from './open-meteo.client';

// Innsbruck-style winter forecast fixture — 7 days
const FORECAST_FIXTURE = {
  daily: {
    time: ['2025-01-15', '2025-01-16', '2025-01-17', '2025-01-18', '2025-01-19', '2025-01-20', '2025-01-21'],
    temperature_2m_max:  [  2.1,  -1.3,  -3.5,   0.8,   4.2,  -0.5,   1.7],
    temperature_2m_min:  [ -4.5,  -7.2,  -8.1,  -5.3,  -2.1,  -6.4,  -3.8],
    precipitation_sum:   [  0.0,   2.3,   0.0,   1.5,   4.2,   0.0,   0.8],
    wind_speed_10m_max:  [ 15.2,  22.1,   8.5,  30.4,  18.7,  11.2,  25.3],
    snowfall_sum:        [  5.2,   8.1,   0.0,   3.4,   0.0,   6.7,   2.1],
    weather_code:        [   71,    73,     0,    77,    61,    71,     3],
    sunshine_duration:   [14400,  7200, 28800,  3600,    0, 21600, 10800], // seconds
    precipitation_hours: [    0,     3,     0,     2,     5,     0,     1],
  },
};

// Coastal fixture — Brest, France style
const MARINE_FIXTURE = {
  daily: {
    time: ['2025-01-15', '2025-01-16', '2025-01-17', '2025-01-18', '2025-01-19', '2025-01-20', '2025-01-21'],
    wave_height_max:       [1.2, 1.5, 2.1, 0.8, 3.2, 1.1, 0.9],
    wind_wave_height_max:  [0.8, 1.1, 1.5, 0.5, 2.4, 0.7, 0.6],
    swell_wave_height_max: [0.9, 1.2, 1.8, 0.6, 2.8, 0.9, 0.7],
  },
};

function mockBothApis() {
  return jest
    .spyOn(global, 'fetch')
    .mockResolvedValueOnce({
      ok: true,
      json: async () => FORECAST_FIXTURE,
    } as unknown as Response)
    .mockResolvedValueOnce({
      ok: true,
      json: async () => MARINE_FIXTURE,
    } as unknown as Response);
}

describe('OpenMeteoClient', () => {
  let client: OpenMeteoClient;

  beforeEach(() => {
    client = new OpenMeteoClient();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getForecast', () => {
    it('should return exactly 7 DayForecast objects', async () => {
      mockBothApis();
      const forecast = await client.getForecast(47.26, 11.39);
      expect(forecast).toHaveLength(7);
    });

    it('should map API response to DayForecast shape correctly', async () => {
      mockBothApis();
      const forecast = await client.getForecast(47.26, 11.39);
      expect(forecast[0]).toMatchObject({
        date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        maxTempC: expect.any(Number),
        minTempC: expect.any(Number),
        precipitationMm: expect.any(Number),
        windSpeedKmh: expect.any(Number),
        snowfallCm: expect.any(Number),
        weatherCode: expect.any(Number),
        sunshineDurationHours: expect.any(Number),
      });
    });

    it('should include wave data for coastal coordinates', async () => {
      mockBothApis();
      const forecast = await client.getForecast(48.8, -2.3);
      expect(forecast[0].waveHeightM).not.toBeNull();
      expect(typeof forecast[0].waveHeightM).toBe('number');
    });

    it('should set waveHeightM to null when marine API returns 400', async () => {
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce({
          ok: true,
          json: async () => FORECAST_FIXTURE,
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
        } as unknown as Response);

      const forecast = await client.getForecast(47.26, 11.39);
      expect(forecast[0].waveHeightM).toBeNull();
    });

    it('should call forecast API with correct parameters', async () => {
      const fetchSpy = mockBothApis();
      await client.getForecast(47.26, 11.39);

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('latitude=47.26')
      );
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('longitude=11.39')
      );
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('daily=temperature_2m_max')
      );
    });
  });
});
