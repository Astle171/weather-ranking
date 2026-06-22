export interface DayForecast {
  date: string
  maxTempC: number
  minTempC: number
  precipitationMm: number
  windSpeedKmh: number
  snowfallCm: number
  weatherCode: number
  sunshineDurationHours: number
  precipitationHours: number
  waveHeightM: number | null
  swellHeightM: number | null
}

export type ActivityType =
  | 'SKIING'
  | 'SURFING'
  | 'OUTDOOR_SIGHTSEEING'
  | 'INDOOR_SIGHTSEEING'

export type Verdict = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR'

export interface DayScore {
  date: string
  score: number
  highlights: string[]
  warnings: string[]
}

export interface ActivityRanking {
  activity: ActivityType
  rank: number
  overallScore: number
  verdict: Verdict
  reasoning: string
  dailyScores: DayScore[]
}

export interface RankingResult {
  city: string
  country: string
  lat: number
  lon: number
  generatedAt: string
  cacheExpiresAt: string
  rankings: ActivityRanking[]
  forecast: DayForecast[]
}
