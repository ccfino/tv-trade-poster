/**
 * Meta Graph API helper — upload media and publish to Instagram.
 *
 * Docs:  https://developers.facebook.com/docs/instagram-api/guides/content-publishing
 * API:   https://graph.facebook.com/{VERSION}/{IG_USER_ID}/media
 */

const BASE = () => `https://graph.facebook.com/${process.env.META_API_VERSION || 'v19.0'}`;
const IG_ID = () => process.env.INSTAGRAM_ACCOUNT_ID;
const TOKEN = () => process.env.META_ACCESS_TOKEN;

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

async function apiPost(path, params) {
  const url = new URL(`${BASE()}${path}`);
  url.searchParams.set('access_token', TOKEN());
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), { method: 'POST' });
  const data = await res.json();
  if (data.error) throw new Error(`Meta API error: ${data.error.message}`);
  return data;
}

async function apiGet(path, params = {}) {
  const url = new URL(`${BASE()}${path}`);
  url.searchParams.set('access_token', TOKEN());
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString());
  const data = await res.json();
  if (data.error) throw new Error(`Meta API error: ${data.error.message}`);
  return data;
}

// ---------------------------------------------------------------------------
// Step 1 — Create a media container
// ---------------------------------------------------------------------------

async function createPhotoContainer(imageUrl, caption) {
  console.log(`[instagram] Creating IG photo container: ${imageUrl}`);
  const data = await apiPost(`/${IG_ID()}/media`, {
    image_url: imageUrl,
    caption,
    media_type: 'IMAGE',
  });
  console.log(`[instagram] Photo container created: ${data.id}`);
  return data.id;
}

async function createStoryContainer(imageUrl) {
  console.log(`[instagram] Creating IG story container: ${imageUrl}`);
  const data = await apiPost(`/${IG_ID()}/media`, {
    image_url: imageUrl,
    media_type: 'STORIES',
  });
  console.log(`[instagram] Story container created: ${data.id}`);
  return data.id;
}

// ---------------------------------------------------------------------------
// Step 2 — Poll until container status is FINISHED
// ---------------------------------------------------------------------------

async function waitForContainer(containerId, maxWaitMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const { status_code } = await apiGet(`/${containerId}`, { fields: 'status_code' });
    console.log(`[instagram] Container ${containerId} status: ${status_code}`);
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
  console.log(`[instagram] Publishing container: ${containerId}`);
  const data = await apiPost(`/${IG_ID()}/media_publish`, {
    creation_id: containerId,
  });
  console.log(`[instagram] Published! IG media ID: ${data.id}`);
  return data.id;
}

// ---------------------------------------------------------------------------
// Retry helper
// ---------------------------------------------------------------------------

async function retryWithBackoff(fn, { label = 'op', maxAttempts = 3, baseDelay = 3000 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      console.error(`[instagram] ${label} attempt ${attempt}/${maxAttempts} failed: ${err.message}`);
      if (attempt < maxAttempts) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
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
export async function postImage(imageUrl, caption) {
  return retryWithBackoff(async () => {
    const containerId = await createPhotoContainer(imageUrl, caption);
    await publishContainer(containerId);
    return containerId;
  }, { label: 'postImage', maxAttempts: 3, baseDelay: 3000 });
}

/**
 * Post an image as an Instagram Story.
 * @param {string} imageUrl   - public URL
 * @returns {string|null}     - IG media ID, or null on failure
 */
export async function postStory(imageUrl) {
  return retryWithBackoff(async () => {
    const containerId = await createStoryContainer(imageUrl);
    await publishContainer(containerId);
    return containerId;
  }, { label: 'postStory', maxAttempts: 3, baseDelay: 3000 });
}
