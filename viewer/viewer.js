import { KEY_BUFFER_TIMEOUT_MS } from "./modules/constants.js";
import {
  container,
  filenameEl,
  loadingEl,
  totalPagesEl,
} from "./modules/dom.js";
import {
  enterHintMode,
  exitHintMode,
  handleHintKey,
  isHintActive,
} from "./modules/hint.js";
import {
  clearHighlights,
  createPlaceholders,
  escapeHtml,
} from "./modules/renderer.js";
import {
  scrollBottom,
  scrollDown,
  scrollHalfDown,
  scrollHalfUp,
  scrollLeft,
  scrollNextPage,
  scrollPrevPage,
  scrollRight,
  scrollTop,
  scrollUp,
} from "./modules/scroll.js";
import {
  clearSearch,
  enterSearchMode,
  exitSearchMode,
  initSearchInput,
  isSearchActive,
  searchNext,
  searchPrev,
} from "./modules/search.js";
import { state } from "./modules/state.js";
import { showError, showStatus, updatePageIndicator } from "./modules/ui.js";

// ── キーシーケンスバッファ ("gg" 用) ─────────────────────────────────────────
let keyBuffer = "";
let keyBufferTimer = null;

// ── 初期化 ────────────────────────────────────────────────────────────────────
initSearchInput();
container.addEventListener("scroll", updatePageIndicator, { passive: true });

// ── キーボードハンドラ ────────────────────────────────────────────────────────
document.addEventListener(
  "keydown",
  (e) => {
    if (isSearchActive()) return; // 検索入力は searchInput のリスナーが処理

    if (isHintActive()) {
      e.preventDefault();
      handleHintKey(e.key);
      return;
    }

    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

    const key = e.key;

    if (e.ctrlKey && key === "f") {
      e.preventDefault();
      scrollNextPage();
      return;
    }
    if (e.ctrlKey && key === "b") {
      e.preventDefault();
      scrollPrevPage();
      return;
    }

    // "gg" ダブルシーケンス
    if (key === "g") {
      if (keyBuffer === "g") {
        e.preventDefault();
        clearTimeout(keyBufferTimer);
        keyBuffer = "";
        scrollTop();
      } else {
        keyBuffer = "g";
        clearTimeout(keyBufferTimer);
        keyBufferTimer = setTimeout(
          () => (keyBuffer = ""),
          KEY_BUFFER_TIMEOUT_MS,
        );
      }
      return;
    }

    // g 以外のキーでバッファをリセット
    keyBuffer = "";
    clearTimeout(keyBufferTimer);

    switch (key) {
      case "j":
        e.preventDefault();
        scrollDown();
        break;
      case "k":
        e.preventDefault();
        scrollUp();
        break;
      case "d":
        e.preventDefault();
        scrollHalfDown();
        break;
      case "u":
        e.preventDefault();
        scrollHalfUp();
        break;
      case "h":
        e.preventDefault();
        scrollLeft();
        break;
      case "l":
        e.preventDefault();
        scrollRight();
        break;
      case "G":
        e.preventDefault();
        scrollBottom();
        break;
      case "f":
        e.preventDefault();
        enterHintMode(false);
        break;
      case "F":
        e.preventDefault();
        enterHintMode(true);
        break;
      case "/":
        e.preventDefault();
        enterSearchMode();
        break;
      case "n":
        e.preventDefault();
        searchNext();
        break;
      case "N":
        e.preventDefault();
        searchPrev();
        break;
      case "Escape":
        exitHintMode();
        if (isSearchActive()) {
          exitSearchMode();
        } else if (state.currentSearchTerm) {
          clearHighlights();
          state.currentSearchTerm = "";
          clearSearch();
          showStatus("");
        }
        break;
    }
  },
  true, // キャプチャフェーズで処理（PDF プラグインより優先）
);

// ── PDF 読み込み・初期化 ──────────────────────────────────────────────────────
async function init() {
  if (typeof pdfjsLib === "undefined") {
    showError(
      "PDF.js が見つかりません。<br>" +
        "プロジェクトルートで <code>./setup.sh</code> を実行してから" +
        "拡張機能を再読み込みしてください。",
    );
    return;
  }

  pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL(
    "lib/pdf.worker.min.js",
  );

  const params = new URLSearchParams(window.location.search);
  const url = params.get("url");

  if (!url) {
    showError("URL パラメータが指定されていません。");
    return;
  }

  const decoded = decodeURIComponent(url);
  filenameEl.textContent = decoded.split("/").pop().split("?")[0];

  try {
    state.pdfDoc = await pdfjsLib.getDocument({ url: decoded }).promise;
  } catch (e) {
    showError(`PDF の読み込みに失敗しました:<br>${escapeHtml(e.message)}`);
    return;
  }

  loadingEl.classList.add("hidden");
  totalPagesEl.textContent = state.pdfDoc.numPages;

  await createPlaceholders();
  container.focus();
}

init();
