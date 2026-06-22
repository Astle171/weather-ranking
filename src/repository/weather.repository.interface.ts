import { DayForecast } from '../scoring/types';

export interface CachedForecast {
  cityName: string
  lat: number
  lon: number
  country: string
  forecast: DayForecast[]
  cachedAt: Date
  expiresAt: Date
}

export interface IWeatherRepository {
  getForecast(cityName: string): Promise<CachedForecast | null>
  saveForecast(data: CachedForecast): Promise<void>
  isCacheValid(cityName: string): Promise<boolean>
  getCityGeocode(cityName: string): Promise<{ lat: number; lon: number; country: string } | null>
  saveCityGeocode(cityName: string, lat: number, lon: number, country: string): Promise<void>
}
