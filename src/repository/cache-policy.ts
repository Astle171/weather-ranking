export const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export function buildExpiresAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + CACHE_TTL_MS);
}

export function isCacheExpired(expiresAt: Date): boolean {
  return expiresAt <= new Date();
}
