'use strict';

/**
 * Convert a static PNG image into a 10-second MP4 with a subtle Ken Burns
 * (slow zoom) effect using fluent-ffmpeg.
 *
 * This is required when posting as an Instagram Reel, which needs a video file.
 */

const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const logger = require('./logger');

/**
 * @param {string} imagePath  - path to source PNG (1080x1920)
 * @param {string} outputDir  - directory to write the MP4
 * @returns {Promise<string>}  - path to the generated MP4
 */
function convertToReel(imagePath, outputDir) {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(
      outputDir,
      path.basename(imagePath, path.extname(imagePath)) + '_reel.mp4'
    );

    logger.info(`Converting image to MP4 reel: ${imagePath} → ${outputPath}`);

    ffmpeg(imagePath)
      // Treat still image as a looped source for 10 seconds
      .inputOptions(['-loop 1', '-t 10'])
      // Ken Burns: slow zoom-in from 100% to 108% over 10 s using zoompan filter
      .videoFilter(
        "zoompan=z='min(zoom+0.0008,1.08)':d=250:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=25"
      )
      .outputOptions([
        '-c:v libx264',
        '-pix_fmt yuv420p',
        '-r 25',
        '-movflags +faststart',
        // Silence: Instagram requires audio track for some reel uploads
        '-f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100',
        '-c:a aac',
        '-shortest',
      ])
      // Override output with inputs ordered correctly
      .on('start', (cmd) => logger.debug(`ffmpeg cmd: ${cmd}`))
      .on('error', (err) => {
        logger.error(`ffmpeg error: ${err.message}`);
        reject(err);
      })
      .on('end', () => {
        logger.info(`Reel MP4 ready: ${outputPath}`);
        resolve(outputPath);
      })
      .save(outputPath);
  });
}

module.exports = { convertToReel };
