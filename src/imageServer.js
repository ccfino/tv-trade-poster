'use strict';

/**
 * A minimal HTTP server that serves files from /output/temp so that the
 * Meta Graph API can fetch the images via a public URL.
 *
 * For production, replace this with S3 or another CDN (set IMAGE_HOST_TYPE=s3
 * in .env and implement the S3 uploader).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const TEMP_DIR = path.join(__dirname, '../output/temp');
let server = null;

function start(port) {
  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      const filePath = path.join(TEMP_DIR, path.basename(req.url.split('?')[0]));
      if (!filePath.startsWith(TEMP_DIR)) {
        res.writeHead(403);
        return res.end('Forbidden');
      }
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          return res.end('Not found');
        }
        const ext = path.extname(filePath).toLowerCase();
        const mime = ext === '.mp4' ? 'video/mp4' : ext === '.jpg' ? 'image/jpeg' : 'image/png';
        res.writeHead(200, { 'Content-Type': mime });
        res.end(data);
      });
    });

    server.listen(port, () => {
      logger.info(`Image server listening on port ${port}`);
      resolve();
    });

    server.on('error', reject);
  });
}

function stop() {
  if (server) server.close();
}

/**
 * Given a local file path, return the public URL that Meta can fetch.
 */
function toPublicUrl(localPath) {
  const base = process.env.IMAGE_SERVER_PUBLIC_URL || `http://localhost:${process.env.IMAGE_SERVER_PORT || 3500}`;
  return `${base.replace(/\/$/, '')}/${path.basename(localPath)}`;
}

module.exports = { start, stop, toPublicUrl };
