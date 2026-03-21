# TV Trade Poster

Listens to a WebSocket feed of stock/F&O trading recommendations from news TV channels,
auto-generates attractive 1080×1080 (Post) and 1080×1920 (Reel) images, then posts them
to Instagram using the Meta Graph API.

```
WebSocket → Parse Recommendation → Generate Image → Post to Instagram (Image + Reel)
```

---

## Requirements

| Dependency | Notes |
|---|---|
| Node.js ≥ 18 | |
| `ffmpeg` binary in PATH | Required for Reel MP4 conversion |
| `canvas` native build deps | See below |

### canvas / node-canvas native dependencies

On **macOS**:
```bash
brew install pkg-config cairo pango libpng jpeg giflib librsvg
```

On **Ubuntu / Debian**:
```bash
sudo apt-get install build-essential libcairo2-dev libpango1.0-dev \
  libjpeg-dev libgif-dev librsvg2-dev
```

On **Amazon Linux 2 / AL2023**:
```bash
sudo yum install gcc-c++ cairo-devel pango-devel libjpeg-turbo-devel \
  giflib-devel librsvg2-devel
```

---

## Installation

```bash
cd tv-trade-poster
npm install

# Download Poppins fonts (optional but recommended)
bash scripts/download-fonts.sh
```

---

## Configuration

```bash
cp .env.example .env
```

Edit `.env`:

```ini
# Required
WEBSOCKET_URL=wss://your-feed-server/recommendations
INSTAGRAM_ACCOUNT_ID=17841400000000000
META_ACCESS_TOKEN=EAAxxxxxxxxxxxxxxxx

# Public URL where Meta API can fetch your images
# Must be reachable from the internet (use ngrok for local testing)
IMAGE_SERVER_PUBLIC_URL=https://your-server.com

# Optional
META_API_VERSION=v19.0
IMAGE_SERVER_PORT=3500
WATERMARK_TEXT=@YourHandle • StockAlerts
LOG_LEVEL=info
```

### Meta / Instagram API setup

1. Create a **Meta Developer App** at https://developers.facebook.com/
2. Add the **Instagram Graph API** product
3. Connect your **Instagram Business or Creator account**
4. Generate a **long-lived access token** (expires in 60 days — automate refresh)
5. Note your **Instagram Business Account ID** (not the profile username)

Required permissions: `instagram_basic`, `instagram_content_publish`

---

## Running

### Production
```bash
npm start
```

### Development (auto-restarts on file changes — Node 18+)
```bash
npm run dev
```

### Dry run (generates images, skips Instagram posting)
```bash
npm run dry-run
# or
node src/index.js --dry-run
```

Generated images are saved to `output/temp/` and **not deleted** in dry-run mode so you can inspect them.

---

## Testing locally with the mock WebSocket server

```bash
# Terminal 1 — start mock WS server (sends a sample recommendation every 5s)
node test-mock.js

# Terminal 2 — run the service in dry-run mode
WEBSOCKET_URL=ws://localhost:8765 node src/index.js --dry-run
```

Check `output/temp/` for the generated PNG files after a few seconds.

---

## Project structure

```
tv-trade-poster/
├── src/
│   ├── index.js          ← entry point
│   ├── websocket.js      ← WebSocket client with auto-reconnect
│   ├── pipeline.js       ← orchestrates the full processing pipeline
│   ├── imageGenerator.js ← canvas-based image generation (Template A & B)
│   ├── reelConverter.js  ← ffmpeg: PNG → 10s MP4 with Ken Burns effect
│   ├── instagramApi.js   ← Meta Graph API: upload + publish
│   ├── captionBuilder.js ← auto-generates captions and hashtags
│   ├── imageServer.js    ← tiny HTTP server to serve temp images to Meta
│   ├── logger.js         ← winston logger
│   └── utils.js          ← helpers (download, formatPrice, retry, …)
├── assets/
│   └── fonts/            ← Poppins TTF files (run scripts/download-fonts.sh)
├── output/
│   └── temp/             ← temporary image/video files (auto-cleaned after upload)
├── logs/                 ← rotating log files (auto-created)
├── scripts/
│   └── download-fonts.sh ← downloads Poppins from Google Fonts GitHub
├── test-mock.js          ← mock WebSocket server for local testing
├── .env.example          ← copy to .env and fill in credentials
└── package.json
```

---

## Image templates

| Template | When used | Layout |
|---|---|---|
| **A** | `tvFrameImageUrl` is present and reachable | TV frame screenshot on left (square) or top (reel) + price card |
| **B** | No TV frame URL (fallback) | Full-card gradient with large stock name, BUY/SELL badge, price table |

Both templates use:
- 1080×1080 for Instagram Posts
- 1080×1920 for Instagram Reels
- Dark navy/black gradient background with gold accents
- Green badge for BUY, red badge for SELL

---

## WebSocket message format

```json
{
  "channel":         "CNBC TV18",
  "type":            "equity",
  "stock":           "Reliance Industries",
  "action":          "BUY",
  "entry":           2640,
  "target":          [2800, 2950],
  "stopLoss":        2580,
  "analyst":         "Rajesh Palviya",
  "timestamp":       "2024-03-15T10:30:00.000Z",
  "tvFrameImageUrl": "https://cdn.example.com/frames/abc123.jpg"
}
```

`target` can be a single number, a string range like `"2800-2950"`, or an array.
`tvFrameImageUrl` and `analyst` are optional.

---

## Logs

- Console: all levels (configured via `LOG_LEVEL` env var)
- `logs/combined.log`: all levels
- `logs/error.log`: errors only

---

## Deploying to a server

1. The service needs to be publicly accessible for Meta to fetch images.
   Use **nginx** as a reverse proxy, or set `IMAGE_HOST_TYPE=s3` and implement S3 upload
   in `imageServer.js` (stubs are ready).
2. Use **PM2** or **systemd** to keep the process running:
   ```bash
   npm install -g pm2
   pm2 start src/index.js --name tv-trade-poster
   pm2 save && pm2 startup
   ```
3. Meta access tokens expire every 60 days — set up a cron job to refresh them using
   the long-lived token endpoint.

---

## Disclaimer

Images generated by this tool are for educational/informational purposes only and do not
constitute SEBI-registered investment advice.
