import { getRateLimiter, setRateLimiter } from './kv';

const LIMIT = parseInt(process.env.IG_DAILY_POST_LIMIT || '100', 10);
const WINDOW = 24 * 60 * 60 * 1000;

export async function canPost() {
  const { timestamps } = await getRateLimiter();
  const now = Date.now();
  const recent = timestamps.filter(t => now - t < WINDOW);
  if (recent.length >= LIMIT) {
    const oldest = Math.min(...recent);
    const waitMs = WINDOW - (now - oldest);
    const waitMin = Math.ceil(waitMs / 60000);
    console.warn(`[rateLimiter] Daily limit reached (${recent.length}/${LIMIT}). Next slot in ~${waitMin}m`);
    return false;
  }
  return true;
}

export async function recordPost() {
  const data = await getRateLimiter();
  const now = Date.now();
  data.timestamps = [...data.timestamps.filter(t => now - t < WINDOW), now];
  await setRateLimiter(data);
}

export async function status() {
  const { timestamps } = await getRateLimiter();
  const now = Date.now();
  const recent = timestamps.filter(t => now - t < WINDOW);
  return { used: recent.length, limit: LIMIT, remaining: LIMIT - recent.length };
}
