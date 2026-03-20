import { container, searchBar, searchInput, searchResEl } from "./dom.js";
import { applyHighlightsToEntry, clearHighlights } from "./renderer.js";
import { scrollToPage } from "./scroll.js";
import { state } from "./state.js";
import { showStatus } from "./ui.js";

// ── モジュールローカルな検索ステート ──────────────────────────────────────────
let searchActive = false;
let searchPages = []; // マッチしたページ番号 (1-based)
let searchIdx = 0;

export const isSearchActive = () => searchActive;

// ── モード開始 / 終了 ─────────────────────────────────────────────────────────
export function enterSearchMode() {
  searchActive = true;
  searchBar.classList.remove("hidden");
  searchInput.value = "";
  searchResEl.textContent = "";
  searchInput.focus();
  showStatus("SEARCH");
}

export function exitSearchMode() {
  searchActive = false;
  searchBar.classList.add("hidden");
  container.focus();
  // 検索結果をステータスバーに表示し続けるためここではクリアしない
}

export function clearSearch() {
  searchPages = [];
  searchIdx = 0;
}

// ── 検索実行 ──────────────────────────────────────────────────────────────────
export async function performSearch(text) {
  if (!text || !state.pdfDoc) return;

  clearHighlights();
  state.currentSearchTerm = text;
  searchPages = [];
  let totalMatches = 0;
  const term = text.toLowerCase();

  showStatus("検索中...");

  for (let i = 1; i <= state.pdfDoc.numPages; i++) {
    const page = await state.pdfDoc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((it) => it.str)
      .join("")
      .toLowerCase();

    const count = pageText.split(term).length - 1;
    if (count > 0) {
      searchPages.push(i);
      totalMatches += count;
    }
  }

  for (const entry of state.pageEntries) {
    if (entry.rendered && entry.textItems) applyHighlightsToEntry(entry);
  }

  if (totalMatches === 0) {
    state.currentSearchTerm = "";
    showStatus(`「${text}」は見つかりませんでした`);
    return;
  }

  searchIdx = 0;
  scrollToPage(searchPages[0]);
  showStatus(`「${text}」: ${totalMatches}件ヒット (n/N で移動)`);
}

// ── ページ間ナビゲーション ────────────────────────────────────────────────────
export function searchNext() {
  if (!searchPages.length) return;
  searchIdx = (searchIdx + 1) % searchPages.length;
  scrollToPage(searchPages[searchIdx]);
  showSearchPosition();
}

export function searchPrev() {
  if (!searchPages.length) return;
  searchIdx = (searchIdx - 1 + searchPages.length) % searchPages.length;
  scrollToPage(searchPages[searchIdx]);
  showSearchPosition();
}

function showSearchPosition() {
  showStatus(
    `「${state.currentSearchTerm}」: ${searchIdx + 1} / ${searchPages.length} ページ (n/N で移動)`,
  );
}

// ── 入力イベント登録 ──────────────────────────────────────────────────────────
export function initSearchInput() {
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const text = searchInput.value.trim();
      if (text) performSearch(text);
      exitSearchMode();
    } else if (e.key === "Escape") {
      exitSearchMode();
    }
  });
}
