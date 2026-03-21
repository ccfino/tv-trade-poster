import { buildCaption } from './captionBuilder';
import { postImage, postStory } from './instagram';
import { canPost, recordPost as recordRate } from './rateLimiter';
import { recordPost as recordPerf } from './performanceTracker';
import { upsertPost, appendLog, getPreferences } from './kv';

function log(level, message) {
  const entry = { level, message, time: new Date().toISOString() };
  console.log(`[${level}] ${message}`);
  return appendLog(entry);
}

export async function processRec(rec) {
  const label = `[${rec.channel || '?'} | ${rec.stock} ${rec.action}]`;
  await log('info', `Processing ${label}`);

  // Mark as processing
  await upsertPost({ rec, status: 'processing', time: rec.timestamp || new Date().toISOString() });

  try {
    const caption = buildCaption(rec);
    const prefs = await getPreferences();
    const imageUrl = rec.tvFrameImageUrl;

    if (!imageUrl) {
      await upsertPost({ rec, status: 'failed', error: 'No image URL (frame_url missing)', time: rec.timestamp || new Date().toISOString() });
      await log('warn', `${label} No frame_url — skipping`);
      return;
    }

    if (!(await canPost())) {
      await upsertPost({ rec, status: 'failed', error: 'Daily Instagram limit reached', time: rec.timestamp || new Date().toISOString() });
      return;
    }

    let postId = null;
    if (prefs.postToFeed) {
      postId = await postImage(imageUrl, caption);
      await recordRate();
      await log('info', `${label} Feed posted. ID: ${postId}`);
    }

    let storyId = null;
    if (prefs.postToStory) {
      try {
        storyId = await postStory(imageUrl);
        await log('info', `${label} Story posted. ID: ${storyId}`);
      } catch (err) {
        await log('error', `${label} Story failed: ${err.message}`);
      }
    }

    await upsertPost({ rec, status: 'posted', postId, storyId, postImageUrl: imageUrl, time: rec.timestamp || new Date().toISOString() });
    await recordPerf({ stock: rec.stock, action: rec.action, channel: rec.channel, tradeType: rec.tradeType, postId, storyId, imageUrl });
    await log('info', `${label} Done`);

  } catch (err) {
    await log('error', `${label} Pipeline error: ${err.message}`);
    await upsertPost({ rec, status: 'failed', error: err.message, time: rec.timestamp || new Date().toISOString() });
  }
}
