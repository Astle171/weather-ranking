import { DayForecast } from '../scoring/types';
import { WeatherFetchError } from '../shared/errors/weather-fetch.error';

interface ForecastApiResponse {
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
    wind_speed_10m_max: number[];
    snowfall_sum: number[];
    weather_code: number[];
    sunshine_duration: number[]; // seconds — converted to hours on mapping
    precipitation_hours: number[];
  };
}

interface MarineApiResponse {
  daily: {
    wave_height_max: number[];
    swell_wave_height_max: number[];
  };
}

export class OpenMeteoClient {
  async getForecast(lat: number, lon: number): Promise<DayForecast[]> {
    const forecastUrl =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lon}` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,` +
      `wind_speed_10m_max,snowfall_sum,weather_code,sunshine_duration,precipitation_hours` +
      `&timezone=auto&forecast_days=7`;

    const marineUrl =
      `https://marine-api.open-meteo.com/v1/marine` +
      `?latitude=${lat}&longitude=${lon}` +
      `&daily=wave_height_max,swell_wave_height_max&forecast_days=7`;

    const forecastPromise = fetch(forecastUrl);
    const marinePromise = fetch(marineUrl)
      .then((r) => (r.ok ? (r.json() as Promise<MarineApiResponse>) : null))
      .catch(() => null);

    const [forecastResponse, marineData] = await Promise.all([
      forecastPromise,
      marinePromise,
    ]);

    if (!forecastResponse.ok) {
      throw new WeatherFetchError(`Forecast API error`, forecastResponse.status);
    }

    const forecastData = (await forecastResponse.json()) as ForecastApiResponse;

    const { daily } = forecastData;

    return daily.time.map((date, i) => ({
      date,
      maxTempC: daily.temperature_2m_max[i],
      minTempC: daily.temperature_2m_min[i],
      precipitationMm: daily.precipitation_sum[i],
      windSpeedKmh: daily.wind_speed_10m_max[i],
      snowfallCm: daily.snowfall_sum[i],
      weatherCode: daily.weather_code[i],
      sunshineDurationHours: daily.sunshine_duration[i] / 3600,
      precipitationHours: daily.precipitation_hours[i],
      waveHeightM: marineData ? marineData.daily.wave_height_max[i] : null,
      swellHeightM: marineData ? marineData.daily.swell_wave_height_max[i] : null,
    }));
  }
}
