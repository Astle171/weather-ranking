export class WeatherFetchError extends Error {
  name = 'WeatherFetchError';

  constructor(message: string, public readonly statusCode?: number) {
    super(message);
  }
}
