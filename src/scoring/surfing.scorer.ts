import { DayForecast, DayScore } from './types';

const LANDLOCKED_CAP = 20;

function scoreWaveHeight(waveHeightM: number): { points: number; highlights: string[]; warnings: string[] } {
  if (waveHeightM > 4.0)  return { points: 10, highlights: [],                                  warnings: ['Extremely large surf — experts only'] };
  if (waveHeightM >= 2.5) return { points: 30, highlights: ['Powerful surf — advanced riders'], warnings: [] };
  if (waveHeightM >= 1.0) return { points: 40, highlights: ['Ideal wave height'],               warnings: [] };
  if (waveHeightM >= 0.5) return { points: 20, highlights: ['Mellow waves — good for beginners'], warnings: [] };
  if (waveHeightM >= 0.3) return { points: 8,  highlights: [],                                  warnings: [] };
  return                         { points: 5,  highlights: [],                                  warnings: ['Flat — poor surfing conditions'] };
}

function scoreWind(windSpeedKmh: number): { points: number; highlights: string[]; warnings: string[] } {
  if (windSpeedKmh < 15)  return { points: 30, highlights: ['Clean, glassy conditions'], warnings: [] };
  if (windSpeedKmh <= 25) return { points: 20, highlights: [],                           warnings: [] };
  if (windSpeedKmh <= 40) return { points: 10, highlights: [],                           warnings: ['Choppy surface'] };
  return                         { points: 5,  highlights: [],                           warnings: ['Onshore winds — rough conditions'] };
}

function scorePrecipitation(precipitationMm: number): { points: number; warnings: string[] } {
  if (precipitationMm === 0) return { points: 20, warnings: [] };
  if (precipitationMm < 2)   return { points: 10, warnings: [] };
  return                            { points: 0,  warnings: ['Rain expected'] };
}

function scoreTemperatureComfort(maxTempC: number): { points: number; highlights: string[]; warnings: string[] } {
  if (maxTempC > 20)  return { points: 10, highlights: ['Warm water conditions'],          warnings: [] };
  if (maxTempC >= 15) return { points: 5,  highlights: [],                                 warnings: [] };
  return                     { points: 0,  highlights: [],                                 warnings: ['Cold water — full wetsuit recommended'] };
}

export function scoreDay(day: DayForecast): DayScore {
  if (day.waveHeightM === null) {
    return {
      date: day.date,
      score: LANDLOCKED_CAP,
      highlights: [],
      warnings: ['No coastal data — landlocked location'],
    };
  }

  const wave    = scoreWaveHeight(day.waveHeightM);
  const wind    = scoreWind(day.windSpeedKmh);
  const precip  = scorePrecipitation(day.precipitationMm);
  const temp    = scoreTemperatureComfort(day.maxTempC);

  const score = Math.min(100, Math.max(0,
    wave.points + wind.points + precip.points + temp.points
  ));

  return {
    date: day.date,
    score,
    highlights: [...wave.highlights, ...wind.highlights, ...temp.highlights],
    warnings:   [...wave.warnings,   ...wind.warnings,   ...precip.warnings, ...temp.warnings],
  };
}
