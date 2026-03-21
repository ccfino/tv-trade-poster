import { getPosts, getLogs, getWsStatus, getRateLimiter } from '../../lib/kv';

const LIMIT = parseInt(process.env.IG_DAILY_POST_LIMIT || '100', 10);
const WINDOW = 24 * 60 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const [posts, logs, wsStatus, rl] = await Promise.all([
    getPosts(),
    getLogs(),
    getWsStatus(),
    getRateLimiter(),
  ]);

  const now = Date.now();
  const recent = (rl.timestamps || []).filter(t => now - t < WINDOW);

  const today = new Date().toDateString();
  const postsToday = posts.filter(
    p => p.status === 'posted' && new Date(p.time).toDateString() === today
  ).length;

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    wsStatus,
    posts: posts.slice(0, 50),
    logs:  logs.slice(0, 100),
    postsToday,
    totalPosts: posts.length,
    igLimit: { used: recent.length, limit: LIMIT, remaining: LIMIT - recent.length },
  });
}
