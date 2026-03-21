'use strict';
const fs   = require('fs');
const path = require('path');
const axios = require('axios');
const logger = require('./logger');

const FILE = path.join(__dirname, '../posts_history.json');
const MAX  = 200;

function load() {
  try { if (fs.existsSync(FILE)) return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (_) {}
  return [];
}

function save(records) {
  try { fs.writeFileSync(FILE, JSON.stringify(records, null, 2), 'utf8'); }
  catch (err) { logger.error(`Failed to save post history: ${err.message}`); }
}

function recordPost({ stock, action, channel, tradeType, postId, storyId, imageUrl }) {
  const history = load();
  history.unshift({
    stock, action, channel, tradeType,
    postId:   postId  || null,
    storyId:  storyId || null,
    imageUrl: imageUrl || null,
    postedAt: new Date().toISOString(),
    metrics:  { likes: 0, comments: 0 },
    permalink: null,
    metricsUpdatedAt: null,
  });
  if (history.length > MAX) history.length = MAX;
  save(history);
}

async function fetchMetrics(postId) {
  const token   = process.env.META_ACCESS_TOKEN;
  const version = process.env.META_API_VERSION || 'v19.0';
  if (!postId || !token) return null;
  try {
    const { data } = await axios.get(
      `https://graph.facebook.com/${version}/${postId}`,
      { params: { fields: 'id,like_count,comments_count,timestamp,permalink', access_token: token }, timeout: 10_000 }
    );
    return { likes: data.like_count || 0, comments: data.comments_count || 0, permalink: data.permalink || null };
  } catch (err) {
    logger.debug(`Metrics fetch failed for ${postId}: ${err.message}`);
    return null;
  }
}

async function refreshMetrics() {
  const history = load();
  if (!history.length) return history;
  logger.info(`Refreshing metrics for up to 50 posts…`);
  for (const rec of history.slice(0, 50)) {
    if (!rec.postId) continue;
    const m = await fetchMetrics(rec.postId);
    if (m) {
      rec.metrics   = { ...rec.metrics, likes: m.likes, comments: m.comments };
      rec.permalink = m.permalink || rec.permalink;
      rec.metricsUpdatedAt = new Date().toISOString();
    }
  }
  save(history);
  logger.info('Metrics refresh done');
  return history;
}

function getHistory() { return load(); }

function startBackgroundRefresh(io) {
  setTimeout(async () => {
    const h = await refreshMetrics().catch(err => { logger.error(`BG metrics: ${err.message}`); return null; });
    if (h && io) io.emit('metrics_updated', h.slice(0, 100));
    setInterval(async () => {
      const h2 = await refreshMetrics().catch(err => { logger.error(`BG metrics: ${err.message}`); return null; });
      if (h2 && io) io.emit('metrics_updated', h2.slice(0, 100));
    }, 2 * 60 * 60 * 1000);
  }, 5 * 60 * 1000);
}

module.exports = { recordPost, refreshMetrics, getHistory, startBackgroundRefresh };
