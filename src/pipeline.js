'use strict';

/**
 * Core processing pipeline for a single recommendation:
 *
 * When rec.tvFrameImageUrl is present (frame_url from the trade doc):
 *   1. Use that URL directly as the Instagram image — no generation needed
 *   2. Build caption and post to Instagram
 *
 * When rec.tvFrameImageUrl is absent (fallback):
 *   1. Generate 1080x1080 (post) and 1080x1920 (reel) images via canvas
 *   2. Serve locally, build caption, post to Instagram
 *   3. Clean up temp files
 */

const path = require('path');
const logger = require('./logger');
const { downloadImage, unlinkSafe } = require('./utils');
const { generateImages } = require('./imageGenerator');
const { convertToReel } = require('./reelConverter');
const { postImage, postReel, postStory } = require('./instagramApi');
const { buildCaption } = require('./captionBuilder');
const imageServer = require('./imageServer');
const appEvents = require('./appEvents');
const rateLimiter = require('./rateLimiter');
const preferences = require('./preferences');
const performanceTracker = require('./performanceTracker');

// Timestamps of recent feed posts for frequency limiting
const recentPostTimestamps = [];

const TEMP_DIR = path.join(__dirname, '../output/temp');
const DRY_RUN = process.argv.includes('--dry-run');

if (DRY_RUN) {
  logger.warn('=== DRY RUN MODE — Instagram posting is disabled ===');
}

/**
 * Check posting frequency cap. Returns true if allowed to post.
 */
function checkFrequencyCap(prefs) {
  const freq = prefs.postingFrequency;
  if (!freq || !freq.enabled) return true;

  const maxPosts = freq.maxPosts || 1;
  const perUnit  = freq.perUnit  || 'hour';

  const windowMs = perUnit === 'minute' ? 60_000
                 : perUnit === 'hour'   ? 3_600_000
                 :                        86_400_000; // day

  const cutoff = Date.now() - windowMs;
  // Evict old timestamps
  while (recentPostTimestamps.length && recentPostTimestamps[0] <= cutoff) {
    recentPostTimestamps.shift();
  }

  if (recentPostTimestamps.length >= maxPosts) {
    const nextAllowed = recentPostTimestamps[0] + windowMs;
    const waitSec = Math.ceil((nextAllowed - Date.now()) / 1000);
    logger.warn(
      `Posting frequency cap reached (${recentPostTimestamps.length}/${maxPosts} per ${perUnit}). ` +
      `Next post allowed in ~${waitSec}s.`
    );
    return false;
  }
  return true;
}

/**
 * Process one recommendation object end-to-end.
 * Errors are caught and logged; this never throws.
 */
async function processRecommendation(rec) {
  const label = `[${rec.channel || '?'} | ${rec.stock} ${rec.action}]`;
  logger.info(`Processing recommendation ${label}`);
  appEvents.emit('processing_start', { stock: rec.stock });

  const filesToClean = [];

  try {
    const caption = buildCaption(rec);
    appEvents.emit('caption_ready', { stock: rec.stock, caption });

    const prefs = preferences.get();

    if (rec.tvFrameImageUrl) {
      // ── Fast path: use the frame_url directly ──────────────────────────
      logger.info(`${label} Using frame_url directly: ${rec.tvFrameImageUrl}`);
      appEvents.emit('images_generated', { stock: rec.stock, postPath: rec.tvFrameImageUrl, reelPath: null, caption });

      if (DRY_RUN) {
        logger.info(`${label} DRY RUN — skipping Instagram upload`);
        logger.info(`  Frame URL : ${rec.tvFrameImageUrl}`);
        appEvents.emit('dry_run', { stock: rec.stock, postPath: rec.tvFrameImageUrl, reelPath: null, caption });
        return;
      }

      if (!rateLimiter.canPost()) {
        appEvents.emit('post_failed', { stock: rec.stock, error: 'Daily Instagram limit reached' });
        return;
      }

      if (!checkFrequencyCap(prefs)) {
        appEvents.emit('post_failed', { stock: rec.stock, error: 'Posting frequency cap reached' });
        return;
      }

      let result = null;
      if (prefs.postToFeed) {
        result = await postImage(rec.tvFrameImageUrl, caption);
        rateLimiter.recordPost();
        recentPostTimestamps.push(Date.now());
        logger.info(`${label} Image posted successfully. ID: ${result}`);
        appEvents.emit('post_success', { stock: rec.stock, postId: result, caption });
      }
      let storyId = null;
      if (prefs.postToStory) {
        const maxStories = prefs.maxStoriesPerDay != null ? prefs.maxStoriesPerDay : 20;
        if (rateLimiter.canPostStory(maxStories)) {
          try {
            storyId = await postStory(rec.tvFrameImageUrl);
            rateLimiter.recordStory();
            logger.info(`${label} Story posted. ID: ${storyId}`);
            appEvents.emit('story_success', { stock: rec.stock, storyId });
          } catch (err) {
            logger.error(`${label} Story failed: ${err.message}`);
          }
        } else {
          logger.warn(`${label} Story skipped — daily story limit reached.`);
        }
      }
      performanceTracker.recordPost({
        stock: rec.stock, action: rec.action, channel: rec.channel,
        tradeType: rec.tradeType, postId: result, storyId, imageUrl: rec.tvFrameImageUrl,
        exitReason: rec.exitReason,
      });

    } else {
      // ── Fallback: generate image via canvas template ───────────────────
      const { postPath, reelPath } = await generateImages(rec, null, TEMP_DIR);
      filesToClean.push(postPath, reelPath);
      appEvents.emit('images_generated', { stock: rec.stock, postPath, reelPath, caption });

      if (DRY_RUN) {
        logger.info(`${label} DRY RUN — skipping Instagram upload`);
        logger.info(`  Post image : ${postPath}`);
        logger.info(`  Reel image : ${reelPath}`);
        appEvents.emit('dry_run', { stock: rec.stock, postPath, reelPath, caption });
        filesToClean.length = 0;
        return;
      }

      if (!rateLimiter.canPost()) {
        appEvents.emit('post_failed', { stock: rec.stock, error: 'Daily Instagram limit reached' });
        return;
      }

      if (!checkFrequencyCap(prefs)) {
        appEvents.emit('post_failed', { stock: rec.stock, error: 'Posting frequency cap reached' });
        return;
      }

      const postUrl = imageServer.toPublicUrl(postPath);
      let result = null;
      if (prefs.postToFeed) {
        result = await postImage(postUrl, caption);
        rateLimiter.recordPost();
        recentPostTimestamps.push(Date.now());
        logger.info(`${label} Image posted successfully. ID: ${result}`);
        appEvents.emit('post_success', { stock: rec.stock, postId: result, caption });
      }
      let storyId = null;
      if (prefs.postToStory) {
        const maxStories = prefs.maxStoriesPerDay != null ? prefs.maxStoriesPerDay : 20;
        if (rateLimiter.canPostStory(maxStories)) {
          try {
            const storyUrl = imageServer.toPublicUrl(reelPath);
            storyId = await postStory(storyUrl);
            rateLimiter.recordStory();
            logger.info(`${label} Story posted. ID: ${storyId}`);
            appEvents.emit('story_success', { stock: rec.stock, storyId });
          } catch (err) {
            logger.error(`${label} Story failed: ${err.message}`);
          }
        } else {
          logger.warn(`${label} Story skipped — daily story limit reached.`);
        }
      }
      performanceTracker.recordPost({
        stock: rec.stock, action: rec.action, channel: rec.channel,
        tradeType: rec.tradeType, postId: result, storyId, imageUrl: postUrl,
        exitReason: rec.exitReason,
      });
    }

  } catch (err) {
    logger.error(`${label} Pipeline error: ${err.message}`, err);
    appEvents.emit('post_failed', { stock: rec.stock, error: err.message });
  } finally {
    // Delay cleanup by 10 minutes so the dashboard can display the images
    if (filesToClean.length) {
      setTimeout(() => filesToClean.forEach(unlinkSafe), 10 * 60 * 1000);
    }
  }
}

module.exports = { processRecommendation };
