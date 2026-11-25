/** Shared physical constants, bands, palette, and storage keys. Y is up. */

export const VIEW_W = 360;
export const VIEW_H = 640;
export const METER = 40;

export const PLAYER_W = 22;
export const PLAYER_H = 30;
export const START_X = 180;

/** Downward magnitude (wu/s²). Apply as vy -= GRAVITY * dt. */
export const GRAVITY = 1800;
/** Charge 0→1 over this many seconds, then clamp. Jump on release. */
export const CHARGE_TIME = 0.6;
/** Short tap still uses at least this power (0–1). */
export const CHARGE_MIN = 0.45;
/** Sampled powers for reachability / generation fairness. */
export const CHARGE_SAMPLES = [0.45, 0.52, 0.6, 0.68, 0.76, 0.84, 0.92, 1];

/** Horizontal jump speed at power 0 and 1; sign comes from facing.
 *  Strong vx scale so a short hop undershoots and a full charge overshoots. */
export const JUMP_VX_MIN = 70;
export const JUMP_VX_MAX = 290;
/** Upward jump speed at power 0 and 1. Apex ≈ 75–114 wu; height mainly
 *  has to clear the gap, while horizontal travel is the skill. */
export const JUMP_VY_MIN = 520;
export const JUMP_VY_MAX = 640;
/** Mid-power aliases. */
export const JUMP_VX = JUMP_VX_MIN + (JUMP_VX_MAX - JUMP_VX_MIN) * 0.625;
export const JUMP_VY = JUMP_VY_MIN + (JUMP_VY_MAX - JUMP_VY_MIN) * 0.625;

export const LEDGE_H = 14;
export const COLS = [70, 180, 290];
export const GAP_MIN = 44;
export const GAP_MAX = 96;
export const LEDGE_W_MIN = 10;
export const LEDGE_W_MAX = 56;

export const BUFFER_TIME = 0.1;
export const COYOTE_TIME = 0.1;
/** Landing uses a narrow foot, not the full body, so charge windows stay tight. */
export const LAND_FOOT_W = 8;
export const LAND_SLOP_X = 0;
export const LAND_SLOP_Y = 2;
export const FIXED_DT = 1 / 60;
export const MAX_DT = 0.05;

export const FAIL_BELOW = 8;
/** Fly past the screen edge (no wall clamp) and the run ends. */
export const FAIL_SIDE = 12;

/**
 * Camera contract (Y-up):
 * - `cameraY` is the world Y of the viewport's bottom edge.
 * - Visible world Y is [cameraY, cameraY + VIEW_H).
 * - Camera never decreases.
 * - Follow: cameraY = max(cameraY, player.y - CAMERA_PLAYER_Y).
 * - Fail: player.y < cameraY - FAIL_BELOW.
 *
 * Design §3 asked for ~48wu of space above the player's head. That is less
 * than the 58–74wu ledge gap, so the next ledge would sit off-screen.
 * CAMERA_PLAYER_Y keeps the feet ~200wu above the bottom instead, leaving
 * room to see upcoming ledges. Render should import these constants.
 */
export const CAMERA_HEADROOM = 48;
export const CAMERA_PLAYER_Y = 200;

export const START_FLOOR_X = 20;
export const START_FLOOR_W = 320;
export const FIRST_ROWS = 3;
export const FIRST_CRUMBLE = 2.0;
export const FIRST_WIDTH = 40;
export const START_CRUMBLE = 2.0;
export const HINT_JUMPS = 3;
export const MAX_SHARDS = 40;
export const GENERATE_AHEAD = 800;
export const GENERATE_CHUNK = 400;

export const STORAGE_BEST = "kuzureru-iseki:bestHeight";
export const STORAGE_DAILY_PREFIX = "kuzureru-iseki:daily:";
export const SEED_PREFIX = "kuzureru-iseki:";

export const PALETTE = {
  stone: ["#c9b896", "#f0e3c6", "#ddc89a", "#c9b17e", "#c9a978"],
  edge: ["#8a6a42", "#6f5434", "#5c4328", "#3a2718"],
  cream: ["#f4ead0", "#fff8e6"],
  moss: ["#b7c984", "#9aaf68"],
  cloth: ["#e09a7c", "#d08064"],
  pit: ["#24180f", "#16100b"],
  ink: "#3a2718",
};

/** Height bands: crumble / warn / width / gap, and how often only one side is offered. */
/** windowMin/Max: landing power window in [CHARGE_MIN, 1] for each next ledge. */
export const BANDS = [
  { upToM: 15, crumbleIn: 1.8, warn: 0.5, width: 40, gapMin: 44, gapMax: 70, oneSideChance: 0, windowMin: 0.16, windowMax: 0.18 },
  { upToM: 40, crumbleIn: 1.4, warn: 0.45, width: 34, gapMin: 46, gapMax: 78, oneSideChance: 0, windowMin: 0.14, windowMax: 0.17 },
  { upToM: 80, crumbleIn: 1.1, warn: 0.4, width: 28, gapMin: 50, gapMax: 86, oneSideChance: 0.15, windowMin: 0.12, windowMax: 0.16 },
  { upToM: 130, crumbleIn: 0.85, warn: 0.35, width: 24, gapMin: 54, gapMax: 92, oneSideChance: 0.3, windowMin: 0.11, windowMax: 0.15 },
  { upToM: Infinity, crumbleIn: 0.65, warn: 0.3, width: 20, gapMin: 58, gapMax: 96, oneSideChance: 0.55, windowMin: 0.10, windowMax: 0.14 },
];

export const TUTORIAL_WINDOW_MIN = 0.16;
export const TUTORIAL_WINDOW_MAX = 0.18;

export function bandAtY(y) {
  const m = y / METER;
  for (const b of BANDS) if (m < b.upToM || b.upToM === Infinity) return b;
  return BANDS[BANDS.length - 1];
}

export function heightMFromY(y) {
  return Math.max(0, Math.floor(y / METER));
}
