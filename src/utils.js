const axios = require('axios');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

/**
 * Download a remote image to a local temp file.
 * Returns the local file path, or null on failure.
 */
async function downloadImage(url, destDir = path.join(__dirname, '../output/temp')) {
  try {
    const filename = `frame_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
    const destPath = path.join(destDir, filename);

    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 10_000,
    });

    fs.writeFileSync(destPath, response.data);
    logger.debug(`Downloaded image: ${url} → ${destPath}`);
    return destPath;
  } catch (err) {
    logger.warn(`Failed to download image from ${url}: ${err.message}`);
    return null;
  }
}

/**
 * Format a price value for display.  Handles numbers and strings like "2600-2650".
 */
function formatPrice(value) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') return `₹${value.toLocaleString('en-IN')}`;
  // Already a formatted string (e.g. range)
  if (typeof value === 'string') {
    const num = parseFloat(value);
    if (!isNaN(num) && String(num) === value) return `₹${num.toLocaleString('en-IN')}`;
    return value.includes('₹') ? value : `₹${value}`;
  }
  return String(value);
}

/**
 * Format an array of targets for display.
 */
function formatTargets(target) {
  if (!target) return '—';
  const arr = Array.isArray(target) ? target : [target];
  return arr.map(formatPrice).join(' / ');
}

/**
 * Delete a file silently (used to clean up temp images).
 */
function unlinkSafe(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (_) {}
}

/**
 * Sleep for `ms` milliseconds.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry an async function with exponential backoff.
 */
async function retryWithBackoff(fn, { maxAttempts = 3, baseDelay = 2000, label = 'op' } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const delay = baseDelay * 2 ** (attempt - 1);
      logger.warn(`${label} failed (attempt ${attempt}/${maxAttempts}): ${err.message}. Retrying in ${delay}ms…`);
      if (attempt < maxAttempts) await sleep(delay);
    }
  }
  throw lastErr;
}

module.exports = { downloadImage, formatPrice, formatTargets, unlinkSafe, sleep, retryWithBackoff };
