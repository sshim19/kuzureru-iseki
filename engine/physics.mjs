/** Integration, jump, walls, and landing AABB. Y is up. Does not touch the DOM. */

import {
  VIEW_W,
  GRAVITY,
  JUMP_VX_MIN,
  JUMP_VX_MAX,
  JUMP_VY_MIN,
  JUMP_VY_MAX,
  CHARGE_MIN,
  CHARGE_SAMPLES,
  LAND_FOOT_W,
  LAND_SLOP_X,
  LAND_SLOP_Y,
  FIXED_DT,
  FAIL_SIDE,
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

/** Off-screen (no wrap, no wall clamp). Used as a fail condition, not a bounce. */
export function isOffScreen(x) {
  return x < -FAIL_SIDE || x > VIEW_W + FAIL_SIDE;
}

/** Kinematic Y (exact under constant g) + Euler X. Mutates player. No wall clamp. */
export function integrate(player, dt) {
  player.y += player.vy * dt - 0.5 * GRAVITY * dt * dt;
  player.vy -= GRAVITY * dt;
  player.x += player.vx * dt;
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
  const half = LAND_FOOT_W / 2 + LAND_SLOP_X;
  return playerX - half < ledge.x + ledge.w && playerX + half > ledge.x;
}

export function isLandable(ledge) {
  return ledge.phase !== "break";
}

/**
 * Swept feet test against ledge tops. Only when descending (vy < 0).
 * `prevY` is the feet Y before this integration step.
 */
export function findLanding(player, prevY, ledges) {
  if (!(player.vy < 0)) return null;
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

export function canReachAtPower(fromX, fromY, dir, ledge, power) {
  const { vx, vy } = jumpVelocity(power);
  const dy = ledge.y - fromY;
  if (dy > (vy * vy) / (2 * GRAVITY) + LAND_SLOP_Y) return { ok: false };
  const p = { x: fromX, y: fromY, vx: dir * vx, vy };
  const steps = Math.ceil(0.9 / FIXED_DT);
  for (let i = 0; i < steps; i++) {
    const prevY = p.y;
    integrate(p, FIXED_DT);
    if (isOffScreen(p.x)) return { ok: false };
    if (p.vy < 0 && landingOverlapX(p.x, ledge)) {
      if (prevY >= ledge.y - LAND_SLOP_Y && p.y <= ledge.y + LAND_SLOP_Y) {
        return { ok: true, x: p.x, power };
      }
    }
    if (p.vy < 0 && p.y < Math.min(fromY, ledge.y) - 16) return { ok: false };
  }
  return { ok: false };
}

/**
 * Inclusive power interval in [CHARGE_MIN, 1] that lands on `ledge`.
 * Coarse scan + binary search. Assumes a single contiguous window.
 * Returns { ok, lo, hi, width, mid, x, dir, power }.
 */
export function measureLandingWindow(fromX, fromY, dir, ledge) {
  const lands = (power) => canReachAtPower(fromX, fromY, dir, ledge, power);
  const coarse = 0.02;
  let first = null;
  let last = null;
  let firstX = null;
  for (let pwr = CHARGE_MIN; pwr <= 1.0001; pwr += coarse) {
    const power = pwr >= 1 ? 1 : Math.round(pwr * 1000) / 1000;
    const r = lands(power);
    if (r.ok) {
      if (first == null) {
        first = power;
        firstX = r.x;
      }
      last = power;
    } else if (first != null) {
      break;
    }
  }
  if (first == null) return { ok: false, lo: null, hi: null, width: 0, dir };

  function shrinkLo(miss, hit) {
    for (let i = 0; i < 8; i++) {
      const mid = (miss + hit) / 2;
      if (lands(mid).ok) hit = mid;
      else miss = mid;
    }
    return hit;
  }
  function shrinkHi(hit, miss) {
    for (let i = 0; i < 8; i++) {
      const mid = (hit + miss) / 2;
      if (lands(mid).ok) hit = mid;
      else miss = mid;
    }
    return hit;
  }

  const lo = first <= CHARGE_MIN + 1e-9 ? CHARGE_MIN : shrinkLo(Math.max(CHARGE_MIN, first - coarse), first);
  const hi = last >= 1 - 1e-9 ? 1 : shrinkHi(last, Math.min(1, last + coarse));
  const mid = (lo + hi) / 2;
  const atMid = lands(mid);
  return {
    ok: true,
    lo,
    hi,
    width: hi - lo,
    mid,
    x: atMid.ok ? atMid.x : firstX,
    dir,
    power: mid,
  };
}

/**
 * Simulate a jump and report whether it lands on `ledge`.
 * If `power` is omitted, tries CHARGE_SAMPLES then a fine scan.
 * Returns { ok, x, power }.
 */
export function canReachLedge(fromX, fromY, dir, ledge, power) {
  if (power == null) {
    for (const pwr of CHARGE_SAMPLES) {
      const r = canReachAtPower(fromX, fromY, dir, ledge, pwr);
      if (r.ok) return r;
    }
    const win = measureLandingWindow(fromX, fromY, dir, ledge);
    if (win.ok) return { ok: true, x: win.x, power: win.mid };
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
