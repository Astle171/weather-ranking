import { rankActivities } from './ranking-engine';
import { DayForecast } from './types';

// 7 identical perfect ski days (landlocked) — deterministic scores
const SEVEN_SKI_DAYS: DayForecast[] = Array.from({ length: 7 }, (_, i) => ({
  date: `2025-01-${String(15 + i).padStart(2, '0')}`,
  maxTempC: -3,
  minTempC: -8,
  precipitationMm: 0,
  windSpeedKmh: 12,
  snowfallCm: 15,
  weatherCode: 71,
  sunshineDurationHours: 4,
  precipitationHours: 0,
  waveHeightM: null,
  swellHeightM: null,
}));

describe('RankingEngine', () => {
  it('should return exactly 4 ActivityRanking objects', () => {
    const rankings = rankActivities(SEVEN_SKI_DAYS);
    expect(rankings).toHaveLength(4);
  });

  it('should assign ranks 1 through 4 with no ties or gaps', () => {
    const rankings = rankActivities(SEVEN_SKI_DAYS);
    const ranks = rankings.map(r => r.rank).sort((a, b) => a - b);
    expect(ranks).toEqual([1, 2, 3, 4]);
  });

  it('should sort rankings so rank 1 has highest overallScore', () => {
    const rankings = rankActivities(SEVEN_SKI_DAYS);
    const first = rankings.find(r => r.rank === 1)!;
    const last  = rankings.find(r => r.rank === 4)!;
    expect(first.overallScore).toBeGreaterThan(last.overallScore);
  });

  it('should compute overallScore as average of 7 daily scores', () => {
    const rankings = rankActivities(SEVEN_SKI_DAYS);
    const skiing = rankings.find(r => r.activity === 'SKIING')!;
    const expectedAvg = skiing.dailyScores.reduce((sum, d) => sum + d.score, 0) / 7;
    expect(skiing.overallScore).toBeCloseTo(expectedAvg, 1);
  });

  it('should assign EXCELLENT verdict for overallScore >= 75', () => {
    const rankings = rankActivities(SEVEN_SKI_DAYS);
    const skiing = rankings.find(r => r.activity === 'SKIING')!;
    expect(skiing.overallScore).toBeGreaterThanOrEqual(75);
    expect(skiing.verdict).toBe('EXCELLENT');
  });

  it('should assign GOOD for >= 55, FAIR for >= 35, POOR below 35', () => {
    const rankings = rankActivities(SEVEN_SKI_DAYS);
    rankings.forEach(r => {
      if (r.overallScore >= 75)      expect(r.verdict).toBe('EXCELLENT');
      else if (r.overallScore >= 55) expect(r.verdict).toBe('GOOD');
      else if (r.overallScore >= 35) expect(r.verdict).toBe('FAIR');
      else                           expect(r.verdict).toBe('POOR');
    });
  });

  it('should include reasoning mentioning the best day date', () => {
    const rankings = rankActivities(SEVEN_SKI_DAYS);
    const skiing = rankings.find(r => r.activity === 'SKIING')!;
    expect(skiing.reasoning).toMatch(/2025-01-\d{2}/);
  });

  it('should include all 7 dailyScores per activity', () => {
    const rankings = rankActivities(SEVEN_SKI_DAYS);
    rankings.forEach(r => {
      expect(r.dailyScores).toHaveLength(7);
    });
  });
});
