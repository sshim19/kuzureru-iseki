/** generateLedges(seed, yFrom, yTo) → ledges[] (idempotent). */

import {
  LEDGE_H,
  COLS,
  FIRST_ROWS,
  FIRST_CRUMBLE,
  FIRST_WIDTH,
  START_CRUMBLE,
  START_FLOOR_X,
  START_FLOOR_W,
  bandAtY,
} from "./constants.mjs";
import { createRng, randRange } from "./rng.mjs";
import { canReachLedge } from "./physics.mjs";

function makeLedge(id, col, y, w, crumbleIn) {
  const cx = COLS[col];
  return {
    id,
    x: cx - w / 2,
    y,
    w,
    h: LEDGE_H,
    landT: null,
    crumbleIn,
    phase: "solid",
    col,
  };
}

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
    col: 1,
  };
}

function reachable(fromX, fromY, ledge) {
  const right = canReachLedge(fromX, fromY, 1, ledge);
  if (right.ok) return right;
  return canReachLedge(fromX, fromY, -1, ledge);
}

function landingsFromSources(sources, ledge) {
  const xs = [];
  for (const s of sources) {
    const r = reachable(s.x, s.y, ledge);
    if (r.ok) xs.push(r.x);
  }
  return xs;
}

/**
 * Pick columns for the next row so every source can reach at least one ledge,
 * then drop any ledge nobody can land on.
 */
function placeRow(rowIndex, y, w, crumbleIn, sources, wantCols) {
  const tried = new Set(wantCols);
  const make = (col) => makeLedge(`L${rowIndex}-${col}`, col, y, w, crumbleIn);

  let cols = [...wantCols];
  let ledges = cols.map(make);

  for (const src of sources) {
    const ok = ledges.some((l) => reachable(src.x, src.y, l).ok);
    if (ok) continue;
    for (let col = 0; col < COLS.length; col++) {
      if (tried.has(col)) continue;
      const candidate = make(col);
      if (reachable(src.x, src.y, candidate).ok) {
        tried.add(col);
        cols.push(col);
        ledges.push(candidate);
        break;
      }
    }
  }

  ledges = ledges.filter((l) => landingsFromSources(sources, l).length > 0);
  const nextSources = [];
  for (const l of ledges) {
    const xs = landingsFromSources(sources, l);
    for (const x of xs) nextSources.push({ x, y: l.y, col: l.col });
  }
  return { ledges, sources: uniqueSources(nextSources.length ? nextSources : sources) };
}

/** Keep the leftmost and rightmost takeoff x per column so paths cannot explode. */
function uniqueSources(list) {
  const byCol = new Map();
  for (const s of list) {
    const arr = byCol.get(s.col) || [];
    arr.push(s);
    byCol.set(s.col, arr);
  }
  const out = [];
  for (const arr of byCol.values()) {
    arr.sort((a, b) => a.x - b.x);
    out.push(arr[0]);
    const last = arr[arr.length - 1];
    if (last.x - arr[0].x > 2) out.push(last);
  }
  return out;
}

function desiredCols(rowIndex, y, sources, rng) {
  if (rowIndex <= FIRST_ROWS) {
    if (rowIndex % 2 === 1) return [0, 2];
    return [1];
  }
  const onCenter = sources.some((s) => s.col === 1);
  const onEdge = sources.some((s) => s.col !== 1);
  const cols = [];
  if (onEdge) cols.push(1);
  if (onCenter) {
    const band = bandAtY(y);
    if (rng() < band.oneSideChance) {
      cols.push(rng() < 0.5 ? 0 : 2);
    } else {
      cols.push(0, 2);
    }
  }
  if (!cols.length) cols.push(1);
  return [...new Set(cols)].sort((a, b) => a - b);
}

/**
 * Generate every ledge with top Y in [yFrom, yTo], walking from the start
 * floor so overlapping ranges return the same id and coordinates.
 */
export function generateLedges(seed, yFrom, yTo) {
  if (yTo < yFrom) return [];
  const rng = createRng(seed);
  const all = [startFloor()];
  let sources = [{ x: 180, y: 0, col: 1 }];
  let prevY = 0;
  let row = 0;

  while (prevY < yTo) {
    row += 1;
    const tutorial = row <= FIRST_ROWS;
    const band = bandAtY(prevY + GAP_HINT(tutorial));
    const gapMin = tutorial ? 58 : band.gapMin;
    const gapMax = tutorial ? 66 : band.gapMax;
    const y = prevY + randRange(rng, gapMin, gapMax);
    const w = tutorial ? FIRST_WIDTH : bandAtY(y).width;
    const crumbleIn = tutorial ? FIRST_CRUMBLE : bandAtY(y).crumbleIn;
    const want = desiredCols(row, y, sources, rng);
    const placed = placeRow(row, y, w, crumbleIn, sources, want);
    all.push(...placed.ledges);
    sources = placed.sources;
    prevY = y;
    if (placed.ledges.length === 0) break;
  }

  return all
    .filter((l) => l.y >= yFrom && l.y <= yTo)
    .map(({ col, ...l }) => l);
}

function GAP_HINT(tutorial) {
  return tutorial ? 62 : 66;
}
