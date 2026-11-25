/** generateLedges(seed, yFrom, yTo) → ledges[] (idempotent). */

import {
  VIEW_W,
  LEDGE_H,
  LEDGE_W_MIN,
  LEDGE_W_MAX,
  FIRST_ROWS,
  FIRST_CRUMBLE,
  START_CRUMBLE,
  START_FLOOR_X,
  START_FLOOR_W,
  CHARGE_MIN,
  TUTORIAL_WINDOW_MIN,
  TUTORIAL_WINDOW_MAX,
  bandAtY,
} from "./constants.mjs";
import { createRng, randRange } from "./rng.mjs";
import { canReachAtPower, jumpVelocity, measureLandingWindow } from "./physics.mjs";
import { GRAVITY, LAND_FOOT_W, LAND_SLOP_Y } from "./constants.mjs";

const EDGE = 10;

function startFloor() {
  return {
    id: "start",
    x: START_FLOOR_X,
    y: 0,
    w: START_FLOOR_W,
    h: LEDGE_H,
    landT: null,
    crumbleIn: START_CRUMBLE,
    phase: "solid",
  };
}

function makeLedge(id, x, y, w, crumbleIn) {
  return {
    id,
    x,
    y,
    w,
    h: LEDGE_H,
    landT: null,
    crumbleIn,
    phase: "solid",
  };
}

function windowRange(tutorial, band) {
  if (tutorial) return { min: TUTORIAL_WINDOW_MIN, max: TUTORIAL_WINDOW_MAX };
  return { min: band.windowMin, max: band.windowMax };
}

function minPowerForGap(dy) {
  const need = Math.sqrt(2 * GRAVITY * Math.max(0, dy + LAND_SLOP_Y));
  const p = (need - jumpVelocity(0).vy) / (jumpVelocity(1).vy - jumpVelocity(0).vy || 1);
  return Math.max(CHARGE_MIN, Math.min(1, p));
}

function clampLedgeX(x, w) {
  const minX = EDGE;
  const maxX = VIEW_W - EDGE - w;
  if (maxX < minX) return (VIEW_W - w) / 2;
  return Math.max(minX, Math.min(maxX, x));
}

/**
 * Place one ledge so that, from `src` in `dir`, the landing power window
 * sits inside the band's target width and is away from 0.45 and 1.
 */
function placeFromSource(id, y, crumbleIn, src, dir, rng, tutorial, band) {
  const { min: winMin, max: winMax } = windowRange(tutorial, band);
  const dy = y - src.y;
  const heightFloor = minPowerForGap(dy);
  const tries = 6;
  for (let attempt = 0; attempt < tries; attempt++) {
    const targetW = randRange(rng, winMin, winMax);
    const half = targetW / 2;
    const midLo = Math.max(heightFloor + half + 0.02, CHARGE_MIN + half + 0.05);
    const midHi = 1 - half - 0.05;
    if (midLo > midHi) continue;
    const midPower = randRange(rng, midLo, midHi);
    const atMid = canReachAtPower(src.x, src.y, dir, { x: -20, y, w: VIEW_W + 40, h: LEDGE_H, phase: "solid" }, midPower);
    // use a dummy full-width slab just to get landing x at this height
    if (!atMid.ok || atMid.x == null) continue;
    if (atMid.x < 40 || atMid.x > VIEW_W - 40) continue;

    const atLo = canReachAtPower(src.x, src.y, dir, { x: -20, y, w: VIEW_W + 40, h: LEDGE_H, phase: "solid" }, midPower - half);
    const atHi = canReachAtPower(src.x, src.y, dir, { x: -20, y, w: VIEW_W + 40, h: LEDGE_H, phase: "solid" }, midPower + half);
    if (!atLo.ok || !atHi.ok) continue;
    const span = Math.abs(atHi.x - atLo.x);
    let w = Math.max(LEDGE_W_MIN, Math.min(LEDGE_W_MAX, span - LAND_FOOT_W));
    let x = clampLedgeX(atMid.x - w / 2, w);
    let ledge = makeLedge(id, x, y, w, crumbleIn);
    let win = measureLandingWindow(src.x, src.y, dir, ledge);
    for (let adj = 0; adj < 6 && win.ok; adj++) {
      const tooNarrow = win.width < winMin - 1e-6;
      const tooWide = win.width > winMax + 1e-6;
      const touchesMin = win.lo <= CHARGE_MIN + 0.025;
      const touchesMax = win.hi >= 1 - 0.025;
      if (!tooNarrow && !tooWide && !touchesMin && !touchesMax) break;
      if (tooNarrow || touchesMin || touchesMax) w = Math.min(LEDGE_W_MAX, w + 2);
      if (tooWide) w = Math.max(LEDGE_W_MIN, w - 2);
      const cx = win.x != null ? win.x : atMid.x;
      x = clampLedgeX(cx - w / 2, w);
      ledge = makeLedge(id, x, y, w, crumbleIn);
      win = measureLandingWindow(src.x, src.y, dir, ledge);
    }
    if (!win.ok) continue;
    if (win.width < winMin - 0.015 || win.width > winMax + 0.015) continue;
    if (win.lo <= CHARGE_MIN + 0.02 || win.hi >= 1 - 0.02) continue;
    return { ledge, takeoffX: win.x ?? atMid.x, dir, win };
  }
  // Last try: mid power 0.7, accept any window in the global 0.10–0.18 band.
  const midPower = Math.max(minPowerForGap(dy) + 0.08, 0.7);
  if (midPower < 0.95) {
    const slab = { x: -20, y, w: VIEW_W + 40, h: LEDGE_H, phase: "solid" };
    const atMid = canReachAtPower(src.x, src.y, dir, slab, midPower);
    if (atMid.ok) {
      const targetW = (winMin + winMax) / 2;
      const loP = Math.max(CHARGE_MIN + 0.04, midPower - targetW / 2);
      const hiP = Math.min(1 - 0.04, midPower + targetW / 2);
      const atLo = canReachAtPower(src.x, src.y, dir, slab, loP);
      const atHi = canReachAtPower(src.x, src.y, dir, slab, hiP);
      if (atLo.ok && atHi.ok) {
        const span = Math.abs(atHi.x - atLo.x);
        let w = Math.max(LEDGE_W_MIN, Math.min(LEDGE_W_MAX, span - LAND_FOOT_W));
        let x = clampLedgeX(atMid.x - w / 2, w);
        let ledge = makeLedge(id, x, y, w, crumbleIn);
        let win = measureLandingWindow(src.x, src.y, dir, ledge);
        for (let adj = 0; adj < 8 && win.ok; adj++) {
          if (win.width >= 0.10 && win.width <= 0.18 && win.lo > CHARGE_MIN + 0.02 && win.hi < 0.98) break;
          if (win.width < 0.10) w = Math.min(LEDGE_W_MAX, w + 2);
          if (win.width > 0.18) w = Math.max(LEDGE_W_MIN, w - 2);
          x = clampLedgeX((win.x ?? atMid.x) - w / 2, w);
          ledge = makeLedge(id, x, y, w, crumbleIn);
          win = measureLandingWindow(src.x, src.y, dir, ledge);
        }
        if (win.ok && win.width >= 0.10 && win.width <= 0.18 && win.lo > CHARGE_MIN + 0.02 && win.hi < 0.98) {
          return { ledge, takeoffX: win.x ?? atMid.x, dir, win };
        }
      }
    }
  }
  return null;
}


function placeSharedCenter(id, y, crumbleIn, leftSrc, rightSrc, rng, tutorial, band) {
  const { min: winMin, max: winMax } = windowRange(tutorial, band);
  const slab = { x: -20, y, w: VIEW_W + 40, h: LEDGE_H, phase: "solid" };
  const targetX = VIEW_W / 2;
  for (let attempt = 0; attempt < 14; attempt++) {
    const pickPower = (src, dir) => {
      let best = null;
      const lo = Math.max(CHARGE_MIN + 0.08, minPowerForGap(y - src.y) + 0.06);
      const hi = 0.92;
      for (let pwr = lo; pwr <= hi; pwr += 0.02) {
        const r = canReachAtPower(src.x, src.y, dir, slab, pwr);
        if (!r.ok) continue;
        const err = Math.abs(r.x - targetX);
        if (!best || err < best.err) best = { power: pwr, x: r.x, err };
      }
      return best;
    };
    const fromL = pickPower(leftSrc, 1);
    const fromR = pickPower(rightSrc, -1);
    if (!fromL || !fromR) continue;
    const cx = (fromL.x + fromR.x) / 2;
    const targetW = randRange(rng, winMin, winMax);
    const half = targetW / 2;
    const edgeL = canReachAtPower(leftSrc.x, leftSrc.y, 1, slab, fromL.power - half);
    const edgeH = canReachAtPower(leftSrc.x, leftSrc.y, 1, slab, fromL.power + half);
    if (!edgeL.ok || !edgeH.ok) continue;
    let w = Math.max(LEDGE_W_MIN, Math.min(LEDGE_W_MAX, Math.abs(edgeH.x - edgeL.x) - LAND_FOOT_W));
    let x = clampLedgeX(cx - w / 2, w);
    let ledge = makeLedge(id, x, y, w, crumbleIn);
    let winL = measureLandingWindow(leftSrc.x, leftSrc.y, 1, ledge);
    let winR = measureLandingWindow(rightSrc.x, rightSrc.y, -1, ledge);
    for (let adj = 0; adj < 8; adj++) {
      const okL = winL.ok && winL.width >= winMin - 0.015 && winL.width <= winMax + 0.015 && winL.lo > CHARGE_MIN + 0.02 && winL.hi < 0.98;
      const okR = winR.ok && winR.width >= winMin - 0.015 && winR.width <= winMax + 0.015 && winR.lo > CHARGE_MIN + 0.02 && winR.hi < 0.98;
      if (okL && okR) {
        return [
          { ledge, takeoffX: ledge.x + ledge.w / 2, dir: 1, win: winL },
        ];
      }
      const tooNarrow = (winL.ok && winL.width < winMin) || (winR.ok && winR.width < winMin) || !winL.ok || !winR.ok;
      const tooWide = (winL.ok && winL.width > winMax) || (winR.ok && winR.width > winMax);
      if (tooNarrow) w = Math.min(LEDGE_W_MAX, w + 2);
      else if (tooWide) w = Math.max(LEDGE_W_MIN, w - 2);
      else w = Math.min(LEDGE_W_MAX, w + 2);
      x = clampLedgeX(cx - w / 2, w);
      ledge = makeLedge(id, x, y, w, crumbleIn);
      winL = measureLandingWindow(leftSrc.x, leftSrc.y, 1, ledge);
      winR = measureLandingWindow(rightSrc.x, rightSrc.y, -1, ledge);
    }
  }
  return null;
}

function hasUsableWindow(src, ledge, tutorial, band) {
  const { min: winMin, max: winMax } = windowRange(tutorial, band);
  for (const dir of [-1, 1]) {
    const win = measureLandingWindow(src.x, src.y, dir, ledge);
    if (
      win.ok &&
      win.width >= winMin - 0.015 &&
      win.width <= winMax + 0.015 &&
      win.lo > CHARGE_MIN + 0.02 &&
      win.hi < 0.98
    ) {
      return win;
    }
  }
  return null;
}

function desiredDirs(rowIndex, sources, rng, band) {
  // Zigzag: far-apart edge sources jump inward; clustered mid sources fan out.
  // Every source gets a plan so no platform is a dead end.
  const s = [...sources].sort((a, b) => a.x - b.x);
  const tutorialLike = rowIndex <= FIRST_ROWS;
  if (s.length >= 2) {
    const lo = s[0];
    const hi = s[s.length - 1];
    if (lo.x < 110 && hi.x > 250) {
      return [
        { src: lo, dir: 1 },
        { src: hi, dir: -1 },
      ];
    }
    return [
      { src: lo, dir: -1 },
      { src: hi, dir: 1 },
    ];
  }
  const src = s[0];
  if (tutorialLike || rng() >= band.oneSideChance) {
    return [
      { src, dir: -1 },
      { src, dir: 1 },
    ];
  }
  return [{ src, dir: rng() < 0.5 ? -1 : 1 }];
}

function nextSources(placed, y) {
  // Take off from the center of each placed ledge (play snaps there on land).
  const xs = placed
    .map((p) => p.ledge.x + p.ledge.w / 2)
    .filter((x) => Number.isFinite(x))
    .sort((a, b) => a - b);
  if (!xs.length) return [];
  if (xs.length === 1 || xs[xs.length - 1] - xs[0] < 24) return [{ x: xs[0], y }];
  return [
    { x: xs[0], y },
    { x: xs[xs.length - 1], y },
  ];
}

/**
 * Generate every ledge with top Y in [yFrom, yTo], walking from the start
 * floor so overlapping ranges return the same id and coordinates.
 */
export function generateLedges(seed, yFrom, yTo) {
  if (yTo < yFrom) return [];
  const rng = createRng(seed);
  const all = [startFloor()];
  let sources = [{ x: 180, y: 0 }];
  let prevY = 0;
  let row = 0;

  while (prevY < yTo) {
    row += 1;
    const tutorial = row <= FIRST_ROWS;
    const band = bandAtY(prevY + (tutorial ? 58 : 72));
    const gapMin = tutorial ? 48 : band.gapMin;
    const gapMax = tutorial ? 66 : band.gapMax;
    const y = prevY + randRange(rng, gapMin, gapMax);
    const crumbleIn = tutorial ? FIRST_CRUMBLE : bandAtY(y).crumbleIn;
    const plans = desiredDirs(row, sources, rng, bandAtY(y));
    const placed = [];
    let seq = 0;
    const inward = plans.length === 2 && plans[0].dir === 1 && plans[1].dir === -1 && plans[0].src.x < plans[1].src.x;
    if (inward) {
      seq += 1;
      const shared = placeSharedCenter(`L${row}-${seq}`, y, crumbleIn, plans[0].src, plans[1].src, rng, tutorial, bandAtY(y));
      if (shared) placed.push(...shared);
    }
    for (const plan of plans) {
      if (inward && placed.length) break;
      // Skip if this source already has a next ledge in this direction (avoids
      // a second platform catching an overshoot).
      const already = placed.some((p) => p.dir === plan.dir && hasUsableWindow(plan.src, p.ledge, tutorial, bandAtY(y)));
      if (already) continue;
      seq += 1;
      const got = placeFromSource(`L${row}-${seq}`, y, crumbleIn, plan.src, plan.dir, rng, tutorial, bandAtY(y));
      if (got) placed.push(got);
    }

    // If a source got no ledge, try the opposite dir once. Never a 3rd platform.
    if (placed.length < 2) {
      for (const src of sources) {
        if (placed.length >= 2) break;
        const ok = placed.some((p) => hasUsableWindow(src, p.ledge, tutorial, bandAtY(y)));
        if (ok) continue;
        const prefer = src.x < VIEW_W / 2 ? 1 : -1;
        seq += 1;
        const got = placeFromSource(`L${row}-${seq}`, y, crumbleIn, src, prefer, rng, tutorial, bandAtY(y))
          || placeFromSource(`L${row}-${seq}`, y, crumbleIn, src, -prefer, rng, tutorial, bandAtY(y));
        if (got) placed.push(got);
      }
    }

    for (const p of placed) all.push(p.ledge);
    if (!placed.length) break;
    sources = nextSources(placed, y);
    prevY = y;
  }

  return all.filter((l) => l.y >= yFrom && l.y <= yTo);
}

export { measureLandingWindow, windowRange };
