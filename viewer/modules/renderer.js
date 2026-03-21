// pdfjsLib は lib/pdf.min.js により window グローバルとして提供される。
/* global pdfjsLib */

import { container, pagesEl } from "./dom.js";
import { state } from "./state.js";

// ── HTML エスケープ ───────────────────────────────────────────────────────────
export function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── プレースホルダー生成 + 遅延レンダリング ───────────────────────────────────
let lazyObserver = null;

export async function createPlaceholders() {
  const { pdfDoc, pageEntries } = state;
  const vp0 = (await pdfDoc.getPage(1)).getViewport({ scale: state.scale });

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const wrapper = document.createElement("div");
    wrapper.className = "page-wrapper page-placeholder";
    wrapper.dataset.pageNum = i;
    wrapper.style.width = `${Math.floor(vp0.width)}px`;
    wrapper.style.height = `${Math.floor(vp0.height)}px`;
    wrapper.textContent = `p. ${i}`;
    pagesEl.appendChild(wrapper);
    pageEntries.push({ pageNum: i, wrapper, canvas: null, rendered: false });
  }

  setupLazyRender();
}

function setupLazyRender() {
  if (lazyObserver) lazyObserver.disconnect();
  lazyObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const idx = parseInt(entry.target.dataset.pageNum, 10) - 1;
        if (!state.pageEntries[idx].rendered) renderPage(idx);
      });
    },
    { root: container, rootMargin: "400px" },
  );
  state.pageEntries.forEach((e) => lazyObserver.observe(e.wrapper));
}

// ── ズーム変更時の再レンダリング ──────────────────────────────────────────────
export async function rerenderAll() {
  const { pdfDoc, pageEntries } = state;
  if (!pdfDoc || pageEntries.length === 0) return;

  // 全ページをプレースホルダー状態にリセット
  const vp0 = (await pdfDoc.getPage(1)).getViewport({ scale: state.scale });
  for (const entry of pageEntries) {
    entry.rendered = false;
    entry.canvas = null;
    entry.textItems = null;
    entry.textLayer = null;
    entry.wrapper.innerHTML = `p. ${entry.pageNum}`;
    entry.wrapper.classList.add("page-placeholder");
    entry.wrapper.style.width = `${Math.floor(vp0.width)}px`;
    entry.wrapper.style.height = `${Math.floor(vp0.height)}px`;
  }

  if (state.currentSearchTerm) {
    state.currentSearchTerm = "";
  }

  setupLazyRender();
}

async function renderPage(idx) {
  const entry = state.pageEntries[idx];
  if (entry.rendered) return;
  entry.rendered = true; // 二重レンダリング防止のため先にフラグを立てる

  const page = await state.pdfDoc.getPage(entry.pageNum);
  const viewport = page.getViewport({ scale: state.scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  entry.canvas = canvas;

  entry.wrapper.textContent = "";
  entry.wrapper.classList.remove("page-placeholder");
  entry.wrapper.style.width = `${canvas.width}px`;
  entry.wrapper.style.height = `${canvas.height}px`;
  entry.wrapper.appendChild(canvas);

  await page.render({
    canvasContext: canvas.getContext("2d", { willReadFrequently: true }),
    viewport,
  }).promise;

  await buildTextLayer(entry, page, viewport);
}

// ── テキストレイヤー ─────────────────────────────────────────────────────────
async function buildTextLayer(entry, page, viewport) {
  const textContent = await page.getTextContent();

  const div = document.createElement("div");
  div.className = "textLayer";
  div.style.width = `${entry.canvas.width}px`;
  div.style.height = `${entry.canvas.height}px`;
  entry.wrapper.appendChild(div);
  entry.textLayer = div;
  entry.textItems = [];

  for (const item of textContent.items) {
    if (!item.str) continue;

    const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
    const [a, b, , , e, f] = tx;
    const fontSize = Math.sqrt(a * a + b * b);
    if (fontSize < 1) continue;

    const span = document.createElement("span");
    span.textContent = item.str;
    span.style.left = `${e}px`;
    span.style.top = `${f - fontSize}px`;
    span.style.fontSize = `${fontSize}px`;
    span.style.lineHeight = `${fontSize}px`;
    div.appendChild(span);
    entry.textItems.push({ span, str: item.str });
  }

  if (state.currentSearchTerm) applyHighlightsToEntry(entry);
}

// ── 検索ハイライト ────────────────────────────────────────────────────────────
export function applyHighlightsToEntry(entry) {
  if (!entry.textItems || !state.currentSearchTerm) return;
  const term = state.currentSearchTerm.toLowerCase();

  for (const item of entry.textItems) {
    const lower = item.str.toLowerCase();
    if (!lower.includes(term)) {
      item.span.textContent = item.str;
      continue;
    }

    let html = "";
    let last = 0;
    let idx;
    while ((idx = lower.indexOf(term, last)) !== -1) {
      html += escapeHtml(item.str.slice(last, idx));
      html += `<mark class="search-highlight">${escapeHtml(item.str.slice(idx, idx + term.length))}</mark>`;
      last = idx + term.length;
    }
    html += escapeHtml(item.str.slice(last));
    item.span.innerHTML = html;
  }
}

export function clearHighlights() {
  for (const entry of state.pageEntries) {
    if (!entry.textItems) continue;
    for (const item of entry.textItems) {
      item.span.textContent = item.str;
    }
  }
}
