/** タイトル / HUD / 終了の DOM と文言。 */

export const RULE_HOLD =
  "左か右を押してためて、はなすとその向きに跳べます。長く押すほど、高く遠くまで跳べます。";
export const RULE_SWIPE =
  "跳びたい向きに指をはらうと跳べます。長くはらうほど、高く遠くまで跳べます。";

/**
 * @param {ParentNode} [root]
 */
export function bindScreens(root = document) {
  const el = {
    body: document.body,
    playBar: root.querySelector("#play-bar"),
    hud: root.querySelector("#play-hud"),
    hudHeight: root.querySelector("#hud-height"),
    hudBest: root.querySelector("#hud-best"),
    hints: root.querySelector("#play-hints"),
    title: root.querySelector("#screen-title"),
    titleHeading: root.querySelector("#screen-title h1"),
    titleDate: root.querySelector("#title-date"),
    titleRecord: root.querySelector("#title-record"),
    btnStart: root.querySelector("#btn-start"),
    over: root.querySelector("#screen-over"),
    overHeading: root.querySelector("#screen-over h1"),
    overHeight: root.querySelector("#over-height"),
    overToday: root.querySelector("#over-today"),
    overBest: root.querySelector("#over-best"),
    overNewBest: root.querySelector("#over-new-best"),
    overNewToday: root.querySelector("#over-new-today"),
    btnRetry: root.querySelector("#btn-retry"),
    btnShare: root.querySelector("#btn-share"),
    btnCopy: root.querySelector("#btn-copy"),
    btnShareX: root.querySelector("#btn-share-x"),
    btnShareLine: root.querySelector("#btn-share-line"),
    btnShareIg: root.querySelector("#btn-share-ig"),
    btnQuit: root.querySelector("#btn-quit"),
    copyStatus: root.querySelector("#copy-status"),
    canvas: root.querySelector("#game"),
    rules: root.querySelectorAll(".rule"),
    modeBtns: root.querySelectorAll("[data-mode]"),
  };

  function hide(node, on) {
    if (!node) return;
    node.hidden = !!on;
  }

  function focusHeading(node) {
    if (!node) return;
    try {
      node.focus({ preventScroll: true });
    } catch {
      /* ignore */
    }
  }

  /**
   * @param {"hold" | "swipe"} mode
   */
  function applyControlMode(mode) {
    const swipe = mode === "swipe";
    for (const btn of el.modeBtns) {
      btn.setAttribute("aria-pressed", String(btn.dataset.mode === (swipe ? "swipe" : "hold")));
    }
    const rule = swipe ? RULE_SWIPE : RULE_HOLD;
    for (const node of el.rules) node.textContent = rule;
    if (el.canvas) {
      el.canvas.setAttribute(
        "aria-label",
        swipe
          ? "プレイ画面。跳びたい向きに指をはらうと跳べます"
          : "プレイ画面。左右を押してため、はなすと跳べます",
      );
    }
  }

  /** @param {(mode: "hold" | "swipe") => void} fn */
  function onControlModeChange(fn) {
    for (const btn of el.modeBtns) {
      btn.addEventListener("click", () => {
        const mode = btn.dataset.mode === "swipe" ? "swipe" : "hold";
        applyControlMode(mode);
        fn?.(mode);
      });
    }
  }

  /**
   * @param {{ dateLabel: string, bestM: number | null }} data
   */
  function showTitle(data) {
    el.body?.classList.remove("is-playing");
    hide(el.title, false);
    hide(el.over, true);
    hide(el.playBar, true);
    hide(el.hud, true);
    hide(el.hints, true);
    if (el.titleDate) el.titleDate.textContent = `今日の遺跡（${data.dateLabel}）`;
    if (el.titleRecord) {
      el.titleRecord.textContent =
        data.bestM == null || data.bestM <= 0 ? "記録はまだありません" : `最高記録 ${data.bestM}m`;
    }
    setCopyStatus(null);
    focusHeading(el.titleHeading);
  }

  function showPlay() {
    el.body?.classList.add("is-playing");
    hide(el.title, true);
    hide(el.over, true);
    hide(el.playBar, false);
    hide(el.hud, false);
    setCopyStatus(null);
  }

  /**
   * @param {{
   *   heightM: number,
   *   todayBestM: number,
   *   bestM: number,
   *   isNewBest?: boolean,
   *   isNewTodayBest?: boolean,
   * }} data
   */
  function showOver(data) {
    el.body?.classList.remove("is-playing");
    hide(el.title, true);
    hide(el.over, false);
    hide(el.playBar, true);
    hide(el.hud, true);
    hide(el.hints, true);
    const h = Math.max(0, Math.floor(Number(data.heightM) || 0));
    if (el.overHeight) el.overHeight.textContent = `${h}mまで登りました`;
    if (el.overToday) el.overToday.textContent = `今日の最高 ${data.todayBestM}m`;
    if (el.overBest) el.overBest.textContent = `これまでの最高 ${data.bestM}m`;
    hide(el.overNewBest, !data.isNewBest);
    hide(el.overNewToday, !data.isNewTodayBest);
    setShareStatus(null);
    applyShareAvailability();
    focusHeading(el.overHeading);
  }

  /**
   * @param {{ heightM: number, bestM?: number | null }} data
   */
  function updateHud(data) {
    const h = Math.max(0, Math.floor(Number(data.heightM) || 0));
    if (el.hudHeight) el.hudHeight.textContent = `${h}m`;
    if (el.hudBest) {
      const best = data.bestM;
      el.hudBest.textContent =
        best == null || !(best > 0 || h > 0) ? "" : `最高 ${Math.max(0, Math.floor(best))}m`;
    }
  }

  /** @param {number} hintJumpsLeft */
  function setHintsVisible(hintJumpsLeft) {
    hide(el.hints, !(hintJumpsLeft > 0));
  }

  /** @param {string | null} message */
  function setShareStatus(message) {
    if (!el.copyStatus) return;
    if (message == null || message === "") {
      el.copyStatus.hidden = true;
      el.copyStatus.textContent = "";
      return;
    }
    el.copyStatus.hidden = false;
    el.copyStatus.textContent = message;
  }

  /** @param {boolean | null} ok */
  function setCopyStatus(ok) {
    if (ok == null) setShareStatus(null);
    else setShareStatus(ok ? "コピーしました" : "コピーできませんでした");
  }

  /** navigator.share があるときだけ「結果を共有」。なければ「結果をコピー」。 */
  function applyShareAvailability(native = typeof navigator !== "undefined" && typeof navigator.share === "function") {
    hide(el.btnShare, !native);
    hide(el.btnCopy, !!native);
  }

  return {
    el,
    showTitle,
    showPlay,
    showOver,
    updateHud,
    setHintsVisible,
    setCopyStatus,
    setShareStatus,
    applyShareAvailability,
    applyControlMode,
    onControlModeChange,
  };
}
