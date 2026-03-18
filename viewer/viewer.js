// ── PDF.js setup ─────────────────────────────────────────────────────────────
if (typeof pdfjsLib === "undefined") {
  document.getElementById("loading").classList.add("hidden");
  const errEl = document.getElementById("error");
  errEl.innerHTML =
    "PDF.js が見つかりません。<br>" +
    "プロジェクトルートで <code>./setup.sh</code> を実行してから" +
    "拡張機能を再読み込みしてください。";
  errEl.classList.remove("hidden");
  throw new Error("pdf.js not loaded");
}

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL(
  "lib/pdf.worker.min.js",
);

// ── DOM refs ──────────────────────────────────────────────────────────────────
const container = document.getElementById("viewer-container");
const pagesEl = document.getElementById("pages-container");
const loadingEl = document.getElementById("loading");
const errorEl = document.getElementById("error");
const hintOverlay = document.getElementById("hint-overlay");
const searchBar = document.getElementById("search-bar");
const searchInput = document.getElementById("search-input");
const searchResEl = document.getElementById("search-results");
const statusBar = document.getElementById("status-bar");
const currentPageEl = document.getElementById("current-page");
const totalPagesEl = document.getElementById("total-pages");
const filenameEl = document.getElementById("filename");

// ── State ─────────────────────────────────────────────────────────────────────
let pdfDoc = null;
const pageEntries = []; // { pageNum, wrapper, canvas, rendered }

const SCALE = 1.5;
const SCROLL_STEP = 80;

// key sequence buffer (for "gg")
let keyBuffer = "";
let keyBufferTimer = null;

// hint mode
let hintActive = false;
let hintLinks = []; // { label, x, y, link, el }
let hintTyped = "";

// search mode
let searchActive = false;
let searchPages = []; // page numbers with matches (1-based)
let searchIdx = 0;
let currentSearchTerm = "";

// ── Load PDF from ?url=... ────────────────────────────────────────────────────
async function init() {
  const params = new URLSearchParams(window.location.search);
  const url = params.get("url");

  if (!url) {
    showError("URL パラメータが指定されていません。");
    return;
  }

  const decoded = decodeURIComponent(url);
  filenameEl.textContent = decoded.split("/").pop().split("?")[0];

  try {
    pdfDoc = await pdfjsLib.getDocument({ url: decoded }).promise;
  } catch (e) {
    showError(`PDF の読み込みに失敗しました:<br>${e.message}`);
    return;
  }

  loadingEl.classList.add("hidden");
  totalPagesEl.textContent = pdfDoc.numPages;

  await createPlaceholders();
  container.focus();
}

// ── Create placeholder divs for all pages, lazy-render via IntersectionObserver
async function createPlaceholders() {
  // Get viewport of page 1 to estimate page size
  const firstPage = await pdfDoc.getPage(1);
  const vp0 = firstPage.getViewport({ scale: SCALE });

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
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const idx = parseInt(entry.target.dataset.pageNum) - 1;
        if (!pageEntries[idx].rendered) {
          renderPage(idx);
        }
      });
    },
    { root: container, rootMargin: "400px" },
  );

  pageEntries.forEach((e) => observer.observe(e.wrapper));
}

async function renderPage(idx) {
  const entry = pageEntries[idx];
  if (entry.rendered) return;
  entry.rendered = true; // mark early to avoid double-render

  const page = await pdfDoc.getPage(entry.pageNum);
  const viewport = page.getViewport({ scale: SCALE });

  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  entry.wrapper.textContent = "";
  entry.wrapper.classList.remove("page-placeholder");
  entry.wrapper.style.width = `${canvas.width}px`;
  entry.wrapper.style.height = `${canvas.height}px`;
  entry.wrapper.appendChild(canvas);
  entry.canvas = canvas;

  await page.render({ canvasContext: canvas.getContext("2d", { willReadFrequently: true }), viewport })
    .promise;

  await buildTextLayer(entry, page, viewport);
}

// ── Text layer & search highlighting ──────────────────────────────────────────
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

  if (currentSearchTerm) {
    applyHighlightsToEntry(entry);
  }
}

function applyHighlightsToEntry(entry) {
  if (!entry.textItems || !currentSearchTerm) return;
  const term = currentSearchTerm.toLowerCase();

  for (const item of entry.textItems) {
    const lowerStr = item.str.toLowerCase();
    if (!lowerStr.includes(term)) {
      item.span.textContent = item.str;
      continue;
    }

    let html = "";
    let lastIdx = 0;
    let idx;
    const text = item.str;

    while ((idx = lowerStr.indexOf(term, lastIdx)) !== -1) {
      html += escapeHtml(text.slice(lastIdx, idx));
      html += `<mark class="search-highlight">${escapeHtml(text.slice(idx, idx + term.length))}</mark>`;
      lastIdx = idx + term.length;
    }
    html += escapeHtml(text.slice(lastIdx));
    item.span.innerHTML = html;
  }
}

function clearHighlights() {
  for (const entry of pageEntries) {
    if (!entry.textItems) continue;
    for (const item of entry.textItems) {
      item.span.textContent = item.str;
    }
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ── Scroll utilities ──────────────────────────────────────────────────────────
const scrollBy = (x, y) =>
  container.scrollBy({ left: x, top: y, behavior: "auto" });
const scrollTo = (x, y) =>
  container.scrollTo({ left: x, top: y, behavior: "auto" });

const scrollDown = () => scrollBy(0, SCROLL_STEP);
const scrollUp = () => scrollBy(0, -SCROLL_STEP);
const scrollHalfDown = () => scrollBy(0, container.clientHeight / 2);
const scrollHalfUp = () => scrollBy(0, -container.clientHeight / 2);
const scrollRight = () => scrollBy(SCROLL_STEP, 0);
const scrollLeft = () => scrollBy(-SCROLL_STEP, 0);
const scrollTop = () => scrollTo(0, 0);
const scrollBottom = () => scrollTo(0, container.scrollHeight);
const scrollPageDown = () => scrollBy(0, container.clientHeight);
const scrollPageUp = () => scrollBy(0, -container.clientHeight);

// ── Current page indicator ────────────────────────────────────────────────────
container.addEventListener("scroll", updatePageIndicator, { passive: true });

function updatePageIndicator() {
  if (!pageEntries.length) return;
  const mid = container.scrollTop + container.clientHeight / 2;
  for (let i = pageEntries.length - 1; i >= 0; i--) {
    if (pageEntries[i].wrapper.offsetTop <= mid) {
      currentPageEl.textContent = i + 1;
      return;
    }
  }
  currentPageEl.textContent = 1;
}

function scrollToPage(pageNum) {
  const entry = pageEntries[pageNum - 1];
  if (entry) entry.wrapper.scrollIntoView({ block: "start" });
}

// ── Hint mode (f / F) ─────────────────────────────────────────────────────────
const HINT_CHARS = "asdfghjklqwertyuiopzxcvbnm";

function generateLabels(count) {
  const labels = [];
  for (let i = 0; i < count; i++) {
    if (i < HINT_CHARS.length) {
      labels.push(HINT_CHARS[i]);
    } else {
      const outer = Math.floor(i / HINT_CHARS.length) - 1;
      const inner = i % HINT_CHARS.length;
      labels.push(HINT_CHARS[outer] + HINT_CHARS[inner]);
    }
  }
  return labels;
}

async function enterHintMode(openInNewTab) {
  hintActive = true;
  hintLinks = [];
  hintTyped = "";
  hintOverlay.innerHTML = "";
  hintOverlay.classList.add("active");

  const contRect = container.getBoundingClientRect();

  for (const entry of pageEntries) {
    const pageRect = entry.wrapper.getBoundingClientRect();

    // Skip pages not in viewport
    if (pageRect.bottom < contRect.top || pageRect.top > contRect.bottom)
      continue;

    const page = await pdfDoc.getPage(entry.pageNum);
    const viewport = page.getViewport({ scale: SCALE });
    const annotations = await page.getAnnotations();

    for (const ann of annotations) {
      if (ann.subtype !== "Link") continue;
      if (!ann.url && !ann.dest) continue;
      if (!ann.rect) continue;

      // Convert PDF rect → screen rect
      const [rx1, ry1, rx2, ry2] = viewport.convertToViewportRectangle(
        ann.rect,
      );
      const screenX = pageRect.left + Math.min(rx1, rx2);
      const screenY = pageRect.top + Math.min(ry1, ry2);

      // Only show hints for visible links
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

function createHintEl(hint) {
  const el = document.createElement("div");
  el.className = "hint-label";
  el.textContent = hint.label.toUpperCase();
  el.style.left = `${hint.x}px`;
  el.style.top = `${hint.y}px`;
  hintOverlay.appendChild(el);
  return el;
}

function handleHintKey(key) {
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

  // Update visual: dim non-matching, highlight typed portion
  hintLinks.forEach((h) => {
    if (!h.el) return;
    const match = h.label.startsWith(hintTyped);
    h.el.classList.toggle("dim", !match);
    if (match) {
      h.el.innerHTML =
        `<span class="typed">${hintTyped.toUpperCase()}</span>` +
        h.label.slice(hintTyped.length).toUpperCase();
    }
  });

  // Exact match → follow
  if (matching.length === 1 && matching[0].label === hintTyped) {
    followLink(matching[0]);
    exitHintMode();
  }
}

async function followLink(hint) {
  const { ann, openInNewTab } = hint;

  if (ann.url) {
    openInNewTab
      ? window.open(ann.url, "_blank")
      : (window.location.href = ann.url);
    return;
  }

  if (ann.dest) {
    try {
      const dest = await pdfDoc.getDestination(ann.dest);
      if (dest && dest[0]) {
        const pageIdx = await pdfDoc.getPageIndex(dest[0]);
        scrollToPage(pageIdx + 1);
      }
    } catch {
      /* ignore */
    }
  }
}

function exitHintMode() {
  hintActive = false;
  hintTyped = "";
  hintLinks = [];
  hintOverlay.innerHTML = "";
  hintOverlay.classList.remove("active");
  showStatus("");
}

// ── Search mode (/) ───────────────────────────────────────────────────────────
function enterSearchMode() {
  searchActive = true;
  searchBar.classList.remove("hidden");
  searchInput.value = "";
  searchResEl.textContent = "";
  searchInput.focus();
  showStatus("SEARCH");
}

function exitSearchMode() {
  searchActive = false;
  searchBar.classList.add("hidden");
  container.focus();
  // ステータスはクリアしない（検索結果を表示し続ける）
}

async function performSearch(text) {
  if (!text || !pdfDoc) return;

  clearHighlights();
  currentSearchTerm = text;
  searchPages = [];
  let totalMatches = 0;
  const term = text.toLowerCase();

  showStatus("検索中...");

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((it) => it.str).join("").toLowerCase();

    let count = 0;
    let pos = 0;
    while ((pos = pageText.indexOf(term, pos)) !== -1) {
      count++;
      pos += term.length;
    }

    if (count > 0) {
      searchPages.push(i);
      totalMatches += count;
    }
  }

  // Apply highlights to already-rendered pages
  for (const entry of pageEntries) {
    if (entry.rendered && entry.textItems) {
      applyHighlightsToEntry(entry);
    }
  }

  if (totalMatches === 0) {
    currentSearchTerm = "";
    showStatus(`「${text}」は見つかりませんでした`);
    return;
  }

  searchIdx = 0;
  scrollToPage(searchPages[0]);
  showStatus(`「${text}」: ${totalMatches}件ヒット (n/N で移動)`);
}

function updateSearchStatus() {
  showStatus(`「${currentSearchTerm}」: ${searchIdx + 1} / ${searchPages.length} ページ (n/N で移動)`);
}

function searchNext() {
  if (!searchPages.length) return;
  searchIdx = (searchIdx + 1) % searchPages.length;
  scrollToPage(searchPages[searchIdx]);
  updateSearchStatus();
}

function searchPrev() {
  if (!searchPages.length) return;
  searchIdx = (searchIdx - 1 + searchPages.length) % searchPages.length;
  scrollToPage(searchPages[searchIdx]);
  updateSearchStatus();
}

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

// ── Status bar helpers ────────────────────────────────────────────────────────
let statusTimer = null;

function showStatus(msg, clearAfterMs = 0) {
  statusBar.textContent = msg;
  clearTimeout(statusTimer);
  if (clearAfterMs > 0) {
    statusTimer = setTimeout(() => {
      statusBar.textContent = "";
    }, clearAfterMs);
  }
}

function showError(html) {
  loadingEl.classList.add("hidden");
  errorEl.innerHTML = html;
  errorEl.classList.remove("hidden");
}

// ── Keyboard handling ─────────────────────────────────────────────────────────
document.addEventListener(
  "keydown",
  (e) => {
    // Search input: handled by searchInput's own listener
    if (searchActive) return;

    // Hint mode: consume all keys
    if (hintActive) {
      e.preventDefault();
      handleHintKey(e.key);
      return;
    }

    // Don't steal keys from other inputs
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

    const key = e.key;

    // ── Ctrl+f / Ctrl+b: page scroll ──
    if (e.ctrlKey && key === "f") {
      e.preventDefault();
      scrollPageDown();
      return;
    }
    if (e.ctrlKey && key === "b") {
      e.preventDefault();
      scrollPageUp();
      return;
    }

    // ── "gg" double-g sequence ──
    if (key === "g") {
      if (keyBuffer === "g") {
        e.preventDefault();
        clearTimeout(keyBufferTimer);
        keyBuffer = "";
        scrollTop();
      } else {
        keyBuffer = "g";
        clearTimeout(keyBufferTimer);
        keyBufferTimer = setTimeout(() => {
          keyBuffer = "";
        }, 1000);
      }
      return;
    }

    // Any non-g key clears the buffer
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
        if (searchActive) {
          exitSearchMode();
        } else if (currentSearchTerm) {
          clearHighlights();
          currentSearchTerm = "";
          searchPages = [];
          showStatus("");
        }
        break;
    }
  },
  true,
); // capture phase: intercept before PDF plugin

// ── Start ─────────────────────────────────────────────────────────────────────
init();
