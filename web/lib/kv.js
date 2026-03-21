import { kv } from '@vercel/kv';

const KEYS = {
  POSTS:        'posts',
  LOGS:         'logs',
  PREFERENCES:  'preferences',
  PERF_HISTORY: 'perf_history',
  RATE_LIMITER: 'rate_limiter',
  WS_STATUS:    'ws_status',
};

export async function getPosts()    { return (await kv.get(KEYS.POSTS))    || []; }
export async function getLogs()     { return (await kv.get(KEYS.LOGS))     || []; }
export async function getWsStatus() { return (await kv.get(KEYS.WS_STATUS)) || { connected: false }; }

export async function getPreferences() {
  return (await kv.get(KEYS.PREFERENCES)) || {
    tradeTypes: { equity: true, indexOption: true, stockOption: true, indexFuture: true, stockFuture: true },
    postToFeed: true,
    postToStory: false,
    channels: ['zeebusiness', 'cnbcawaaz', 'ndtvprofit'],
  };
}

export async function setPreferences(prefs) {
  await kv.set(KEYS.PREFERENCES, prefs);
  return prefs;
}

export async function getPerfHistory() { return (await kv.get(KEYS.PERF_HISTORY)) || []; }
export async function setPerfHistory(h) { await kv.set(KEYS.PERF_HISTORY, h); }

export async function getRateLimiter() {
  return (await kv.get(KEYS.RATE_LIMITER)) || { timestamps: [] };
}
export async function setRateLimiter(data) { await kv.set(KEYS.RATE_LIMITER, data); }

export async function setWsStatus(s) { await kv.set(KEYS.WS_STATUS, s); }

// Prepend a post entry, keep last 100
export async function upsertPost(entry) {
  const posts = await getPosts();
  const key = `${entry.rec?.stock}::${entry.time}`;
  const idx = posts.findIndex(p => `${p.rec?.stock}::${p.time}` === key);
  if (idx >= 0) {
    posts[idx] = { ...posts[idx], ...entry };
  } else {
    posts.unshift(entry);
    if (posts.length > 100) posts.pop();
  }
  await kv.set(KEYS.POSTS, posts);
  return posts;
}

// Prepend a log entry, keep last 200
export async function appendLog(entry) {
  const logs = await getLogs();
  logs.unshift(entry);
  if (logs.length > 200) logs.pop();
  await kv.set(KEYS.LOGS, logs);
}
