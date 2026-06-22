import { DayForecast, ActivityRanking, ActivityType, DayScore, Verdict } from './types';
import { scoreDay as scoreSkiing } from './skiing.scorer';
import { scoreDay as scoreSurfing } from './surfing.scorer';
import { scoreDay as scoreOutdoor } from './outdoor-sightseeing.scorer';
import { scoreDay as scoreIndoor } from './indoor-sightseeing.scorer';

type ScorerFn = (day: DayForecast) => DayScore;

const SCORERS: Record<ActivityType, ScorerFn> = {
  SKIING:              scoreSkiing,
  SURFING:             scoreSurfing,
  OUTDOOR_SIGHTSEEING: scoreOutdoor,
  INDOOR_SIGHTSEEING:  scoreIndoor,
};

function verdictFromScore(score: number): Verdict {
  if (score >= 75) return 'EXCELLENT';
  if (score >= 55) return 'GOOD';
  if (score >= 35) return 'FAIR';
  return 'POOR';
}

function buildReasoning(dailyScores: DayScore[]): string {
  const bestDay = dailyScores.reduce((best, d) => d.score > best.score ? d : best);
  const goodOrAbove = dailyScores.filter(d => d.score >= 55).length;
  return `Best day: ${bestDay.date} with score ${Math.round(bestDay.score)}. ${goodOrAbove} of 7 days rated Good or above.`;
}

export function rankActivities(forecast: DayForecast[]): ActivityRanking[] {
  const activities: ActivityType[] = ['SKIING', 'SURFING', 'OUTDOOR_SIGHTSEEING', 'INDOOR_SIGHTSEEING'];

  const scored = activities.map(activity => {
    const dailyScores = forecast.map(day => SCORERS[activity](day));
    const overallScore = dailyScores.reduce((sum, d) => sum + d.score, 0) / dailyScores.length;
    return {
      activity,
      overallScore,
      verdict:    verdictFromScore(overallScore),
      reasoning:  buildReasoning(dailyScores),
      dailyScores,
    };
  });

  scored.sort((a, b) => b.overallScore - a.overallScore);

  return scored.map((item, index) => ({ ...item, rank: index + 1 }));
}
