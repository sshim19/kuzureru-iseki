/**
 * 入力、rAF ループ、画面遷移の配線。
 *
 * エンジンインタフェース（engine/*）:
 *   createInitialState({ seed, dateJst, bestM, todayBestM })
 *   tick(state, input, dt) → 新しい state（非破壊）。dt は秒。内部で 1/60 固定＋最大 50ms。
 *   generateLedges は tick 内で呼ばれるため、プレイ中にこちらでは呼ばない。
 *   cameraY は画面下端のワールド Y。可視 [cameraY, cameraY+VIEW_H)。Y は上向き。
 *   player.x は中心、player.y は足元。facing は -1|1、pose は 'stand'|'jump'|'fall'。
 *   ledge.x は左端、ledge.y は上面。
 */
import { tick, createInitialState } from "./engine/sim.mjs";
import { MAX_DT } from "./engine/constants.mjs";
import { drawScene } from "./render/draw.mjs";
import { bindScreens } from "./render/screens.mjs";
import {
  getJstDate,
  seedString,
  loadBests,
  saveBests,
  shareText,
  copyText,
} from "./render/share.mjs";

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
let pendingJump = null;
let activePointer = null;
let lastTs = 0;
let lastShare = shareText({ dateLabel, heightM: 0 });

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
  pendingJump = null;
  activePointer = null;
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
  const jumpLeft = pendingJump === "left";
  const jumpRight = pendingJump === "right";
  pendingJump = null;
  return { jumpLeft, jumpRight };
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
    }
  } else {
    pendingJump = null;
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

screens.el.btnCopy?.addEventListener("click", async () => {
  const ok = await copyText(lastShare);
  screens.setCopyStatus(ok);
});

function pointerOnCanvas(e) {
  if (state.status !== "playing") return;
  if (e.isPrimary === false) return;
  if (activePointer != null && e.pointerId !== activePointer) return;
  if (e.type === "pointerdown") {
    if (activePointer != null) return;
    activePointer = e.pointerId;
    const rect = canvas.getBoundingClientRect();
    const mid = rect.left + rect.width / 2;
    pendingJump = e.clientX < mid ? "left" : "right";
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }
  if (e.cancelable) e.preventDefault();
}

function clearPointer(e) {
  if (e.pointerId === activePointer) activePointer = null;
}

canvas.addEventListener("pointerdown", pointerOnCanvas);
canvas.addEventListener("pointermove", (e) => {
  if (state.status === "playing" && e.cancelable) e.preventDefault();
});
canvas.addEventListener("pointerup", clearPointer);
canvas.addEventListener("pointercancel", clearPointer);
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

window.addEventListener(
  "keydown",
  (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      if (e.repeat) return;
      if (state.status !== "playing") return;
      pendingJump = e.key === "ArrowLeft" ? "left" : "right";
    }
  },
  { passive: false },
);

window.addEventListener(
  "touchmove",
  (e) => {
    if (state.status === "playing" && e.cancelable) e.preventDefault();
  },
  { passive: false },
);

screens.showTitle({ dateLabel, bestM: stored.bestM });
screens.updateHud({ heightM: 0, bestM: stored.bestM });
paint();
requestAnimationFrame(frame);
