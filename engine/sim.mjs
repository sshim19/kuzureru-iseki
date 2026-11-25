/** tick(state, input, dt) → state. Crumble, camera, fail, score. No DOM. */

import {
  BUFFER_TIME,
  COYOTE_TIME,
  CHARGE_TIME,
  FIXED_DT,
  MAX_DT,
  FAIL_BELOW,
  CAMERA_PLAYER_Y,
  HINT_JUMPS,
  MAX_SHARDS,
  GENERATE_AHEAD,
  GENERATE_CHUNK,
  START_X,
  bandAtY,
  heightMFromY,
  GRAVITY,
} from "./constants.mjs";
import { hash32 } from "./rng.mjs";
import { integrate, applyJump, findLanding, landingOverlapX, chargePower } from "./physics.mjs";
import { generateLedges } from "./generate.mjs";

function cloneState(s) {
  return {
    ...s,
    player: { ...s.player },
    ledges: s.ledges.map((l) => ({ ...l })),
    shards: s.shards.map((sh) => ({ ...sh })),
  };
}

function supportLedge(player, ledges) {
  for (const l of ledges) {
    if (l.phase === "break") continue;
    if (Math.abs(player.y - l.y) <= 0.5 && landingOverlapX(player.x, l)) return l;
  }
  return null;
}

function spawnShards(state, ledge) {
  const n = 3 + (hash32(String(ledge.id)) % 2);
  const mid = ledge.x + ledge.w / 2;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = ledge.x + t * ledge.w;
    state.shards.push({
      x,
      y: ledge.y - ledge.h * 0.35,
      vx: (x - mid) * 3.5 + ((hash32(ledge.id + ":" + i) % 21) - 10),
      vy: 80 + (hash32(ledge.id + "v" + i) % 40),
      life: 0.7 + (i % 3) * 0.08,
    });
  }
  if (state.shards.length > MAX_SHARDS) {
    state.shards.splice(0, state.shards.length - MAX_SHARDS);
  }
}

function updateCrumble(state, dt) {
  const t = state.t;
  for (const l of state.ledges) {
    if (l.phase === "break" || l.landT == null) continue;
    const remaining = l.crumbleIn - (t - l.landT);
    const warn = bandAtY(l.y).warn;
    if (remaining <= 0) {
      l.phase = "break";
      spawnShards(state, l);
    } else if (remaining <= warn) {
      l.phase = "warn";
    }
  }
  for (const sh of state.shards) {
    sh.life -= dt;
    sh.y += sh.vy * dt - 0.5 * GRAVITY * dt * dt;
    sh.vy -= GRAVITY * dt;
    sh.x += sh.vx * dt;
  }
  state.shards = state.shards.filter((sh) => sh.life > 0);
}

function ensureLedges(state) {
  let maxY = 0;
  for (const l of state.ledges) if (l.y > maxY) maxY = l.y;
  const need = state.player.y + GENERATE_AHEAD;
  if (need <= maxY) return;
  const more = generateLedges(state.seed, maxY, need + GENERATE_CHUNK);
  const have = new Set(state.ledges.map((l) => l.id));
  for (const l of more) if (!have.has(l.id)) state.ledges.push(l);
}

function updateCamera(state) {
  const desired = state.player.y - CAMERA_PLAYER_Y;
  if (desired > state.cameraY) state.cameraY = desired;
}

function holdDirFrom(input, charging) {
  const holdLeft = !!(input?.holdLeft || input?.jumpLeft);
  const holdRight = !!(input?.holdRight || input?.jumpRight);
  if (charging < 0 && holdLeft) return -1;
  if (charging > 0 && holdRight) return 1;
  if (holdLeft && !holdRight) return -1;
  if (holdRight && !holdLeft) return 1;
  if (holdLeft && holdRight) return charging || 0;
  return 0;
}

/** Level holds + release-to-jump. Applied once per tick before substeps. */
function applyChargeInput(state, input) {
  const p = state.player;
  const hold = holdDirFrom(input, p.charging);
  if (p.charging && hold !== p.charging) {
    if (hold === 0) {
      p.buffer = BUFFER_TIME;
      p.pendingPower = chargePower(p.charge);
      p.facing = p.charging < 0 ? -1 : 1;
    } else {
      p.charge = 0;
      p.buffer = 0;
      p.pendingPower = 0;
    }
  }
  p.charging = hold;
  if (hold) p.facing = hold;
  if (!hold && p.buffer <= 0) {
    p.charge = 0;
    p.pendingPower = 0;
  }
}

function step(state, dt) {
  const p = state.player;
  if (p.buffer > 0) p.buffer = Math.max(0, p.buffer - dt);
  if (p.coyote > 0) p.coyote = Math.max(0, p.coyote - dt);

  const canJump = p.grounded || p.coyote > 0;
  if (p.charging && canJump) {
    p.charge = Math.min(1, (p.charge || 0) + dt / CHARGE_TIME);
  }

  if (p.buffer > 0 && canJump) {
    const fromStart = p.grounded && supportLedge(p, state.ledges)?.id === "start";
    const power = p.pendingPower ?? chargePower(p.charge);
    applyJump(p, p.facing < 0 ? -1 : 1, power);
    if (state.hintJumpsLeft > 0) state.hintJumpsLeft -= 1;
    if (fromStart) {
      const start = state.ledges.find((l) => l.id === "start");
      if (start && start.landT == null) start.landT = state.t;
    }
  }

  if (p.grounded) {
    const under = supportLedge(p, state.ledges);
    if (!under) {
      p.grounded = false;
      p.coyote = COYOTE_TIME;
      p.pose = "fall";
    } else {
      p.vx = 0;
      p.vy = 0;
      p.y = under.y;
      p.pose = p.charging ? "crouch" : "stand";
    }
  }

  if (!p.grounded) {
    const prevY = p.y;
    integrate(p, dt);
    const hit = findLanding(p, prevY, state.ledges);
    if (hit) {
      p.y = hit.y;
      p.vy = 0;
      p.vx = 0;
      p.grounded = true;
      p.coyote = 0;
      p.pose = "stand";
      if (hit.landT == null) hit.landT = state.t;
    } else {
      p.pose = p.vy > 0 ? "jump" : "fall";
    }
  }

  state.t += dt;
  state.heightM = Math.max(state.heightM, heightMFromY(p.y));
  if (state.heightM > state.bestM) state.bestM = state.heightM;
  if (state.heightM > state.todayBestM) state.todayBestM = state.heightM;
  updateCamera(state);
  updateCrumble(state, dt);
  ensureLedges(state);

  if (p.y < state.cameraY - FAIL_BELOW) state.status = "over";
}

/**
 * Near-pure: same state+input+dt → same result. Does not mutate the input state.
 * Clamps dt to 50ms and steps at 1/60 + remainder.
 */
export function tick(state, input, dt) {
  if (state.status !== "playing") return cloneState(state);
  const s = cloneState(state);
  applyChargeInput(s, input);
  let left = Math.min(Math.max(Number(dt) || 0, 0), MAX_DT);
  while (left > 0 && s.status === "playing") {
    const stepDt = Math.min(FIXED_DT, left);
    step(s, stepDt);
    left -= stepDt;
  }
  return s;
}

/** Fresh playing state for a run. bestM / todayBestM are in-memory; persist elsewhere. */
export function createInitialState({ seed, dateJst, bestM = 0, todayBestM = 0 } = {}) {
  const ledges = generateLedges(seed, 0, GENERATE_AHEAD);
  return {
    status: "playing",
    seed,
    dateJst: dateJst ?? null,
    t: 0,
    cameraY: -CAMERA_PLAYER_Y,
    player: {
      x: START_X,
      y: 0,
      vx: 0,
      vy: 0,
      facing: 1,
      grounded: true,
      pose: "stand",
      coyote: 0,
      buffer: 0,
      charge: 0,
      charging: 0,
      pendingPower: 0,
    },
    ledges,
    shards: [],
    heightM: 0,
    bestM,
    todayBestM,
    hintJumpsLeft: HINT_JUMPS,
  };
}

export { generateLedges };
