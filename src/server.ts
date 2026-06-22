import 'dotenv/config';
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { typeDefs } from './graphql/schema';
import { createResolvers } from './graphql/resolvers';
import { PrismaWeatherRepository } from './repository/prisma-weather.repository';
import { GeocodingClient } from './weather/geocoding.client';
import { OpenMeteoClient } from './weather/open-meteo.client';
import { ActivityRankingService } from './services/activity-ranking.service';

const repo = new PrismaWeatherRepository();
const geocodingClient = new GeocodingClient();
const weatherClient = new OpenMeteoClient();
const service = new ActivityRankingService(repo, geocodingClient, weatherClient);

const server = new ApolloServer({
  typeDefs,
  resolvers: createResolvers(service),
  introspection: true,
});

async function main() {
  const { url } = await startStandaloneServer(server, {
    listen: { port: Number(process.env.PORT) || 4000 },
  });
  console.log(`Server ready at ${url}`);
}

main();
