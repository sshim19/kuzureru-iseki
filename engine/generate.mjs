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
  WINDOW_FLOOR,
  bandAtY,
  GRAVITY,
  LAND_SLOP_Y,
} from "./constants.mjs";
import { createRng, randRange } from "./rng.mjs";
import { canReachAtPower, jumpVelocity, measureLandingWindow, clampOntoLedge } from "./physics.mjs";

const EDGE = 8;
const SIZE = {
  short: { lo: 14, hi: 30 },
  medium: { lo: 32, hi: 60 },
  wide: { lo: 60, hi: 110 },
};

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

function pickSizeClass(rng, tutorial, band) {
  const shortChance = tutorial ? 0.04 : (band.shortChance ?? 0.2);
  const r = rng();
  if (r < shortChance) return "short";
  // Remaining split evenly between medium and wide (~40/40 overall when short is 20%).
  if (r < shortChance + (1 - shortChance) * 0.5) return "medium";
  return "wide";
}

function pickWidth(rng, cls) {
  const { lo, hi } = SIZE[cls];
  return randRange(rng, lo, hi);
}

function hasMargins(win) {
  return win.ok && win.lo > CHARGE_MIN + 0.02 && win.hi < 0.98;
}

function usableEnough(win, winMin) {
  return win.ok && win.width + 1e-6 >= Math.max(WINDOW_FLOOR, winMin - 0.04);
}

/**
 * Place one ledge so that, from `src` in `dir`, a landing window of at least
 * WINDOW_FLOOR exists, preferably in the band target, and usually missable
 * with a short tap or a full charge. Width is drawn from a size class first
 * so bars look mixed (wide breathers, medium, occasional shorts).
 */
function placeFromSource(id, y, crumbleIn, src, dir, rng, tutorial, band) {
  const { min: winMin, max: winMax } = windowRange(tutorial, band);
  const dy = y - src.y;
  const heightFloor = minPowerForGap(dy);
  const slab = { x: -30, y, w: VIEW_W + 60, h: LEDGE_H, phase: "solid" };
  const tries = 10;
  let fallback = null;

  for (let attempt = 0; attempt < tries; attempt++) {
    const cls = pickSizeClass(rng, tutorial, band);
    let w = pickWidth(rng, cls);
    const typ = (winMin + winMax) / 2;
    const midLo = Math.max(heightFloor + typ * 0.45, CHARGE_MIN + typ * 0.45 + 0.03);
    const midHi = 1 - typ * 0.45 - 0.03;
    if (midLo > midHi) continue;
    const midPower = randRange(rng, midLo, midHi);
    const atMid = canReachAtPower(src.x, src.y, dir, slab, midPower);
    if (!atMid.ok || atMid.x == null) continue;
    if (atMid.x < 22 || atMid.x > VIEW_W - 22) continue;
    if (Math.abs(atMid.x - src.x) < 40) continue;

    // Small random offset so the landing point is not always the exact center.
    const offset = randRange(rng, -w * 0.18, w * 0.18);
    let x = clampLedgeX(atMid.x - w / 2 + offset, w);
    let ledge = makeLedge(id, x, y, w, crumbleIn);
    let win = measureLandingWindow(src.x, src.y, dir, ledge);

    const classMin = SIZE[cls].lo;
    for (let adj = 0; adj < 10 && win.ok; adj++) {
      const tooNarrow = win.width < WINDOW_FLOOR;
      const needMargin = !hasMargins(win);
      if (!tooNarrow && !needMargin) break;
      if (tooNarrow) w = Math.min(LEDGE_W_MAX, w + 6);
      else if (needMargin && cls !== "wide") {
        // Keep the size class; shrink only down to the class min (never crush wides).
        const nextW = w - 4 >= classMin ? w - 4 : w;
        if (nextW === w) break;
        w = nextW;
      } else {
        break;
      }
      x = clampLedgeX((win.x ?? atMid.x) - w / 2, w);
      ledge = makeLedge(id, x, y, w, crumbleIn);
      win = measureLandingWindow(src.x, src.y, dir, ledge);
    }

    if (!win.ok) continue;
    if (win.width + 1e-6 < WINDOW_FLOOR) continue;
    const inBand = win.width >= winMin - 0.04 && win.width <= winMax + 0.06;
    const okMargins = hasMargins(win);
    if (win.ok && win.width >= WINDOW_FLOOR && (okMargins || cls === "wide")) {
      return { ledge, takeoffX: win.x ?? atMid.x, dir, win };
    }
    if (win.ok && win.width >= WINDOW_FLOOR && okMargins) {
      if (!fallback || Math.abs(win.width - typ) < Math.abs(fallback.win.width - typ)) {
        fallback = { ledge, takeoffX: win.x ?? atMid.x, dir, win };
      }
    }
  }

  if (fallback) return fallback;

  // Last try: mid power, any window at or above the floor with miss margins.
  const midPower = Math.max(heightFloor + 0.08, 0.7);
  if (midPower < 0.95) {
    const atMid = canReachAtPower(src.x, src.y, dir, slab, midPower);
    if (atMid.ok) {
      let w = randRange(rng, 36, 80);
      let x = clampLedgeX(atMid.x - w / 2, w);
      let ledge = makeLedge(id, x, y, w, crumbleIn);
      let win = measureLandingWindow(src.x, src.y, dir, ledge);
      for (let adj = 0; adj < 10 && win.ok; adj++) {
        if (win.width >= WINDOW_FLOOR && hasMargins(win)) break;
        if (!win.ok || win.width < WINDOW_FLOOR) w = Math.min(LEDGE_W_MAX, w + 6);
        else if (!hasMargins(win) && w > 32) w = Math.max(32, w - 4);
        else break;
        x = clampLedgeX((win.x ?? atMid.x) - w / 2, w);
        ledge = makeLedge(id, x, y, w, crumbleIn);
        win = measureLandingWindow(src.x, src.y, dir, ledge);
      }
      if (win.ok && win.width >= WINDOW_FLOOR && hasMargins(win)) {
        return { ledge, takeoffX: win.x ?? atMid.x, dir, win };
      }
    }
  }
  return null;
}

function placeSharedCenter(id, y, crumbleIn, leftSrc, rightSrc, rng, tutorial, band) {
  const { min: winMin, max: winMax } = windowRange(tutorial, band);
  const slab = { x: -30, y, w: VIEW_W + 60, h: LEDGE_H, phase: "solid" };
  // Random shared target, not a fixed column.
  const targetX = randRange(rng, 110, VIEW_W - 110);
  for (let attempt = 0; attempt < 12; attempt++) {
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
    const cls = pickSizeClass(rng, tutorial, band);
    let w = pickWidth(rng, cls);
    const classMin = SIZE[cls].lo;
    let x = clampLedgeX(cx - w / 2, w);
    let ledge = makeLedge(id, x, y, w, crumbleIn);
    let winL = measureLandingWindow(leftSrc.x, leftSrc.y, 1, ledge);
    let winR = measureLandingWindow(rightSrc.x, rightSrc.y, -1, ledge);
    for (let adj = 0; adj < 8; adj++) {
      const okL = winL.ok && winL.width >= WINDOW_FLOOR && hasMargins(winL);
      const okR = winR.ok && winR.width >= WINDOW_FLOOR && hasMargins(winR);
      if (okL && okR) {
        return [
          { ledge, takeoffX: winL.x ?? fromL.x, dir: 1, win: winL },
          { ledge, takeoffX: winR.x ?? fromR.x, dir: -1, win: winR },
        ];
      }
      const tooNarrow = !winL.ok || !winR.ok || winL.width < WINDOW_FLOOR || winR.width < WINDOW_FLOOR;
      const needMargin = (winL.ok && !hasMargins(winL)) || (winR.ok && !hasMargins(winR));
      if (tooNarrow) w = Math.min(LEDGE_W_MAX, w + 6);
      else if (needMargin && cls !== "wide" && w - 4 >= classMin) w = w - 4;
      else if (winL.ok && winR.ok && winL.width >= WINDOW_FLOOR && winR.width >= WINDOW_FLOOR && cls === "wide") {
        return [
          { ledge, takeoffX: winL.x ?? fromL.x, dir: 1, win: winL },
          { ledge, takeoffX: winR.x ?? fromR.x, dir: -1, win: winR },
        ];
      } else break;
      x = clampLedgeX(cx - w / 2, w);
      ledge = makeLedge(id, x, y, w, crumbleIn);
      winL = measureLandingWindow(leftSrc.x, leftSrc.y, 1, ledge);
      winR = measureLandingWindow(rightSrc.x, rightSrc.y, -1, ledge);
    }
  }
  return null;
}


function sampleTakeoffs(ledge, takeoffX) {
  if (!ledge) return [takeoffX];
  if (ledge.id === "start") return [180];
  const mid = clampOntoLedge(takeoffX ?? (ledge.x + ledge.w / 2), ledge);
  if (ledge.w < 48) return [mid];
  const lo = clampOntoLedge(ledge.x, ledge);
  const hi = clampOntoLedge(ledge.x + ledge.w, ledge);
  return [...new Set([mid, lo, hi].map((x) => Math.round(x * 10) / 10))];
}

function bestWindowFrom(x, y, ledge) {
  const right = measureLandingWindow(x, y, 1, ledge);
  const left = measureLandingWindow(x, y, -1, ledge);
  if (right.ok && left.ok) return right.width >= left.width ? right : left;
  return right.ok ? right : left;
}

function coversSamples(xs, y, ledge) {
  return xs.every((x) => {
    const win = bestWindowFrom(x, y, ledge);
    return win.ok && win.width + 1e-6 >= WINDOW_FLOOR;
  });
}

/** Widen a just-placed ledge so nearby takeoff xs on the source still land. */
function widenToCover(placed, src, samples) {
  if (!placed || !samples || samples.length <= 1) return placed;
  const y = src.y;
  let ledge = placed.ledge;
  let w = ledge.w;
  let x = ledge.x;
  const cx = placed.takeoffX ?? ledge.x + ledge.w / 2;
  for (let i = 0; i < 8 && !coversSamples(samples, y, ledge); i++) {
    w = Math.min(LEDGE_W_MAX, w + 8);
    x = clampLedgeX(cx - w / 2, w);
    ledge = makeLedge(ledge.id, x, ledge.y, w, ledge.crumbleIn);
  }
  if (!coversSamples(samples, y, ledge)) return placed;
  const win = placed.win && placed.win.dir != null
    ? measureLandingWindow(src.x, src.y, placed.dir, ledge)
    : bestWindowFrom(src.x, y, ledge);
  return {
    ...placed,
    ledge,
    takeoffX: win.ok ? (win.x ?? placed.takeoffX) : placed.takeoffX,
    win: win.ok ? win : placed.win,
  };
}

function hasUsableWindow(src, ledge, tutorial, band) {
  // A real landing (>= floor) is enough to skip adding a second catch-ledge,
  // even if the window touches min/max power.
  for (const dir of [-1, 1]) {
    const win = measureLandingWindow(src.x, src.y, dir, ledge);
    if (win.ok && win.width + 1e-6 >= WINDOW_FLOOR) return win;
  }
  return null;
}

function desiredDirs(rowIndex, sources, rng, band) {
  // Varied headings: far-apart edge sources often jump inward; otherwise
  // pick a random reachable direction per source so x is not column-locked.
  const s = [...sources].sort((a, b) => a.x - b.x);
  const tutorialLike = rowIndex <= FIRST_ROWS;
  if (s.length >= 2) {
    const lo = s[0];
    const hi = s[s.length - 1];
    if (lo.x < 110 && hi.x > 250 && rng() < 0.7) {
      return [
        { src: lo, dir: 1 },
        { src: hi, dir: -1 },
      ];
    }
    if (rng() < 0.5) {
      return [
        { src: lo, dir: -1 },
        { src: hi, dir: 1 },
      ];
    }
    return [
      { src: lo, dir: rng() < 0.45 ? -1 : 1 },
      { src: hi, dir: rng() < 0.55 ? 1 : -1 },
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
  // Designed landing x plus side samples on wide bars (play keeps actual x).
  const pts = [];
  for (const p of placed) {
    const L = p.ledge;
    const take = p.takeoffX ?? p.win?.x ?? L.x + L.w * 0.5;
    for (const x of sampleTakeoffs(L, take)) {
      pts.push({ x, y, ledge: L });
    }
  }
  pts.sort((a, b) => a.x - b.x);
  const uniq = [];
  for (const p of pts) {
    if (!uniq.some((u) => Math.abs(u.x - p.x) < 16)) uniq.push(p);
  }
  if (!uniq.length) return [];
  if (uniq.length <= 2) return uniq;
  return [uniq[0], uniq[uniq.length - 1]];
}

/**
 * Generate every ledge with top Y in [yFrom, yTo], walking from the start
 * floor so overlapping ranges return the same id and coordinates.
 */
export function generateLedges(seed, yFrom, yTo) {
  if (yTo < yFrom) return [];
  const rng = createRng(seed);
  const start = startFloor();
  const all = [start];
  let sources = [{ x: 180, y: 0, ledge: start }];
  let prevPlaced = [{ ledge: start, takeoffX: 180 }];
  let prevY = 0;
  let row = 0;

  while (prevY < yTo) {
    row += 1;
    const tutorial = row <= FIRST_ROWS;
    const band = bandAtY(prevY + (tutorial ? 58 : 72));
    const gapMin = tutorial ? 44 : band.gapMin;
    const gapMax = tutorial ? 80 : band.gapMax;
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
      let got = placeFromSource(`L${row}-${seq}`, y, crumbleIn, plan.src, plan.dir, rng, tutorial, bandAtY(y));
      if (got) {
        const samples = sampleTakeoffs(plan.src.ledge, plan.src.x);
        got = widenToCover(got, plan.src, samples);
        placed.push(got);
      }
    }

    // Cover every takeoff sample on the previous row (not just the 2 sources).
    const prevSources = [];
    for (const p of prevPlaced) {
      const L = p.ledge;
      const take = p.takeoffX ?? L.x + L.w / 2;
      for (const x of sampleTakeoffs(L, take)) {
        prevSources.push({ x, y: L.y, ledge: L });
      }
    }
    for (const src of prevSources) {
      const samples = sampleTakeoffs(src.ledge, src.x);
      const uncovered = samples.filter((x) => !placed.some((p) => hasUsableWindow({ x, y: src.y }, p.ledge)));
      if (!uncovered.length) continue;
      let covered = false;
      for (let i = 0; i < placed.length; i++) {
        const wide = widenToCover(placed[i], { x: uncovered[0], y: src.y }, uncovered);
        if (coversSamples(uncovered, src.y, wide.ledge)) {
          placed[i] = wide;
          covered = true;
          break;
        }
      }
      if (covered || placed.length >= 2) continue;
      const prefer = src.x < VIEW_W / 2 ? 1 : -1;
      seq += 1;
      let got = placeFromSource(`L${row}-${seq}`, y, crumbleIn, src, prefer, rng, tutorial, bandAtY(y))
        || placeFromSource(`L${row}-${seq}`, y, crumbleIn, src, -prefer, rng, tutorial, bandAtY(y));
      if (got) {
        got = widenToCover(got, src, samples);
        placed.push(got);
      }
    }

    for (const p of placed) {
      if (!all.some((l) => l.id === p.ledge.id)) all.push(p.ledge);
    }
    if (!placed.length) break;
    prevPlaced = placed;
    sources = nextSources(placed, y);
    prevY = y;
  }

  return all.filter((l) => l.y >= yFrom && l.y <= yTo);
}

export { measureLandingWindow, windowRange };
