# ── Stage 1: Install dependencies ────────────────────────────────────────────
FROM node:20-slim AS deps

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3 \
    pkg-config \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg62-turbo-dev \
    libgif-dev \
    librsvg2-dev \
    libpixman-1-dev \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── Stage 2: Production image ────────────────────────────────────────────────
FROM node:20-slim AS runner

# Runtime libs for canvas/sharp + ffmpeg for reel conversion
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libjpeg62-turbo \
    libgif7 \
    librsvg2-2 \
    libpixman-1-0 \
    ffmpeg \
    curl \
    tini \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source
COPY package.json ./
COPY src/ ./src/
COPY assets/ ./assets/
COPY public/ ./public/
COPY scripts/ ./scripts/

# Create directories the app expects
RUN mkdir -p output/temp logs

# Dashboard port (main entry point for health checks)
EXPOSE 3501
# Image server port (serves temp files to Meta API)
EXPOSE 3500

# Use tini for proper signal handling (SIGTERM/SIGINT)
ENTRYPOINT ["tini", "--"]

CMD ["node", "src/index.js"]
