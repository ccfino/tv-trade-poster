'use strict';

/**
 * Instagram Content Publishing rate limiter.
 *
 * Meta enforces a hard limit of 25 posts per Instagram account per rolling
 * 24-hour window. This module tracks posts in memory and rejects attempts
 * that would exceed the limit, logging a clear warning so nothing is silently
 * dropped without notice.
 *
 * The counter resets automatically as posts age out of the 24-hour window.
 */

const logger = require('./logger');

const WINDOW_MS   = 24 * 60 * 60 * 1000;               // 24 hours in ms
const DAILY_LIMIT = parseInt(process.env.IG_DAILY_POST_LIMIT || '25', 10);

// Timestamps (ms) of each post made within the current window
const postTimestamps = [];

// Timestamps for story posts (separate from feed posts)
const storyTimestamps = [];

/**
 * Evict timestamps older than 24 hours.
 */
function evictExpired() {
  const cutoff = Date.now() - WINDOW_MS;
  while (postTimestamps.length && postTimestamps[0] <= cutoff) {
    postTimestamps.shift();
  }
}

/**
 * How many posts have been made in the last 24 hours.
 */
function postsInWindow() {
  evictExpired();
  return postTimestamps.length;
}

/**
 * Returns true if we are allowed to post right now.
 * Logs a warning and returns false if the limit would be exceeded.
 */
function canPost() {
  const used = postsInWindow();
  if (used >= DAILY_LIMIT) {
    const oldestMs  = postTimestamps[0];
    const resetInMs = (oldestMs + WINDOW_MS) - Date.now();
    const resetMins = Math.ceil(resetInMs / 60_000);
    logger.warn(
      `Instagram daily limit reached (${used}/${DAILY_LIMIT} posts in last 24 h). ` +
      `Next slot opens in ~${resetMins} min.`
    );
    return false;
  }
  return true;
}

/**
 * Record that a post was successfully published.
 * Call this only after a confirmed successful publish.
 */
function recordPost() {
  evictExpired();
  postTimestamps.push(Date.now());
  logger.info(`Instagram posts today: ${postTimestamps.length}/${DAILY_LIMIT}`);
}

/**
 * Current status — useful for the dashboard.
 */
function status() {
  const used = postsInWindow();
  return { used, limit: DAILY_LIMIT, remaining: DAILY_LIMIT - used };
}

// ── Story limiter ─────────────────────────────────────────────────────────────

/**
 * Evict story timestamps older than the current calendar day.
 */
function evictOldStories() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const cutoff = startOfDay.getTime();
  while (storyTimestamps.length && storyTimestamps[0] < cutoff) {
    storyTimestamps.shift();
  }
}

/** How many stories have been posted today. */
function storiesPostedToday() {
  evictOldStories();
  return storyTimestamps.length;
}

/**
 * Returns true if we can post another story today.
 * @param {number} maxPerDay  - daily story limit from preferences
 */
function canPostStory(maxPerDay) {
  const used = storiesPostedToday();
  if (used >= maxPerDay) {
    logger.warn(
      `Instagram story daily limit reached (${used}/${maxPerDay} stories today). ` +
      `Resets at midnight.`
    );
    return false;
  }
  return true;
}

/** Record a successfully published story. */
function recordStory() {
  evictOldStories();
  storyTimestamps.push(Date.now());
  logger.info(`Stories today: ${storyTimestamps.length}`);
}

/** Story status for the dashboard. */
function storyStatus(maxPerDay) {
  const used = storiesPostedToday();
  return { used, limit: maxPerDay, remaining: Math.max(0, maxPerDay - used) };
}

module.exports = { canPost, recordPost, status, canPostStory, recordStory, storyStatus };
