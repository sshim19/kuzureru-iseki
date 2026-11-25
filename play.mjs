/**
 * 入力、rAF ループ、画面遷移の配線。
 *
 * エンジンインタフェース（engine/*）:
 *   createInitialState({ seed, dateJst, bestM, todayBestM })
 *   tick(state, input, dt) → 新しい state（非破壊）。dt は秒。内部で 1/60 固定＋最大 50ms。
 *   generateLedges は tick 内で呼ばれるため、プレイ中にこちらでは呼ばない。
 *   cameraY は画面下端のワールド Y。可視 [cameraY, cameraY+VIEW_H)。Y は上向き。
 *   player.x は中心、player.y は足元。facing は -1|1、pose は 'stand'|'crouch'|'jump'|'fall'。
 *   input は { holdLeft, holdRight }（押しっぱなしでため、離すと跳ぶ）。
 *   ledge.x は左端、ledge.y は上面。
 */
import { tick, createInitialState } from "./engine/sim.mjs";
import { MAX_DT, BUFFER_TIME } from "./engine/constants.mjs";
import { chargePower } from "./engine/physics.mjs";
import { drawScene } from "./render/draw.mjs";
import { bindScreens } from "./render/screens.mjs";
import {
  getJstDate,
  seedString,
  loadBests,
  saveBests,
  shareText,
  sharePageUrl,
  shareCopyText,
  tweetShareUrl,
  lineShareUrl,
  canUseNativeShare,
  canShareFiles,
  isShareAbort,
  copyText,
  GAME_TITLE,
} from "./render/share.mjs";
import { resultCardFile, downloadBlob } from "./render/resultCard.mjs";

const screens = bindScreens(document);
const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d", { alpha: false });

const motionQuery =
  typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };

function reducedMotion() {
  return !!motionQuery.matches;
}

const { dateJst, dateLabel } = getJstDate();
const seed = seedString(dateJst);

let stored = loadBests(dateJst);
let state = titleStateFrom(stored);
let ended = false;
let holdLeft = false;
let holdRight = false;
let activePointer = null;
let lastTs = 0;
let lastShare = shareText({ dateLabel, heightM: 0 });

const STORAGE_MODE = "kuzureru-iseki:controlMode";
/** Horizontal CSS px: below this, release cancels (no jump). */
const SWIPE_CANCEL_PX = 12;
/** Horizontal CSS px that maps to minimum power (CHARGE_MIN). */
const SWIPE_MIN_PX = 20;
/** Cap for the distance that maps to full power. */
const SWIPE_MAX_CAP_PX = 180;
/** Also cap full-power distance at this fraction of the screen width. */
const SWIPE_MAX_FRAC = 0.4;

let controlMode = loadControlMode();
/** @type {null | { id: number, x0: number, y0: number, x: number, y: number, dir: -1 | 0 | 1 }} */
let swipe = null;

function loadControlMode() {
  try {
    return globalThis.localStorage?.getItem(STORAGE_MODE) === "swipe" ? "swipe" : "hold";
  } catch {
    return "hold";
  }
}

function saveControlMode(mode) {
  controlMode = mode === "swipe" ? "swipe" : "hold";
  try {
    globalThis.localStorage?.setItem(STORAGE_MODE, controlMode);
  } catch {
    /* ignore quota / private mode */
  }
  screens.applyControlMode(controlMode);
}

function swipeMaxPx() {
  const w = Number(window.visualViewport?.width || window.innerWidth || 390);
  return Math.max(SWIPE_MIN_PX + 1, Math.min(SWIPE_MAX_CAP_PX, SWIPE_MAX_FRAC * w));
}

/** Swipe distance in CSS px → raw charge 0–1 (engine maps that to power 0.45–1). */
function swipeChargeFromDx(dx) {
  const dist = Math.abs(dx);
  const span = swipeMaxPx() - SWIPE_MIN_PX;
  if (span <= 0) return dist >= SWIPE_MIN_PX ? 1 : 0;
  return Math.max(0, Math.min(1, (dist - SWIPE_MIN_PX) / span));
}

function applySwipePreview() {
  if (controlMode !== "swipe" || !swipe || state.status !== "playing") return;
  const dx = swipe.x - swipe.x0;
  if (dx > 0) swipe.dir = 1;
  else if (dx < 0) swipe.dir = -1;
  if (!swipe.dir) return;
  const p = state.player;
  p.facing = swipe.dir;
  // Do not set charging: the engine treats charging→no-hold as a jump release.
  // charge>0 is enough for the existing gauge; 0 maps to min power, so use a
  // tiny epsilon until the swipe reaches SWIPE_MIN_PX.
  p.charge = Math.max(swipeChargeFromDx(dx), 1e-4);
  if (p.grounded) p.pose = "crouch";
}

function commitSwipeJump() {
  if (!swipe) return;
  const dx = swipe.x - swipe.x0;
  const dist = Math.abs(dx);
  const dir = swipe.dir || (dx > 0 ? 1 : dx < 0 ? -1 : 0);
  swipe = null;
  if (state.status !== "playing" || !dir || dist < SWIPE_CANCEL_PX) return;
  const raw = swipeChargeFromDx(dx);
  const p = state.player;
  p.charge = raw;
  p.pendingPower = chargePower(raw);
  p.buffer = BUFFER_TIME;
  p.facing = dir;
  p.charging = 0;
}

function titleStateFrom(bests) {
  const playing = createInitialState({
    seed,
    dateJst,
    bestM: bests.bestM ?? 0,
    todayBestM: bests.todayBestM ?? 0,
  });
  return { ...playing, status: "title" };
}

function freshRun() {
  stored = loadBests(dateJst);
  ended = false;
  holdLeft = false;
  holdRight = false;
  activePointer = null;
  swipe = null;
  return createInitialState({
    seed,
    dateJst,
    bestM: stored.bestM ?? 0,
    todayBestM: stored.todayBestM ?? 0,
  });
}

function finishRun(next) {
  if (ended) {
    state = next;
    return;
  }
  ended = true;
  clearHolds();
  state = next.status === "over" ? next : { ...next, status: "over" };
  const saved = saveBests({ dateJst, heightM: state.heightM });
  stored = { bestM: saved.bestM, todayBestM: saved.todayBestM };
  lastShare = shareText({ dateLabel, heightM: state.heightM });
  screens.showOver({
    heightM: state.heightM,
    todayBestM: saved.todayBestM,
    bestM: saved.bestM,
    isNewBest: saved.isNewBest,
    isNewTodayBest: saved.isNewTodayBest,
  });
}

function takeInput() {
  return { holdLeft, holdRight };
}

function clearHolds() {
  holdLeft = false;
  holdRight = false;
  activePointer = null;
  swipe = null;
}

function paint() {
  drawScene(ctx, state, { reducedMotion: reducedMotion() });
  if (state.status === "playing") {
    screens.updateHud({ heightM: state.heightM, bestM: state.bestM || stored.bestM });
    screens.setHintsVisible(state.hintJumpsLeft);
  }
}

function frame(ts) {
  if (!lastTs) lastTs = ts;
  const dt = Math.min(Math.max((ts - lastTs) / 1000, 0), MAX_DT);
  lastTs = ts;

  if (state.status === "playing") {
    const input = takeInput();
    const next = tick(state, input, dt);
    if (next.status === "over") {
      finishRun(next);
    } else {
      state = next;
      applySwipePreview();
    }
  } else {
    clearHolds();
  }

  paint();
  requestAnimationFrame(frame);
}

function startPlay() {
  state = freshRun();
  screens.showPlay();
  screens.updateHud({ heightM: 0, bestM: stored.bestM });
  screens.setHintsVisible(state.hintJumpsLeft);
  paint();
}

screens.el.btnStart?.addEventListener("click", () => {
  startPlay();
});

screens.el.btnRetry?.addEventListener("click", () => {
  startPlay();
});

screens.el.btnQuit?.addEventListener("click", () => {
  if (state.status !== "playing") return;
  finishRun({ ...state, status: "over" });
  paint();
});

function currentShare() {
  return {
    text: lastShare,
    url: sharePageUrl(),
    title: GAME_TITLE,
    dateLabel,
    heightM: state.heightM,
  };
}

function guardClick(fn) {
  return (e) => {
    e.preventDefault();
    e.stopPropagation();
    fn(e);
  };
}

function openShareTab(href) {
  if (!href) return;
  window.open(href, "_blank", "noopener,noreferrer");
}

async function makeCardFile() {
  const rec = currentShare();
  return resultCardFile({ dateLabel: rec.dateLabel, heightM: rec.heightM, url: rec.url });
}

async function shareResult() {
  const rec = currentShare();
  screens.setShareStatus(null);
  let file = null;
  try {
    file = await makeCardFile();
  } catch {
    /* 文章だけの共有へ */
  }
  if (canUseNativeShare()) {
    if (file && canShareFiles([file])) {
      try {
        const payload = { title: rec.title, text: rec.text, files: [file] };
        if (rec.url) payload.url = rec.url;
        await navigator.share(payload);
        return;
      } catch (err) {
        if (isShareAbort(err)) return;
      }
    }
    try {
      const payload = { title: rec.title, text: rec.text };
      if (rec.url) payload.url = rec.url;
      await navigator.share(payload);
      return;
    } catch (err) {
      if (isShareAbort(err)) return;
    }
  }
  const ok = await copyText(shareCopyText(rec));
  screens.setCopyStatus(ok);
}

async function shareToInstagram() {
  screens.setShareStatus(null);
  let file = null;
  try {
    file = await makeCardFile();
  } catch {
    screens.setShareStatus("画像を保存できませんでした");
    return;
  }
  if (canShareFiles([file])) {
    try {
      const rec = currentShare();
      const payload = { title: rec.title, text: rec.text, files: [file] };
      if (rec.url) payload.url = rec.url;
      await navigator.share(payload);
      return;
    } catch (err) {
      if (isShareAbort(err)) return;
    }
  }
  try {
    downloadBlob(file, file.name);
    screens.setShareStatus("画像を保存しました。インスタで投稿してください");
  } catch {
    screens.setShareStatus("画像を保存できませんでした");
  }
}

screens.el.btnShare?.addEventListener(
  "click",
  guardClick(() => {
    void shareResult();
  }),
);

screens.el.btnCopy?.addEventListener(
  "click",
  guardClick(async () => {
    const ok = await copyText(shareCopyText(currentShare()));
    screens.setCopyStatus(ok);
  }),
);

screens.el.btnShareX?.addEventListener(
  "click",
  guardClick(() => {
    openShareTab(tweetShareUrl(currentShare()));
  }),
);

screens.el.btnShareLine?.addEventListener(
  "click",
  guardClick(() => {
    openShareTab(lineShareUrl(currentShare()));
  }),
);

screens.el.btnShareIg?.addEventListener(
  "click",
  guardClick(() => {
    void shareToInstagram();
  }),
);

screens.applyShareAvailability(canUseNativeShare());

function pointerDown(e) {
  if (state.status !== "playing") return;
  if (e.isPrimary === false) return;
  if (activePointer != null) return;
  activePointer = e.pointerId;
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    /* ignore */
  }
  if (controlMode === "swipe") {
    swipe = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, dir: 0 };
  } else {
    const rect = canvas.getBoundingClientRect();
    const mid = rect.left + rect.width / 2;
    holdLeft = e.clientX < mid;
    holdRight = !holdLeft;
  }
  if (e.cancelable) e.preventDefault();
}

function pointerMove(e) {
  if (state.status !== "playing") return;
  if (e.cancelable) e.preventDefault();
  if (controlMode !== "swipe" || !swipe || e.pointerId !== swipe.id) return;
  swipe.x = e.clientX;
  swipe.y = e.clientY;
  const dx = swipe.x - swipe.x0;
  if (dx > 0) swipe.dir = 1;
  else if (dx < 0) swipe.dir = -1;
}

function pointerUp(e) {
  if (e.pointerId !== activePointer) return;
  if (controlMode === "swipe" && swipe && e.pointerId === swipe.id) {
    // Prefer last move; some pointerup/cancel events have unusable coordinates.
    if (
      e.type !== "pointercancel" &&
      Number.isFinite(e.clientX) &&
      Number.isFinite(e.clientY) &&
      Math.abs(e.clientX - swipe.x) < 240 &&
      Math.abs(e.clientY - swipe.y) < 240
    ) {
      swipe.x = e.clientX;
      swipe.y = e.clientY;
    }
    commitSwipeJump();
  }
  activePointer = null;
  holdLeft = false;
  holdRight = false;
}

canvas.addEventListener("pointerdown", pointerDown, { passive: false });
canvas.addEventListener("pointermove", pointerMove, { passive: false });
canvas.addEventListener("pointerup", pointerUp, { passive: false });
canvas.addEventListener("pointercancel", pointerUp, { passive: false });
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

window.addEventListener(
  "keydown",
  (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      if (e.repeat) return;
      if (state.status !== "playing") return;
      swipe = null;
      if (e.key === "ArrowLeft") holdLeft = true;
      if (e.key === "ArrowRight") holdRight = true;
    }
  },
  { passive: false },
);

window.addEventListener("keyup", (e) => {
  if (e.key === "ArrowLeft") holdLeft = false;
  if (e.key === "ArrowRight") holdRight = false;
});

window.addEventListener(
  "touchmove",
  (e) => {
    if (state.status === "playing" && e.cancelable) e.preventDefault();
  },
  { passive: false },
);

screens.onControlModeChange(saveControlMode);
screens.applyControlMode(controlMode);
screens.showTitle({ dateLabel, bestM: stored.bestM });
screens.updateHud({ heightM: 0, bestM: stored.bestM });
paint();
requestAnimationFrame(frame);
