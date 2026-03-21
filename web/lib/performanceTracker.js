import { getPerfHistory, setPerfHistory } from './kv';

const IG_ACCOUNT_ID = process.env.INSTAGRAM_ACCOUNT_ID;
const ACCESS_TOKEN  = process.env.META_ACCESS_TOKEN;
const API_VERSION   = process.env.META_API_VERSION || 'v19.0';

export async function recordPost({ stock, action, channel, tradeType, postId, storyId, imageUrl }) {
  const history = await getPerfHistory();
  history.unshift({
    stock, action, channel, tradeType, postId, storyId, imageUrl,
    postedAt: new Date().toISOString(),
    metrics: { likes: 0, comments: 0 },
  });
  if (history.length > 200) history.pop();
  await setPerfHistory(history);
}

async function fetchMetrics(postId) {
  if (!postId) return null;
  try {
    const url = `https://graph.facebook.com/${API_VERSION}/${postId}?fields=like_count,comments_count,permalink&access_token=${ACCESS_TOKEN}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) return null;
    return {
      likes: data.like_count || 0,
      comments: data.comments_count || 0,
      permalink: data.permalink || null,
    };
  } catch { return null; }
}

export async function refreshMetrics() {
  const history = await getPerfHistory();
  const toFetch = history.filter(p => p.postId).slice(0, 50);
  for (const entry of toFetch) {
    const m = await fetchMetrics(entry.postId);
    if (m) entry.metrics = m;
  }
  await setPerfHistory(history);
  return history;
}

export async function getHistory() {
  return getPerfHistory();
}
