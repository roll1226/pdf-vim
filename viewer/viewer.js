import { KEY_BUFFER_TIMEOUT_MS } from "./modules/constants.js";
import {
  container,
  filenameEl,
  loadingEl,
  totalPagesEl,
} from "./modules/dom.js";
import {
  enterLinkHintMode,
  enterTextHintMode,
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
  scrollToPage,
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
import {
  buildThumbnails,
  initSidebar,
  isSidebarOpen,
  toggleSidebar,
  updateActiveThumb,
} from "./modules/sidebar.js";
import { state } from "./modules/state.js";
import { showError, showStatus, updatePageIndicator } from "./modules/ui.js";
import {
  fitPage,
  fitWidth,
  initZoomControls,
  updateZoomInput,
  zoomIn,
  zoomOut,
} from "./modules/zoom.js";

// ── キーシーケンスバッファ ("gg" 用) ─────────────────────────────────────────
let keyBuffer = "";
let keyBufferTimer = null;

// ── 初期化 ────────────────────────────────────────────────────────────────────
initSearchInput();
initSidebar();
initZoomControls();

// ページ入力フィールド
const pageInputEl = document.getElementById("page-input");
pageInputEl?.addEventListener("change", () => {
  const n = parseInt(pageInputEl.value, 10);
  if (n >= 1 && n <= state.pdfDoc?.numPages) {
    scrollToPage(n);
  } else {
    updatePageIndicator();
  }
});
pageInputEl?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") pageInputEl.blur();
  else if (e.key === "Escape") {
    updatePageIndicator();
    pageInputEl.blur();
  }
  e.stopPropagation();
});

// 前後ページボタン
document.getElementById("btn-prev-page")?.addEventListener("click", scrollPrevPage);
document.getElementById("btn-next-page")?.addEventListener("click", scrollNextPage);

// 印刷・ダウンロード
document.getElementById("btn-print")?.addEventListener("click", () => window.print());
document.getElementById("btn-download")?.addEventListener("click", () => {
  const params = new URLSearchParams(window.location.search);
  const url = params.get("url");
  if (url) {
    const a = document.createElement("a");
    a.href = decodeURIComponent(url);
    a.download = decodeURIComponent(url).split("/").pop().split("?")[0];
    a.click();
  }
});

container.addEventListener(
  "scroll",
  () => {
    updatePageIndicator();
    if (isSidebarOpen()) {
      const mid = container.scrollTop + container.clientHeight / 2;
      const entries = state.pageEntries;
      for (let i = entries.length - 1; i >= 0; i--) {
        if (entries[i].wrapper.offsetTop <= mid) {
          updateActiveThumb(i + 1);
          break;
        }
      }
    }
  },
  { passive: true },
);

// ── キーボードハンドラ ────────────────────────────────────────────────────────
document.addEventListener(
  "keydown",
  (e) => {
    if (isSearchActive()) return;

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
        enterTextHintMode();
        break;
      case "F":
        e.preventDefault();
        enterLinkHintMode(false);
        break;
      case "+":
      case "=":
        e.preventDefault();
        zoomIn();
        break;
      case "-":
        e.preventDefault();
        zoomOut();
        break;
      case "W":
        e.preventDefault();
        fitWidth();
        break;
      case "P":
        e.preventDefault();
        fitPage();
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
      case "s":
        e.preventDefault();
        toggleSidebar();
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
  true,
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
  if (pageInputEl) pageInputEl.max = state.pdfDoc.numPages;

  updateZoomInput();
  await createPlaceholders();
  buildThumbnails();
  container.focus();
}

init();
