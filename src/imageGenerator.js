'use strict';

const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
const fs = require('fs');
const logger = require('./logger');
const { formatPrice, formatTargets } = require('./utils');

// ---------------------------------------------------------------------------
// Font registration (embed Poppins from /assets/fonts if present)
// ---------------------------------------------------------------------------
const FONT_DIR = path.join(__dirname, '../assets/fonts');

function registerFonts() {
  const fonts = [
    { file: 'Poppins-Regular.ttf',    family: 'Poppins', weight: 'normal',  style: 'normal' },
    { file: 'Poppins-Bold.ttf',       family: 'Poppins', weight: 'bold',    style: 'normal' },
    { file: 'Poppins-SemiBold.ttf',   family: 'Poppins', weight: '600',     style: 'normal' },
    { file: 'Poppins-Italic.ttf',     family: 'Poppins', weight: 'normal',  style: 'italic' },
    { file: 'Poppins-Light.ttf',      family: 'Poppins', weight: '300',     style: 'normal' },
  ];
  for (const f of fonts) {
    const full = path.join(FONT_DIR, f.file);
    if (fs.existsSync(full)) {
      registerFont(full, { family: f.family, weight: f.weight, style: f.style });
    }
  }
}

try { registerFonts(); } catch (_) {}

// ---------------------------------------------------------------------------
// Design constants
// ---------------------------------------------------------------------------
const COLORS = {
  bg:           '#0A0E1A',     // deep navy
  bgGrad1:      '#0A0E1A',
  bgGrad2:      '#111827',
  accent:       '#F0B429',     // gold
  accentAlt:    '#FFD700',
  buy:          '#00E676',     // bright green
  sell:         '#FF1744',     // bright red
  white:        '#FFFFFF',
  dimWhite:     '#B0BEC5',
  cardBg:       'rgba(255,255,255,0.05)',
  cardBorder:   'rgba(240,180,41,0.35)',
  gridLine:     'rgba(255,255,255,0.04)',
  shadow:       'rgba(0,0,0,0.7)',
};

const FONT = {
  body:   (size) => `${size}px Poppins, sans-serif`,
  bold:   (size) => `bold ${size}px Poppins, sans-serif`,
  semi:   (size) => `600 ${size}px Poppins, sans-serif`,
  light:  (size) => `300 ${size}px Poppins, sans-serif`,
};

const WATERMARK = process.env.WATERMARK_TEXT || '@StockAlerts • TV Trade Picks';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Draw a rounded rectangle path */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** Fill a rounded rect */
function fillRoundRect(ctx, x, y, w, h, r, color) {
  ctx.fillStyle = color;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
}

/** Stroke a rounded rect */
function strokeRoundRect(ctx, x, y, w, h, r, color, lineWidth = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  roundRect(ctx, x, y, w, h, r);
  ctx.stroke();
}

/** Draw a dark gradient background with subtle grid texture */
function drawBackground(ctx, W, H) {
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, COLORS.bgGrad1);
  grad.addColorStop(1, COLORS.bgGrad2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Subtle diagonal grid lines
  ctx.strokeStyle = COLORS.gridLine;
  ctx.lineWidth = 1;
  const step = 60;
  for (let x = -H; x < W + H; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + H, H);
    ctx.stroke();
  }
  for (let x = W + H; x > -H; x -= step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x - H, H);
    ctx.stroke();
  }
}

/** Draw decorative gold corner accents */
function drawCornerAccents(ctx, W, H, size = 32, thickness = 3) {
  ctx.strokeStyle = COLORS.accent;
  ctx.lineWidth = thickness;
  const corners = [
    [0, 0, 1, 1],
    [W, 0, -1, 1],
    [0, H, 1, -1],
    [W, H, -1, -1],
  ];
  for (const [cx, cy, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx + dx * size, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + dy * size);
    ctx.stroke();
  }
}

/** Draw the gold top header bar */
function drawHeaderBar(ctx, W, rec) {
  const { channel = '', analyst = '', timestamp } = rec;
  const H_BAR = 80;

  // Bar background
  const barGrad = ctx.createLinearGradient(0, 0, W, 0);
  barGrad.addColorStop(0, 'rgba(240,180,41,0.18)');
  barGrad.addColorStop(1, 'rgba(240,180,41,0.04)');
  ctx.fillStyle = barGrad;
  ctx.fillRect(0, 0, W, H_BAR);

  // Left gold line
  ctx.fillStyle = COLORS.accent;
  ctx.fillRect(0, 0, 4, H_BAR);

  // Channel name
  ctx.font = FONT.bold(28);
  ctx.fillStyle = COLORS.accent;
  ctx.textAlign = 'left';
  ctx.fillText(channel.toUpperCase(), 24, 50);

  // Analyst
  if (analyst) {
    ctx.font = FONT.body(18);
    ctx.fillStyle = COLORS.dimWhite;
    const channelWidth = ctx.measureText(channel.toUpperCase()).width;
    ctx.fillText(`  ·  ${analyst}`, 24 + channelWidth, 50);
  }

  // Timestamp
  if (timestamp) {
    const ts = new Date(timestamp);
    const label = isNaN(ts) ? timestamp : ts.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
    ctx.font = FONT.light(16);
    ctx.fillStyle = COLORS.dimWhite;
    ctx.textAlign = 'right';
    ctx.fillText(label, W - 24, 50);
  }
}

/** Draw the BUY/SELL badge + stock name block */
function drawHeroSection(ctx, W, topY, rec) {
  const { stock = '', action = 'BUY', type = 'equity' } = rec;
  const isBuy = action.toUpperCase() === 'BUY';
  const badgeColor = isBuy ? COLORS.buy : COLORS.sell;

  // Action badge
  const BADGE_W = 180, BADGE_H = 56, BADGE_R = 12;
  const bx = W / 2 - BADGE_W / 2;
  fillRoundRect(ctx, bx, topY, BADGE_W, BADGE_H, BADGE_R, badgeColor);
  ctx.font = FONT.bold(30);
  ctx.fillStyle = COLORS.bg;
  ctx.textAlign = 'center';
  ctx.fillText(action.toUpperCase(), W / 2, topY + 38);

  // Stock name
  const stockY = topY + BADGE_H + 22;
  ctx.font = FONT.bold(64);
  ctx.fillStyle = COLORS.white;
  ctx.textAlign = 'center';
  // Scale down if name is long
  let fontSize = 64;
  while (ctx.measureText(stock.toUpperCase()).width > W - 80 && fontSize > 28) {
    fontSize -= 4;
    ctx.font = FONT.bold(fontSize);
  }
  ctx.fillText(stock.toUpperCase(), W / 2, stockY + fontSize);

  // Type pill
  const typePillW = 140, typePillH = 34;
  const typePillX = W / 2 - typePillW / 2;
  const typePillY = stockY + fontSize + 16;
  fillRoundRect(ctx, typePillX, typePillY, typePillW, typePillH, 17, 'rgba(240,180,41,0.15)');
  strokeRoundRect(ctx, typePillX, typePillY, typePillW, typePillH, 17, COLORS.accent, 1.5);
  ctx.font = FONT.semi(16);
  ctx.fillStyle = COLORS.accent;
  ctx.textAlign = 'center';
  ctx.fillText(type.toUpperCase() === 'F&O' ? 'F & O' : 'EQUITY', W / 2, typePillY + 23);

  return typePillY + typePillH; // bottom Y
}

/** Draw the price info card (Entry / Target(s) / Stop Loss) */
function drawPriceCard(ctx, W, topY, rec, paddingX = 60) {
  const { entry, target, stopLoss, exitPrice, exitReason, isClosed, returnPct } = rec;
  const targetsArr = Array.isArray(target) ? target : target ? [target] : [];

  const rows = [];
  if (entry !== undefined && entry !== null) rows.push({ label: 'ENTRY', value: formatPrice(entry), color: COLORS.white });

  if (isClosed && exitPrice != null) {
    // For closed trades show exit price instead of / in addition to target
    const isTarget = exitReason === 'TARGET_HIT';
    const exitLabel = isTarget ? 'EXIT (TARGET)' : 'EXIT (SL HIT)';
    const exitColor = isTarget ? '#00E676' : '#FF1744';
    rows.push({ label: exitLabel, value: formatPrice(exitPrice), color: exitColor });
    if (returnPct !== null && returnPct !== undefined) {
      const sign = returnPct >= 0 ? '+' : '';
      rows.push({ label: 'RETURN', value: `${sign}${returnPct.toFixed(2)}%`, color: returnPct >= 0 ? '#00E676' : '#FF1744' });
    }
  } else {
    for (let i = 0; i < targetsArr.length; i++) {
      const label = targetsArr.length === 1 ? 'TARGET' : `TARGET ${i + 1}`;
      rows.push({ label, value: formatPrice(targetsArr[i]), color: '#00E676' });
    }
  }
  if (stopLoss !== undefined && stopLoss !== null) rows.push({ label: 'STOP LOSS', value: formatPrice(stopLoss), color: '#FF6B6B' });

  const ROW_H = 68, CARD_R = 16;
  const CARD_H = rows.length * ROW_H + 32;
  const CARD_W = W - paddingX * 2;
  const cx = paddingX, cy = topY + 24;

  // Card shadow
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 24;
  fillRoundRect(ctx, cx, cy, CARD_W, CARD_H, CARD_R, COLORS.cardBg);
  ctx.shadowBlur = 0;
  strokeRoundRect(ctx, cx, cy, CARD_W, CARD_H, CARD_R, COLORS.cardBorder, 1.5);

  rows.forEach((row, i) => {
    const ry = cy + 16 + i * ROW_H;
    if (i > 0) {
      // Divider
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx + 24, ry);
      ctx.lineTo(cx + CARD_W - 24, ry);
      ctx.stroke();
    }

    // Label
    ctx.font = FONT.semi(15);
    ctx.fillStyle = COLORS.dimWhite;
    ctx.textAlign = 'left';
    ctx.fillText(row.label, cx + 28, ry + 42);

    // Value dot accent
    ctx.fillStyle = row.color;
    ctx.beginPath();
    ctx.arc(cx + CARD_W - 28 - ctx.measureText(row.value).width - 16, ry + 37, 5, 0, Math.PI * 2);
    ctx.fill();

    // Value
    ctx.font = FONT.bold(26);
    ctx.fillStyle = row.color;
    ctx.textAlign = 'right';
    ctx.fillText(row.value, cx + CARD_W - 28, ry + 44);
  });

  return cy + CARD_H;
}

/** Draw watermark at the bottom */
function drawWatermark(ctx, W, H) {
  ctx.font = FONT.semi(18);
  ctx.fillStyle = 'rgba(240,180,41,0.55)';
  ctx.textAlign = 'center';
  ctx.fillText(WATERMARK, W / 2, H - 28);

  // Bottom accent line
  ctx.fillStyle = 'rgba(240,180,41,0.25)';
  ctx.fillRect(W / 2 - 120, H - 16, 240, 2);
}

/**
 * Draw a prominent outcome banner for closed trades (TARGET HIT / STOP LOSS HIT).
 * Placed below the header bar.
 */
function drawOutcomeBanner(ctx, W, rec) {
  if (!rec.isClosed || !rec.exitReason) return;

  const isTarget  = rec.exitReason === 'TARGET_HIT';
  const isSL      = rec.exitReason === 'SL_HIT';
  if (!isTarget && !isSL) return;

  const text        = isTarget ? '🎯  TARGET HIT' : '🛑  STOP LOSS HIT';
  const bgColor     = isTarget ? 'rgba(0,230,118,0.18)' : 'rgba(255,23,68,0.18)';
  const borderColor = isTarget ? '#00E676'              : '#FF1744';
  const textColor   = isTarget ? '#00E676'              : '#FF5252';

  const BANNER_H = 52;
  const BANNER_Y = 80;   // right below header bar

  // Background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, BANNER_Y, W, BANNER_H);

  // Top & bottom borders
  ctx.fillStyle = borderColor;
  ctx.fillRect(0, BANNER_Y, W, 2);
  ctx.fillRect(0, BANNER_Y + BANNER_H - 2, W, 2);

  // Text
  ctx.font = FONT.bold(28);
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.fillText(text, W / 2, BANNER_Y + 36);

  // Return % if available
  if (rec.returnPct !== undefined && rec.returnPct !== null) {
    const sign = rec.returnPct >= 0 ? '+' : '';
    ctx.font = FONT.semi(18);
    ctx.fillStyle = textColor;
    ctx.fillText(`${sign}${rec.returnPct.toFixed(2)}%`, W / 2, BANNER_Y + 58);
  }
}

// ---------------------------------------------------------------------------
// Template B — No TV frame (full card design)
// ---------------------------------------------------------------------------
async function renderTemplateB(rec, W, H) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  drawBackground(ctx, W, H);
  drawCornerAccents(ctx, W, H);
  drawHeaderBar(ctx, W, rec);
  drawOutcomeBanner(ctx, W, rec);

  // Shift hero down if outcome banner is shown
  const contentTop = (rec.isClosed && (rec.exitReason === 'TARGET_HIT' || rec.exitReason === 'SL_HIT'))
    ? 150  // header (80) + banner (52) + gap (18)
    : 104;

  const heroBottom = drawHeroSection(ctx, W, contentTop, rec);
  drawPriceCard(ctx, W, heroBottom + 16, rec);
  drawWatermark(ctx, W, H);

  // Glowing radial behind stock name
  const glow = ctx.createRadialGradient(W / 2, H * 0.38, 0, W / 2, H * 0.38, W * 0.45);
  glow.addColorStop(0, 'rgba(240,180,41,0.08)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';

  return canvas;
}

// ---------------------------------------------------------------------------
// Template A — With TV frame screenshot
// ---------------------------------------------------------------------------
async function renderTemplateA(rec, tvFramePath, W, H) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  drawBackground(ctx, W, H);
  drawCornerAccents(ctx, W, H);
  drawHeaderBar(ctx, W, rec);
  drawOutcomeBanner(ctx, W, rec);

  const hasBanner = rec.isClosed && (rec.exitReason === 'TARGET_HIT' || rec.exitReason === 'SL_HIT');
  const contentTopY = hasBanner ? 142 : 100;

  const isSquare = W === H; // 1080x1080

  if (isSquare) {
    // Left half: TV frame | Right half: price card
    const SPLIT = Math.floor(W * 0.52);
    const frameX = 30, frameY = contentTopY;
    const frameW = SPLIT - 50, frameH = H - contentTopY - 80;

    // TV frame with glow border
    try {
      const tvImg = await loadImage(tvFramePath);
      // Clip to rounded rect
      ctx.save();
      roundRect(ctx, frameX, frameY, frameW, frameH, 14);
      ctx.clip();
      ctx.drawImage(tvImg, frameX, frameY, frameW, frameH);
      ctx.restore();
      // Glow border
      ctx.shadowColor = COLORS.accentAlt;
      ctx.shadowBlur = 20;
      strokeRoundRect(ctx, frameX, frameY, frameW, frameH, 14, COLORS.accent, 2);
      ctx.shadowBlur = 0;
    } catch (e) {
      logger.warn('Could not load TV frame image, filling placeholder: ' + e.message);
      fillRoundRect(ctx, frameX, frameY, frameW, frameH, 14, 'rgba(255,255,255,0.04)');
      ctx.font = FONT.body(18);
      ctx.fillStyle = COLORS.dimWhite;
      ctx.textAlign = 'center';
      ctx.fillText('TV Frame', frameX + frameW / 2, frameY + frameH / 2);
    }

    // Right side
    const rightX = SPLIT + 10;
    const heroBottom = drawHeroSection(ctx, W, contentTopY + 4, rec);
    // Re-draw just the price card on right side
    drawPriceCard(ctx, W, heroBottom + 8, rec, rightX);

  } else {
    // Reel (1080x1920): TV frame in top third, price card below
    const frameH = Math.floor(H * 0.35);
    const frameX = 40, frameY = contentTopY;
    const frameW = W - 80;

    try {
      const tvImg = await loadImage(tvFramePath);
      ctx.save();
      roundRect(ctx, frameX, frameY, frameW, frameH, 14);
      ctx.clip();
      ctx.drawImage(tvImg, frameX, frameY, frameW, frameH);
      ctx.restore();
      ctx.shadowColor = COLORS.accentAlt;
      ctx.shadowBlur = 20;
      strokeRoundRect(ctx, frameX, frameY, frameW, frameH, 14, COLORS.accent, 2);
      ctx.shadowBlur = 0;
    } catch (e) {
      logger.warn('Could not load TV frame image: ' + e.message);
      fillRoundRect(ctx, frameX, frameY, frameW, frameH, 14, 'rgba(255,255,255,0.04)');
    }

    const heroBottom = drawHeroSection(ctx, W, frameY + frameH + 24, rec);
    drawPriceCard(ctx, W, heroBottom + 12, rec);
  }

  drawWatermark(ctx, W, H);
  return canvas;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate both Post (1080x1080) and Reel (1080x1920) images.
 *
 * @param {object}      rec           - recommendation object
 * @param {string|null} tvFramePath   - local path to TV frame image, or null
 * @param {string}      outputDir     - where to save PNGs
 * @returns {{ postPath: string, reelPath: string }}
 */
async function generateImages(rec, tvFramePath, outputDir) {
  const ts = Date.now();
  const slug = (rec.stock || 'trade').replace(/\s+/g, '_').toLowerCase();
  const postPath = path.join(outputDir, `${ts}_${slug}_post.png`);
  const reelPath = path.join(outputDir, `${ts}_${slug}_reel.png`);

  const useTemplate = tvFramePath ? 'A' : 'B';

  logger.info(`Generating images using Template ${useTemplate} for: ${rec.stock} ${rec.action}`);

  const renderPost = useTemplate === 'A'
    ? renderTemplateA(rec, tvFramePath, 1080, 1080)
    : renderTemplateB(rec, 1080, 1080);

  const renderReel = useTemplate === 'A'
    ? renderTemplateA(rec, tvFramePath, 1080, 1920)
    : renderTemplateB(rec, 1080, 1920);

  const [postCanvas, reelCanvas] = await Promise.all([renderPost, renderReel]);

  fs.writeFileSync(postPath, postCanvas.toBuffer('image/png'));
  fs.writeFileSync(reelPath, reelCanvas.toBuffer('image/png'));

  logger.info(`Images saved: post=${postPath}  reel=${reelPath}`);
  return { postPath, reelPath };
}

module.exports = { generateImages };
