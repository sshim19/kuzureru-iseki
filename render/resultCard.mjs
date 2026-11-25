/** 終了画面向けの正方形結果カード（遺跡テーマ）。 */

import { PALETTE } from "../engine/constants.mjs";
import { GAME_TITLE } from "./share.mjs";

export const RESULT_CARD_SIZE = 1080;

/**
 * @param {HTMLCanvasElement | OffscreenCanvas} canvas
 * @param {{ dateLabel: string, heightM: number, url?: string }} rec
 */
export function drawResultCard(canvas, { dateLabel, heightM, url = "" }) {
  const size = RESULT_CARD_SIZE;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context");

  const h = Math.max(0, Math.floor(Number(heightM) || 0));
  const pit = ctx.createRadialGradient(540, 460, 40, 540, 560, 760);
  pit.addColorStop(0, "#3a2718");
  pit.addColorStop(0.45, PALETTE.pit[0]);
  pit.addColorStop(1, PALETTE.pit[1]);
  ctx.fillStyle = pit;
  ctx.fillRect(0, 0, size, size);

  const brickW = 96;
  const brickH = 44;
  for (let row = 0; row < 26; row++) {
    const ox = (row % 2) * (brickW / 2);
    for (let col = -1; col < 13; col++) {
      const x = col * brickW + ox;
      const y = row * brickH;
      ctx.fillStyle = row % 4 === 1 ? "rgba(26, 18, 11, 0.55)" : "rgba(20, 14, 8, 0.4)";
      ctx.fillRect(x + 1, y + 1, brickW - 3, brickH - 3);
      ctx.strokeStyle = "rgba(90, 60, 30, 0.28)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 1.5, y + 1.5, brickW - 4, brickH - 4);
    }
  }

  const ledges = [
    { x: 80, y: 160, w: 240 },
    { x: 760, y: 230, w: 200 },
    { x: 40, y: 860, w: 280 },
    { x: 720, y: 900, w: 300 },
    { x: 430, y: 120, w: 180 },
  ];
  for (const L of ledges) {
    ctx.fillStyle = PALETTE.stone[2];
    roundRect(ctx, L.x, L.y, L.w, 26, 4);
    ctx.fill();
    ctx.fillStyle = PALETTE.edge[0];
    ctx.fillRect(L.x + 4, L.y + 20, L.w - 8, 12);
    ctx.fillStyle = PALETTE.cream[0];
    ctx.globalAlpha = 0.35;
    ctx.fillRect(L.x + 8, L.y + 3, L.w - 16, 6);
    ctx.globalAlpha = 1;
  }

  // small explorer on the lower-left ledge
  ctx.fillStyle = PALETTE.cloth[0];
  ctx.beginPath();
  ctx.arc(170, 832, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.ink;
  ctx.fillRect(160, 844, 20, 16);

  const px = 90;
  const py = 250;
  const pw = 900;
  const ph = 580;
  ctx.fillStyle = "rgba(22, 16, 11, 0.45)";
  roundRect(ctx, px + 10, py + 14, pw, ph, 18);
  ctx.fill();
  ctx.fillStyle = PALETTE.cream[0];
  roundRect(ctx, px, py, pw, ph, 18);
  ctx.fill();
  ctx.strokeStyle = PALETTE.edge[2];
  ctx.lineWidth = 6;
  roundRect(ctx, px + 10, py + 10, pw - 20, ph - 20, 12);
  ctx.stroke();
  ctx.strokeStyle = PALETTE.stone[3];
  ctx.lineWidth = 2;
  roundRect(ctx, px + 22, py + 22, pw - 44, ph - 44, 8);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = PALETTE.ink;
  ctx.font = '700 54px "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif';
  ctx.fillText(GAME_TITLE, size / 2, py + 90);

  ctx.font = '500 36px "Hiragino Sans", "Noto Sans JP", sans-serif';
  ctx.fillStyle = PALETTE.edge[2];
  ctx.fillText(String(dateLabel || ""), size / 2, py + 160);

  ctx.font = '800 200px "Hiragino Sans", "Noto Sans JP", sans-serif';
  ctx.fillStyle = PALETTE.ink;
  ctx.fillText(`${h}m`, size / 2, py + 310);

  ctx.font = '600 32px "Hiragino Sans", "Noto Sans JP", sans-serif';
  ctx.fillStyle = PALETTE.edge[1];
  ctx.fillText("まで登りました", size / 2, py + 430);

  if (url) {
    ctx.font = '400 26px "Hiragino Sans", "Noto Sans JP", sans-serif';
    ctx.fillStyle = PALETTE.edge[0];
    const shown = String(url).replace(/^https?:\/\//, "");
    ctx.fillText(shown, size / 2, py + 510);
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {number} r
 */
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function cardCanvas() {
  if (typeof document !== "undefined" && document.createElement) {
    return document.createElement("canvas");
  }
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(RESULT_CARD_SIZE, RESULT_CARD_SIZE);
  }
  throw new Error("canvas unavailable");
}

/**
 * @param {{ dateLabel: string, heightM: number, url?: string }} rec
 * @returns {Promise<Blob>}
 */
export function resultCardBlob(rec) {
  const canvas = cardCanvas();
  drawResultCard(canvas, rec);
  if (typeof canvas.toBlob === "function") {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("card blob"))), "image/png");
    });
  }
  if (typeof canvas.convertToBlob === "function") {
    return canvas.convertToBlob({ type: "image/png" });
  }
  throw new Error("card blob");
}

/**
 * @param {{ dateLabel: string, heightM: number, url?: string }} rec
 * @returns {Promise<File>}
 */
export async function resultCardFile(rec) {
  const blob = await resultCardBlob(rec);
  const h = Math.max(0, Math.floor(Number(rec.heightM) || 0));
  return new File([blob], `kuzureru-iseki-${h}m.png`, { type: "image/png" });
}

/** @param {Blob} blob @param {string} filename */
export function downloadBlob(blob, filename) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 2500);
}
