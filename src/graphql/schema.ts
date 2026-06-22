export const typeDefs = /* GraphQL */ `
  enum Activity {
    SKIING
    SURFING
    OUTDOOR_SIGHTSEEING
    INDOOR_SIGHTSEEING
  }

  enum Verdict {
    EXCELLENT
    GOOD
    FAIR
    POOR
  }

  type Coordinates {
    lat: Float!
    lon: Float!
  }

  type DayScore {
    date: String!
    score: Int!
    highlights: [String!]!
    warnings: [String!]!
  }

  type DayForecast {
    date: String!
    maxTempC: Float!
    minTempC: Float!
    precipitationMm: Float!
    windSpeedKmh: Float!
    snowfallCm: Float!
    weatherDescription: String!
    waveHeightM: Float
    swellHeightM: Float
  }

  type ActivityRanking {
    rank: Int!
    activity: Activity!
    overallScore: Float!
    verdict: Verdict!
    reasoning: String!
    dailyScores: [DayScore!]!
  }

  type RankingResult {
    city: String!
    country: String!
    coordinates: Coordinates!
    generatedAt: String!
    cacheExpiresAt: String!
    rankings: [ActivityRanking!]!
    forecast: [DayForecast!]!
  }

  type Query {
    rankActivities(city: String!): RankingResult!
  }
`;
