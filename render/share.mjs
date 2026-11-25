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
export const GAME_TITLE = "崩れる遺跡の脱出";

export function shareText({ dateLabel, heightM }) {
  const h = Math.max(0, Math.floor(Number(heightM) || 0));
  return `${GAME_TITLE}\n${dateLabel}\n${h}m`;
}

/**
 * 公開ページの URL。query / hash は付けない。file: は空文字。
 * @param {Pick<Location, "origin" | "protocol" | "pathname">} [loc]
 */
export function sharePageUrl(loc = globalThis.location) {
  if (!loc || loc.protocol === "file:" || !loc.origin || loc.origin === "null") return "";
  let path = String(loc.pathname || "/");
  path = path.replace(/\/index\.html$/i, "/");
  if (!path) path = "/";
  return `${loc.origin}${path}`;
}

/** @param {{ text: string, url?: string }} rec */
export function tweetShareUrl({ text, url = "" }) {
  const params = new URLSearchParams();
  if (text) params.set("text", text);
  if (url) params.set("url", url);
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}

/** 結果文と URL を本文に載せる（lineit は URL のみ）。 */
/** @param {{ text: string, url?: string }} rec */
export function lineShareUrl({ text, url = "" }) {
  const body = [text, url].filter(Boolean).join("\n");
  return `https://line.me/R/share?text=${encodeURIComponent(body)}`;
}

export function canUseNativeShare() {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

/** @param {File[]} files */
export function canShareFiles(files) {
  try {
    return !!(
      files?.length &&
      typeof navigator?.canShare === "function" &&
      navigator.canShare({ files })
    );
  } catch {
    return false;
  }
}

export function isShareAbort(err) {
  return !!err && (err.name === "AbortError" || err.name === "Abort");
}

/** @param {{ text: string, url?: string }} rec */
export function shareCopyText({ text, url = "" }) {
  return url ? `${text}\n${url}` : text;
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
