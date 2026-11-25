/** タイトル / HUD / 終了の DOM と文言。文面は DESIGN.md のまま。 */

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
    btnCopy: root.querySelector("#btn-copy"),
    btnQuit: root.querySelector("#btn-quit"),
    copyStatus: root.querySelector("#copy-status"),
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
    setCopyStatus(null);
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

  /** @param {boolean | null} ok */
  function setCopyStatus(ok) {
    if (!el.copyStatus) return;
    if (ok == null) {
      el.copyStatus.hidden = true;
      el.copyStatus.textContent = "";
      return;
    }
    el.copyStatus.hidden = false;
    el.copyStatus.textContent = ok ? "コピーしました" : "コピーできませんでした";
  }

  return {
    el,
    showTitle,
    showPlay,
    showOver,
    updateHud,
    setHintsVisible,
    setCopyStatus,
  };
}
