'use strict';

/**
 * Meta Graph API helper — upload media and publish to Instagram.
 *
 * Docs:  https://developers.facebook.com/docs/instagram-api/guides/content-publishing
 * API:   https://graph.facebook.com/{VERSION}/{IG_USER_ID}/media
 */

const axios = require('axios');
const logger = require('./logger');
const { retryWithBackoff } = require('./utils');

const BASE = `https://graph.facebook.com/${process.env.META_API_VERSION || 'v19.0'}`;
const IG_ID = () => process.env.INSTAGRAM_ACCOUNT_ID;
const TOKEN = () => process.env.META_ACCESS_TOKEN;

/** Shared axios instance */
const api = axios.create({ baseURL: BASE, timeout: 60_000 });

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

async function apiPost(path, params) {
  const { data } = await api.post(path, null, {
    params: { access_token: TOKEN(), ...params },
  });
  return data;
}

async function apiGet(path, params = {}) {
  const { data } = await api.get(path, {
    params: { access_token: TOKEN(), ...params },
  });
  return data;
}

// ---------------------------------------------------------------------------
// Step 1 — Create a media container
// ---------------------------------------------------------------------------

/**
 * Upload a photo container (single image post).
 * @param {string} imageUrl   - publicly accessible URL of the image
 * @param {string} caption
 * @returns {string}  container ID
 */
async function createPhotoContainer(imageUrl, caption) {
  logger.info(`Creating IG photo container: ${imageUrl}`);
  const data = await apiPost(`/${IG_ID()}/media`, {
    image_url: imageUrl,
    caption,
    media_type: 'IMAGE',
  });
  logger.info(`Photo container created: ${data.id}`);
  return data.id;
}

/**
 * Upload a Reel video container.
 * @param {string} videoUrl   - publicly accessible URL of the MP4
 * @param {string} caption
 * @returns {string}  container ID
 */
async function createReelContainer(videoUrl, caption) {
  logger.info(`Creating IG reel container: ${videoUrl}`);
  const data = await apiPost(`/${IG_ID()}/media`, {
    video_url: videoUrl,
    caption,
    media_type: 'REELS',
    share_to_feed: 'true',
  });
  logger.info(`Reel container created: ${data.id}`);
  return data.id;
}

async function createStoryContainer(imageUrl) {
  logger.info(`Creating IG story container: ${imageUrl}`);
  const data = await apiPost(`/${IG_ID()}/media`, {
    image_url: imageUrl,
    media_type: 'STORIES',
  });
  logger.info(`Story container created: ${data.id}`);
  return data.id;
}

// ---------------------------------------------------------------------------
// Step 2 — Poll until container status is FINISHED
// ---------------------------------------------------------------------------

async function waitForContainer(containerId, maxWaitMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const { status_code } = await apiGet(`/${containerId}`, { fields: 'status_code' });
    logger.debug(`Container ${containerId} status: ${status_code}`);
    if (status_code === 'FINISHED') return;
    if (status_code === 'ERROR') throw new Error(`Container ${containerId} failed with ERROR status`);
    await new Promise((r) => setTimeout(r, 5_000));
  }
  throw new Error(`Container ${containerId} timed out waiting for FINISHED status`);
}

// ---------------------------------------------------------------------------
// Step 3 — Publish
// ---------------------------------------------------------------------------

async function publishContainer(containerId) {
  logger.info(`Publishing container: ${containerId}`);
  const data = await apiPost(`/${IG_ID()}/media_publish`, {
    creation_id: containerId,
  });
  logger.info(`Published! IG media ID: ${data.id}`);
  return data.id;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Post a single image to Instagram.
 * @param {string} imageUrl   - public URL
 * @param {string} caption
 * @returns {string|null}     - IG media ID, or null on failure
 */
async function postImage(imageUrl, caption) {
  return retryWithBackoff(async () => {
    const containerId = await createPhotoContainer(imageUrl, caption);
    await publishContainer(containerId);
    return containerId;
  }, { label: 'postImage', maxAttempts: 3, baseDelay: 3000 });
}

/**
 * Post a Reel to Instagram.
 * @param {string} videoUrl   - public URL of MP4
 * @param {string} caption
 * @returns {string|null}     - IG media ID, or null on failure
 */
async function postReel(videoUrl, caption) {
  return retryWithBackoff(async () => {
    const containerId = await createReelContainer(videoUrl, caption);
    await waitForContainer(containerId);
    await publishContainer(containerId);
    return containerId;
  }, { label: 'postReel', maxAttempts: 3, baseDelay: 5000 });
}

/**
 * Post an image as an Instagram Story.
 * @param {string} imageUrl   - public URL
 * @returns {string|null}     - IG media ID, or null on failure
 */
async function postStory(imageUrl) {
  return retryWithBackoff(async () => {
    const containerId = await createStoryContainer(imageUrl);
    await publishContainer(containerId);
    return containerId;
  }, { label: 'postStory', maxAttempts: 3, baseDelay: 3000 });
}

module.exports = { postImage, postReel, postStory };
