/** 共有文と localStorage の読み書き。日付は実行時の JST。 */

import {
  STORAGE_BEST,
  STORAGE_DAILY_PREFIX,
  SEED_PREFIX,
} from "../engine/constants.mjs";

export { STORAGE_BEST, STORAGE_DAILY_PREFIX, SEED_PREFIX };

/**
 * @param {Date} [now]
 * @returns {{ dateJst: string, dateLabel: string, year: number, month: number, day: number }}
 */
export function getJstDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  const pick = (type) => Number(parts.find((p) => p.type === type)?.value);
  const year = pick("year");
  const month = pick("month");
  const day = pick("day");
  const dateJst = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const dateLabel = `${month}月${day}日`;
  return { dateJst, dateLabel, year, month, day };
}

export function dailyKey(dateJst) {
  return `${STORAGE_DAILY_PREFIX}${dateJst}`;
}

export function seedString(dateJst) {
  return `${SEED_PREFIX}${dateJst}`;
}

function readNum(storage, key) {
  try {
    const raw = storage.getItem(key);
    if (raw == null || raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} dateJst
 * @param {Storage} [storage]
 * @returns {{ bestM: number | null, todayBestM: number | null }}
 */
export function loadBests(dateJst, storage = globalThis.localStorage) {
  if (!storage) return { bestM: null, todayBestM: null };
  return {
    bestM: readNum(storage, STORAGE_BEST),
    todayBestM: readNum(storage, dailyKey(dateJst)),
  };
}

/**
 * 今回の高さを保存する。戻り値の best は保存後の値。
 * isNewTodayBest は自己ベスト更新と重なるときは false（文言を重ねない）。
 *
 * @param {{ dateJst: string, heightM: number }} rec
 * @param {Storage} [storage]
 */
export function saveBests({ dateJst, heightM }, storage = globalThis.localStorage) {
  const prev = loadBests(dateJst, storage);
  const height = Math.max(0, Math.floor(Number(heightM) || 0));
  const isNewBest = height > (prev.bestM ?? 0);
  const todayGrew = height > (prev.todayBestM ?? 0);
  const bestM = prev.bestM == null ? height : Math.max(prev.bestM, height);
  const todayBestM = prev.todayBestM == null ? height : Math.max(prev.todayBestM, height);
  try {
    if (bestM > 0) storage?.setItem(STORAGE_BEST, String(bestM));
    if (todayBestM > 0) storage?.setItem(dailyKey(dateJst), String(todayBestM));
  } catch {
    /* private mode など */
  }
  return {
    bestM,
    todayBestM,
    isNewBest,
    isNewTodayBest: todayGrew && !isNewBest,
  };
}

/**
 * 改行3行。配置や答えは出さない。
 * @param {{ dateLabel: string, heightM: number }} rec
 */
export function shareText({ dateLabel, heightM }) {
  const h = Math.max(0, Math.floor(Number(heightM) || 0));
  return `崩れる遺跡の脱出\n${dateLabel}\n${h}m`;
}

/** @param {string} text @returns {Promise<boolean>} */
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fallback へ */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.setAttribute("aria-hidden", "true");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return !!ok;
  } catch {
    return false;
  }
}
