/** Integration, jump, walls, and landing AABB. Y is up. Does not touch the DOM. */

import {
  VIEW_W,
  PLAYER_W,
  GRAVITY,
  JUMP_VX,
  JUMP_VY,
  LAND_SLOP_X,
  LAND_SLOP_Y,
  FIXED_DT,
} from "./constants.mjs";

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

export function applyJump(player, dir) {
  player.vx = dir * JUMP_VX;
  player.vy = JUMP_VY;
  player.grounded = false;
  player.coyote = 0;
  player.buffer = 0;
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

function descendingTime(dy) {
  const disc = JUMP_VY * JUMP_VY - 2 * GRAVITY * dy;
  if (disc < 0) return null;
  return (JUMP_VY + Math.sqrt(disc)) / GRAVITY;
}

/**
 * Simulate one fixed-arc jump and report whether it lands on `ledge`.
 * Models walls the same way as play. Returns { ok, x } with landing x.
 */
export function canReachLedge(fromX, fromY, dir, ledge) {
  const dy = ledge.y - fromY;
  if (dy > (JUMP_VY * JUMP_VY) / (2 * GRAVITY) + LAND_SLOP_Y) return { ok: false };
  const tLand = descendingTime(Math.max(0, dy));
  if (tLand == null && dy > 0) return { ok: false };

  const p = { x: fromX, y: fromY, vx: dir * JUMP_VX, vy: JUMP_VY };
  const steps = Math.ceil(1.2 / FIXED_DT);
  for (let i = 0; i < steps; i++) {
    const prevY = p.y;
    integrate(p, FIXED_DT);
    if (p.vy <= 0 && landingOverlapX(p.x, ledge)) {
      if (prevY >= ledge.y - LAND_SLOP_Y && p.y <= ledge.y + LAND_SLOP_Y) {
        return { ok: true, x: p.x };
      }
    }
    if (p.vy < 0 && p.y < Math.min(fromY, ledge.y) - 16) return { ok: false };
  }
  return { ok: false };
}

export function canReachEither(fromX, fromY, ledge) {
  const r = canReachLedge(fromX, fromY, 1, ledge);
  if (r.ok) return r;
  return canReachLedge(fromX, fromY, -1, ledge);
}
