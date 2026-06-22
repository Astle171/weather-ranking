export class CityNotFoundError extends Error {
  name = 'CityNotFoundError';

  constructor(city: string) {
    super(`City "${city}" not found. Check spelling or try a nearby city.`);
  }
}
