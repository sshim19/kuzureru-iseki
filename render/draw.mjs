/** 背景・足場・人物・破片・予兆。state の読み取りのみ。Y は上向き。 */

import {
  VIEW_W,
  VIEW_H,
  PLAYER_W,
  PLAYER_H,
  LEDGE_H,
  MAX_SHARDS,
  PALETTE,
} from "../engine/constants.mjs";
import { hashSeed } from "../engine/rng.mjs";

const SHAKE_HZ = 18;
const SHAKE_WU = 2;
const STONE = PALETTE.stone;
const EDGE = PALETTE.edge;
const CREAM = PALETTE.cream;
const MOSS = PALETTE.moss;
const CLOTH = PALETTE.cloth;
const PIT = PALETTE.pit;

function u32(n) {
  return n >>> 0;
}

function mix(a, b) {
  let h = u32(a);
  h = Math.imul(h ^ u32(b), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return u32(h ^ (h >>> 16));
}

function rand01(h) {
  return u32(h) / 4294967296;
}

function seeded(seed) {
  return u32(typeof seed === "number" ? seed : hashSeed(seed ?? 0));
}

/**
 * キャンバスを CSS サイズ × DPR に合わせ、描画は CSS ピクセル座標で行う。
 * @returns {{ cssW: number, cssH: number, dpr: number }}
 */
export function syncCanvasSize(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const cssW = Math.max(1, canvas.clientWidth || VIEW_W);
  const cssH = Math.max(1, canvas.clientHeight || VIEW_H);
  const w = Math.round(cssW * dpr);
  const h = Math.round(cssH * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return { cssW, cssH, dpr };
}

/**
 * エンジンの可視範囲 VIEW_W × VIEW_H をキャンバスに contain 配置する。
 * cameraY は画面下端のワールド Y。可視は [cameraY, cameraY + VIEW_H)。
 */
export function makeView(cssW, cssH, state) {
  // 幅に合わせつつ、高さ方向は最低 VIEW_H を確保。縦長画面では見える高さを延ばし、
  // 下端の空洞余白を出さず、先の足場を多く見せる。
  const scale = Math.min(cssW / VIEW_W, cssH / VIEW_H);
  const drawW = VIEW_W * scale;
  const ox = (cssW - drawW) / 2;
  const oy = 0;
  let viewH = VIEW_H;
  let drawH = VIEW_H * scale;
  if (cssH > drawH + 0.5) {
    viewH = cssH / scale;
    drawH = cssH;
  }
  const cameraY = Number(state?.cameraY) || 0;
  const top = cameraY + viewH;
  const bottom = cameraY;
  return {
    scale,
    ox,
    oy,
    drawW,
    drawH,
    viewH,
    cssW,
    cssH,
    cameraY,
    top,
    bottom,
    sx(x) {
      return ox + x * scale;
    },
    sy(y) {
      return oy + (top - y) * scale;
    },
    px(wu) {
      return wu * scale;
    },
  };
}

function clipView(ctx, view) {
  ctx.beginPath();
  ctx.rect(view.ox, view.oy, view.drawW, view.drawH);
  ctx.clip();
}

function crumbleProgress(ledge, t) {
  if (ledge.landT == null) return 0;
  const dur = Number(ledge.crumbleIn) || 0;
  if (dur <= 0) return ledge.phase === "solid" ? 0 : 1;
  return Math.max(0, Math.min(1, (t - ledge.landT) / dur));
}

function drawBackground(ctx, view, state) {
  const seed = seeded(state?.seed);
  const s = view.scale;
  const bgBottom = view.cameraY * 0.3;

  ctx.fillStyle = "#9e8860";
  ctx.fillRect(view.ox, view.oy, view.drawW, view.drawH);

  const cellW = 40;
  const cellH = 28;
  const pad = 2;
  const col0 = 0;
  const col1 = Math.ceil(VIEW_W / cellW);
  const row0 = Math.floor(bgBottom / cellH) - 1;
  const row1 = Math.ceil((bgBottom + view.viewH) / cellH) + 1;

  for (let row = row0; row <= row1; row++) {
    for (let col = col0; col <= col1; col++) {
      const h = mix(mix(seed, row + 19), col + 41);
      const r = rand01(h);
      const wy = row * cellH;
      const wx = col * cellW + ((row & 1) === 0 ? 0 : cellW * 0.15);
      const sx = view.ox + wx * s;
      const sy = view.oy + (bgBottom + view.viewH - wy - cellH) * s;
      const pw = cellW * s;
      const ph = cellH * s;
      const color = STONE[h % STONE.length];
      const inset = (r > 0.72 ? 1.6 : 0.6) * s;
      ctx.fillStyle = color;
      ctx.fillRect(sx + pad * s, sy + pad * s, pw - pad * 2 * s, ph - pad * 2 * s);
      ctx.fillStyle = "rgba(255, 248, 230, 0.14)";
      ctx.fillRect(sx + pad * s, sy + pad * s, pw - pad * 2 * s, Math.max(1, 2 * s));
      ctx.fillStyle = "rgba(58, 39, 24, 0.22)";
      ctx.fillRect(
        sx + pad * s,
        sy + ph - pad * s - Math.max(1, 2.2 * s),
        pw - pad * 2 * s,
        Math.max(1, 2.2 * s),
      );
      if (r > 0.82) {
        ctx.fillStyle = MOSS[h % MOSS.length];
        ctx.globalAlpha = 0.55;
        ctx.fillRect(
          sx + inset + (r * 8) * s,
          sy + inset,
          Math.max(2, pw * 0.28),
          Math.max(2, ph * 0.35),
        );
        ctx.globalAlpha = 1;
      }
    }
  }

  // アーチ（シード由来、疎に）
  const archRow0 = Math.floor(bgBottom / 160) - 1;
  const archRow1 = Math.ceil((bgBottom + view.viewH) / 160) + 1;
  for (let ar = archRow0; ar <= archRow1; ar++) {
    const h = mix(seed, ar * 97 + 13);
    if (rand01(h) < 0.45) continue;
    const cx = 70 + (h % 3) * 110;
    const cy = ar * 160 + 40;
    const sx = view.ox + cx * s;
    const sy = view.oy + (bgBottom + view.viewH - cy) * s;
    const radX = 36 * s;
    const radY = 48 * s;
    ctx.fillStyle = PIT[0];
    ctx.beginPath();
    ctx.ellipse(sx, sy, radX, radY, 0, Math.PI, 0);
    ctx.rect(sx - radX, sy, radX * 2, 18 * s);
    ctx.fill();
    ctx.strokeStyle = EDGE[1];
    ctx.lineWidth = Math.max(1.5, 3 * s);
    ctx.beginPath();
    ctx.ellipse(sx, sy, radX, radY, 0, Math.PI, 0);
    ctx.stroke();
    ctx.strokeStyle = STONE[1];
    ctx.lineWidth = Math.max(1, 1.4 * s);
    ctx.beginPath();
    ctx.ellipse(sx, sy, radX - 3 * s, radY - 3 * s, 0, Math.PI, 0);
    ctx.stroke();
  }

  // 苔筋
  ctx.globalAlpha = 0.35;
  for (let i = 0; i < 7; i++) {
    const h = mix(seed, 200 + i);
    const x = (20 + rand01(h) * 320) * s + view.ox;
    const y0 = view.oy + (rand01(mix(h, 3)) * view.viewH) * s;
    ctx.strokeStyle = MOSS[i % 2];
    ctx.lineWidth = Math.max(1, (2 + (h % 3)) * s);
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.quadraticCurveTo(x + (8 - (h % 17)) * s, y0 + 40 * s, x + (4 - (h % 9)) * s, y0 + 90 * s);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawCracks(ctx, sx, sy, pw, ph, progress, idHash) {
  if (progress <= 0.08) return;
  const n = progress < 0.4 ? 1 : progress < 0.7 ? 2 : 3;
  ctx.save();
  ctx.beginPath();
  ctx.rect(sx, sy, pw, ph);
  ctx.clip();
  ctx.strokeStyle = progress > 0.7 ? PIT[0] : EDGE[2];
  ctx.lineWidth = Math.max(1, (0.8 + progress * 1.4) * (ph / LEDGE_H));
  ctx.lineCap = "round";
  for (let i = 0; i < n; i++) {
    const r = rand01(mix(idHash, 70 + i));
    const x0 = sx + pw * (0.15 + r * 0.7);
    ctx.beginPath();
    ctx.moveTo(x0, sy + ph * 0.08);
    ctx.lineTo(x0 + (r - 0.5) * pw * 0.2, sy + ph * (0.45 + progress * 0.2));
    ctx.lineTo(x0 + (0.4 - r) * pw * 0.15, sy + ph * 0.92);
    ctx.stroke();
  }
  ctx.restore();
}

function drawLedge(ctx, view, ledge, t, reducedMotion) {
  if (ledge.phase === "break") return;
  const w = ledge.w;
  const h = ledge.h || LEDGE_H;
  let x = ledge.x;
  const y = ledge.y;
  if (ledge.phase === "warn" && !reducedMotion) {
    x += Math.sin((t || 0) * Math.PI * 2 * SHAKE_HZ) * SHAKE_WU;
  }
  const sx = view.sx(x);
  const sy = view.sy(y);
  const pw = view.px(w);
  const ph = view.px(h);
  const r = Math.max(1, view.px(2));

  // 石板
  ctx.fillStyle = EDGE[1];
  ctx.beginPath();
  ctx.roundRect(sx, sy + 1, pw, ph, r);
  ctx.fill();
  const body = ctx.createLinearGradient(sx, sy, sx, sy + ph);
  body.addColorStop(0, STONE[1]);
  body.addColorStop(0.55, STONE[2]);
  body.addColorStop(1, STONE[3]);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.roundRect(sx, sy, pw, ph, r);
  ctx.fill();
  ctx.strokeStyle = EDGE[0];
  ctx.lineWidth = Math.max(1, view.px(0.9));
  ctx.stroke();

  // 上面の苔
  ctx.fillStyle = MOSS[0];
  ctx.fillRect(sx + view.px(3), sy, pw - view.px(6), Math.max(1, view.px(3.2)));
  ctx.fillStyle = MOSS[1];
  ctx.globalAlpha = 0.7;
  ctx.fillRect(sx + view.px(8), sy + view.px(1), pw * 0.22, Math.max(1, view.px(2.2)));
  ctx.globalAlpha = 1;

  const prog = crumbleProgress(ledge, t);
  if (ledge.landT != null) {
    drawCracks(ctx, sx, sy, pw, ph, ledge.phase === "warn" ? Math.max(prog, 0.72) : prog, mix(hashSeed(String(ledge.id)), 9));
  }
}

function drawShards(ctx, view, state, reducedMotion) {
  const list = state.shards || [];
  const n = Math.min(list.length, MAX_SHARDS);
  for (let i = 0; i < n; i++) {
    const sh = list[i];
    const life = sh.life ?? 0;
    if (life <= 0) continue;
    const alpha = Math.max(0, Math.min(1, life / 0.28));
    const s = view.scale;
    const cx = view.sx(sh.x);
    const cy = view.sy(sh.y);
    const hw = (sh.w ?? 7 + (i % 3) * 2) * s * 0.5;
    const hh = (sh.h ?? 6 + (i % 2) * 2) * s * 0.5;
    const rot = reducedMotion ? 0 : (sh.rot ?? (sh.vx || 0) * 0.04 + (1 - life) * 4 + i);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = STONE[2 + (i % 3) % STONE.length];
    ctx.beginPath();
    ctx.moveTo(-hw, -hh * 0.4);
    ctx.lineTo(hw * 0.8, -hh);
    ctx.lineTo(hw, hh * 0.6);
    ctx.lineTo(-hw * 0.7, hh);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = EDGE[2];
    ctx.lineWidth = Math.max(0.8, 0.8 * s);
    ctx.stroke();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawShadow(ctx, view, player) {
  const sx = view.sx(player.x);
  const sy = view.sy(player.y);
  const rx = view.px(PLAYER_W * 0.55);
  const ry = view.px(4);
  ctx.save();
  ctx.fillStyle = "rgba(22, 16, 11, 0.35)";
  ctx.beginPath();
  ctx.ellipse(sx, sy + view.px(1.2), rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function poseOf(player) {
  const p = player.pose;
  if (p === "jump" || p === "fall" || p === "stand") return p;
  if (player.grounded) return "stand";
  return player.vy > 0 ? "jump" : "fall";
}

/** 足元原点、+Y 上、+X 向き前。単位は wu。 */
function tracePlayer(ctx, pose) {
  const w = PLAYER_W;
  const h = PLAYER_H;

  if (pose === "jump") {
    // 脚を後ろへ、腕を上げる
    ctx.fillStyle = EDGE[3];
    ctx.fillRect(-4.2, 1, 3.2, 8);
    ctx.fillRect(0.6, 2, 3.2, 7);
  } else if (pose === "fall") {
    ctx.fillStyle = EDGE[3];
    ctx.fillRect(-5.2, 0, 3.4, 10);
    ctx.fillRect(1.2, 1, 3.4, 9);
  } else {
    ctx.fillStyle = EDGE[3];
    ctx.fillRect(-4.4, 0, 3.4, 11);
    ctx.fillRect(0.8, 0, 3.4, 11);
  }

  // 衣
  ctx.fillStyle = CREAM[0];
  ctx.beginPath();
  if (pose === "jump") {
    ctx.moveTo(-8, 10);
    ctx.lineTo(8, 11);
    ctx.lineTo(6.5, 22);
    ctx.lineTo(-7, 21.5);
  } else if (pose === "fall") {
    ctx.moveTo(-9, 11);
    ctx.lineTo(9, 11);
    ctx.lineTo(7, 22);
    ctx.lineTo(-8, 22);
  } else {
    ctx.moveTo(-7.5, 10);
    ctx.lineTo(7.5, 10);
    ctx.lineTo(7, 22);
    ctx.lineTo(-7.5, 22);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = EDGE[2];
  ctx.lineWidth = 0.7;
  ctx.stroke();

  // 帯
  ctx.fillStyle = CLOTH[0];
  ctx.fillRect(-7.2, 14.2, 14.4, 3.2);
  ctx.fillStyle = CLOTH[1];
  ctx.fillRect(-7.2, 16.4, 14.4, 1.1);

  // 腕
  ctx.strokeStyle = CREAM[0];
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  if (pose === "jump") {
    ctx.moveTo(5, 18);
    ctx.quadraticCurveTo(10, 20, 11, 26);
    ctx.moveTo(-5, 18);
    ctx.quadraticCurveTo(-9, 16, -8, 24);
  } else if (pose === "fall") {
    ctx.moveTo(6, 18);
    ctx.lineTo(12, 16);
    ctx.moveTo(-6, 18);
    ctx.lineTo(-12, 17);
  } else {
    ctx.moveTo(6, 18);
    ctx.quadraticCurveTo(8, 14, 7.5, 9);
    ctx.moveTo(-5.5, 18);
    ctx.quadraticCurveTo(-7, 14, -6.5, 9);
  }
  ctx.stroke();

  // 頭と髪
  const hy = pose === "jump" ? 24.5 : 24;
  ctx.fillStyle = "#e8d0b0";
  ctx.beginPath();
  ctx.arc(0.6, hy, 5.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PIT[0];
  ctx.beginPath();
  ctx.ellipse(0.2, hy + 1.2, 5.3, 5.6, 0, Math.PI * 1.05, Math.PI * 1.95, true);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0.2, hy + 2.6, 5.1, 4.2, 0, Math.PI, 0);
  ctx.fill();

  void w;
  void h;
}

function drawPlayer(ctx, view, player) {
  const pose = poseOf(player);
  const facing = player.facing < 0 ? -1 : 1;
  const s = view.scale;
  ctx.save();
  ctx.translate(view.sx(player.x), view.sy(player.y));
  ctx.scale(facing * s, -s);
  tracePlayer(ctx, pose);
  ctx.restore();
}

function drawVignette(ctx, view) {
  const { ox, oy, drawW, drawH } = view;
  const edge = Math.max(24, drawW * 0.12);
  let g = ctx.createLinearGradient(ox, oy, ox + edge, oy);
  g.addColorStop(0, "rgba(36, 24, 15, 0.42)");
  g.addColorStop(1, "rgba(36, 24, 15, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(ox, oy, edge, drawH);

  g = ctx.createLinearGradient(ox + drawW, oy, ox + drawW - edge, oy);
  g.addColorStop(0, "rgba(36, 24, 15, 0.42)");
  g.addColorStop(1, "rgba(36, 24, 15, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(ox + drawW - edge, oy, edge, drawH);

  const top = Math.max(20, drawH * 0.1);
  g = ctx.createLinearGradient(ox, oy, ox, oy + top);
  g.addColorStop(0, "rgba(36, 24, 15, 0.28)");
  g.addColorStop(1, "rgba(36, 24, 15, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(ox, oy, drawW, top);

  const bot = Math.max(28, drawH * 0.16);
  g = ctx.createLinearGradient(ox, oy + drawH, ox, oy + drawH - bot);
  g.addColorStop(0, "rgba(22, 16, 11, 0.5)");
  g.addColorStop(1, "rgba(22, 16, 11, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(ox, oy + drawH - bot, drawW, bot);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} state
 * @param {{ reducedMotion?: boolean }} [opts]
 */
export function drawScene(ctx, state, opts = {}) {
  const canvas = ctx.canvas;
  const { cssW, cssH, dpr } = syncCanvasSize(canvas);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  ctx.fillStyle = PIT[0];
  ctx.fillRect(0, 0, cssW, cssH);

  if (!state) return;

  const view = makeView(cssW, cssH, state);
  const reducedMotion = !!opts.reducedMotion;
  const t = Number(state.t) || 0;

  ctx.save();
  clipView(ctx, view);
  drawBackground(ctx, view, state);

  const margin = 20;
  const ledges = state.ledges || [];
  for (const ledge of ledges) {
    const h = ledge.h || LEDGE_H;
    if (ledge.y + 4 < view.bottom - margin) continue;
    if (ledge.y - h > view.top + margin) continue;
    drawLedge(ctx, view, ledge, t, reducedMotion);
  }

  drawShards(ctx, view, state, reducedMotion);

  if (state.player) {
    const p = state.player;
    if (p.y + PLAYER_H >= view.bottom - 40 && p.y <= view.top + 40) {
      drawShadow(ctx, view, p);
      drawPlayer(ctx, view, p);
    }
  }

  drawVignette(ctx, view);
  ctx.restore();
}
