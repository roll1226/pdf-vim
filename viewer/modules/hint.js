import { HINT_CHARS, SCALE } from "./constants.js";
import { container, hintOverlay } from "./dom.js";
import { scrollToPage } from "./scroll.js";
import { state } from "./state.js";
import { showStatus } from "./ui.js";

// ── モジュールローカルなヒントステート ────────────────────────────────────────
let hintActive = false;
let hintLinks = []; // { label, x, y, ann, openInNewTab, el }
let hintTyped = "";

export const isHintActive = () => hintActive;

// ── ラベル生成 ────────────────────────────────────────────────────────────────
function generateLabels(count) {
  return Array.from({ length: count }, (_, i) => {
    if (i < HINT_CHARS.length) return HINT_CHARS[i];
    const outer = Math.floor(i / HINT_CHARS.length) - 1;
    const inner = i % HINT_CHARS.length;
    return HINT_CHARS[outer] + HINT_CHARS[inner];
  });
}

// ── モード開始 / 終了 ─────────────────────────────────────────────────────────
export async function enterHintMode(openInNewTab) {
  hintActive = true;
  hintLinks = [];
  hintTyped = "";
  hintOverlay.innerHTML = "";
  hintOverlay.classList.add("active");

  const contRect = container.getBoundingClientRect();

  for (const entry of state.pageEntries) {
    const pageRect = entry.wrapper.getBoundingClientRect();
    if (pageRect.bottom < contRect.top || pageRect.top > contRect.bottom)
      continue;

    const page = await state.pdfDoc.getPage(entry.pageNum);
    const viewport = page.getViewport({ scale: SCALE });
    const annotations = await page.getAnnotations();

    for (const ann of annotations) {
      if (ann.subtype !== "Link" || !ann.rect) continue;
      if (!ann.url && !ann.dest) continue;

      const [rx1, ry1, rx2, ry2] = viewport.convertToViewportRectangle(
        ann.rect,
      );
      const screenX = pageRect.left + Math.min(rx1, rx2);
      const screenY = pageRect.top + Math.min(ry1, ry2);

      if (screenY > contRect.bottom || screenY < contRect.top) continue;
      if (screenX > contRect.right || screenX < contRect.left) continue;

      hintLinks.push({
        label: "",
        x: screenX,
        y: screenY,
        ann,
        openInNewTab,
        el: null,
      });
    }
  }

  if (hintLinks.length === 0) {
    exitHintMode();
    showStatus("リンクが見つかりません", 2000);
    return;
  }

  const labels = generateLabels(hintLinks.length);
  hintLinks.forEach((h, i) => {
    h.label = labels[i];
    h.el = createHintEl(h);
  });

  showStatus(`HINT  ${hintLinks.length} links -- ラベルを入力`);
}

export function exitHintMode() {
  hintActive = false;
  hintTyped = "";
  hintLinks = [];
  hintOverlay.innerHTML = "";
  hintOverlay.classList.remove("active");
  showStatus("");
}

// ── キー処理 ──────────────────────────────────────────────────────────────────
export function handleHintKey(key) {
  if (key === "Escape") {
    exitHintMode();
    return;
  }
  if (key.length !== 1 || !/[a-zA-Z]/.test(key)) return;

  hintTyped += key.toLowerCase();
  const matching = hintLinks.filter((h) => h.label.startsWith(hintTyped));

  if (matching.length === 0) {
    exitHintMode();
    return;
  }

  hintLinks.forEach((h) => {
    if (!h.el) return;
    const isMatch = h.label.startsWith(hintTyped);
    h.el.classList.toggle("dim", !isMatch);
    if (isMatch) {
      h.el.innerHTML =
        `<span class="typed">${hintTyped.toUpperCase()}</span>` +
        h.label.slice(hintTyped.length).toUpperCase();
    }
  });

  if (matching.length === 1 && matching[0].label === hintTyped) {
    followLink(matching[0]);
    exitHintMode();
  }
}

// ── DOM ヘルパー ──────────────────────────────────────────────────────────────
function createHintEl({ label, x, y }) {
  const el = document.createElement("div");
  el.className = "hint-label";
  el.textContent = label.toUpperCase();
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  hintOverlay.appendChild(el);
  return el;
}

// ── リンク遷移 ────────────────────────────────────────────────────────────────
const SAFE_URL_RE = /^https?:\/\//i;

async function followLink({ ann, openInNewTab }) {
  if (ann.url) {
    if (!SAFE_URL_RE.test(ann.url)) return; // javascript: 等の危険スキームをブロック
    openInNewTab
      ? window.open(ann.url, "_blank")
      : (window.location.href = ann.url);
    return;
  }

  if (ann.dest) {
    try {
      const dest = await state.pdfDoc.getDestination(ann.dest);
      if (dest?.[0]) {
        const pageIdx = await state.pdfDoc.getPageIndex(dest[0]);
        scrollToPage(pageIdx + 1);
      }
    } catch {
      /* ignore */
    }
  }
}
