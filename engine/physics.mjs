/** Integration, jump, walls, and landing AABB. Y is up. Does not touch the DOM. */

import {
  VIEW_W,
  PLAYER_W,
  GRAVITY,
  JUMP_VX_MIN,
  JUMP_VX_MAX,
  JUMP_VY_MIN,
  JUMP_VY_MAX,
  CHARGE_MIN,
  CHARGE_SAMPLES,
  LAND_SLOP_X,
  LAND_SLOP_Y,
  FIXED_DT,
} from "./constants.mjs";

export function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

/** Raw charge 0–1 → applied power in [CHARGE_MIN, 1]. */
export function chargePower(charge) {
  return CHARGE_MIN + (1 - CHARGE_MIN) * clamp01(charge);
}

/** Power 0–1 → jump speeds. Typical applied power is in [CHARGE_MIN, 1]. */
export function jumpVelocity(power) {
  const p = clamp01(power);
  return {
    vx: JUMP_VX_MIN + (JUMP_VX_MAX - JUMP_VX_MIN) * p,
    vy: JUMP_VY_MIN + (JUMP_VY_MAX - JUMP_VY_MIN) * p,
  };
}

export function clampWalls(player) {
  const half = PLAYER_W / 2;
  if (player.x < half) {
    player.x = half;
    player.vx = 0;
  } else if (player.x > VIEW_W - half) {
    player.x = VIEW_W - half;
    player.vx = 0;
  }
}

/** Kinematic Y (exact under constant g) + Euler X. Mutates player. */
export function integrate(player, dt) {
  player.y += player.vy * dt - 0.5 * GRAVITY * dt * dt;
  player.vy -= GRAVITY * dt;
  player.x += player.vx * dt;
  clampWalls(player);
}

export function applyJump(player, dir, power = CHARGE_MIN) {
  const { vx, vy } = jumpVelocity(power);
  player.vx = dir * vx;
  player.vy = vy;
  player.grounded = false;
  player.coyote = 0;
  player.buffer = 0;
  player.charge = 0;
  player.charging = 0;
  player.pendingPower = 0;
  player.facing = dir;
  player.pose = "jump";
}

export function landingOverlapX(playerX, ledge) {
  const half = PLAYER_W / 2 + LAND_SLOP_X;
  return playerX - half < ledge.x + ledge.w && playerX + half > ledge.x;
}

export function isLandable(ledge) {
  return ledge.phase !== "break";
}

/**
 * Swept feet test against ledge tops. Returns the ledge landed on, or null.
 * `prevY` is the feet Y before this integration step.
 */
export function findLanding(player, prevY, ledges) {
  if (player.vy > 0) return null;
  const y = player.y;
  let best = null;
  for (const ledge of ledges) {
    if (!isLandable(ledge)) continue;
    if (!landingOverlapX(player.x, ledge)) continue;
    if (prevY >= ledge.y - LAND_SLOP_Y && y <= ledge.y + LAND_SLOP_Y) {
      if (!best || ledge.y > best.y) best = ledge;
    }
  }
  return best;
}

function canReachAtPower(fromX, fromY, dir, ledge, power) {
  const { vx, vy } = jumpVelocity(power);
  const dy = ledge.y - fromY;
  if (dy > (vy * vy) / (2 * GRAVITY) + LAND_SLOP_Y) return { ok: false };
  const p = { x: fromX, y: fromY, vx: dir * vx, vy };
  const steps = Math.ceil(1.6 / FIXED_DT);
  for (let i = 0; i < steps; i++) {
    const prevY = p.y;
    integrate(p, FIXED_DT);
    if (p.vy <= 0 && landingOverlapX(p.x, ledge)) {
      if (prevY >= ledge.y - LAND_SLOP_Y && p.y <= ledge.y + LAND_SLOP_Y) {
        return { ok: true, x: p.x, power };
      }
    }
    if (p.vy < 0 && p.y < Math.min(fromY, ledge.y) - 16) return { ok: false };
  }
  return { ok: false };
}

/**
 * Simulate a jump and report whether it lands on `ledge`.
 * If `power` is omitted, tries CHARGE_SAMPLES in [CHARGE_MIN, 1] and
 * returns the first that lands. Models walls the same way as play.
 * Returns { ok, x, power }.
 */
export function canReachLedge(fromX, fromY, dir, ledge, power) {
  if (power == null) {
    for (const pwr of CHARGE_SAMPLES) {
      const r = canReachAtPower(fromX, fromY, dir, ledge, pwr);
      if (r.ok) return r;
    }
    return { ok: false };
  }
  return canReachAtPower(fromX, fromY, dir, ledge, power);
}

export function canReachEither(fromX, fromY, ledge, power) {
  const r = canReachLedge(fromX, fromY, 1, ledge, power);
  if (r.ok) return r;
  return canReachLedge(fromX, fromY, -1, ledge, power);
}

export { CHARGE_MIN, CHARGE_SAMPLES };
