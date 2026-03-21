import { SCALE } from "./constants.js";
import { state } from "./state.js";
import { scrollToPage } from "./scroll.js";

const THUMB_SCALE = 0.15;

const sidebarEl = document.getElementById("sidebar");
const thumbnailContainerEl = document.getElementById("thumbnail-container");
const sidebarToggleEl = document.getElementById("sidebar-toggle");

let sidebarOpen = false;
let thumbItems = []; // { pageNum, item, canvas, rendered }
let thumbObserver = null;

export const isSidebarOpen = () => sidebarOpen;

export function initSidebar() {
  sidebarToggleEl.addEventListener("click", toggleSidebar);
  // サイドバーをデフォルトで表示（サムネイルはPDF読み込み後にbuildThumbnailsで構築）
  sidebarOpen = true;
  document.body.classList.add("sidebar-open");
}

export function toggleSidebar() {
  sidebarOpen ? closeSidebar() : openSidebar();
}

function openSidebar() {
  sidebarOpen = true;
  sidebarEl.classList.remove("sidebar-hidden");
  document.body.classList.add("sidebar-open");
  if (thumbItems.length > 0) setupThumbObserver();
}

function closeSidebar() {
  sidebarOpen = false;
  sidebarEl.classList.add("sidebar-hidden");
  document.body.classList.remove("sidebar-open");
  if (thumbObserver) {
    thumbObserver.disconnect();
    thumbObserver = null;
  }
}

export function buildThumbnails() {
  if (!state.pdfDoc) return;
  thumbnailContainerEl.innerHTML = "";
  thumbItems = [];

  for (let i = 1; i <= state.pdfDoc.numPages; i++) {
    const item = document.createElement("div");
    item.className = "thumb-item";
    item.dataset.page = i;

    const canvas = document.createElement("canvas");
    // Placeholder dimensions until rendered
    canvas.width = 152;
    canvas.height = 197;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#e8e8e8";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const label = document.createElement("span");
    label.className = "thumb-label";
    label.textContent = String(i);

    item.appendChild(canvas);
    item.appendChild(label);
    item.addEventListener("click", () => {
      scrollToPage(i);
      updateActiveThumb(i);
    });

    thumbnailContainerEl.appendChild(item);
    thumbItems.push({ pageNum: i, item, canvas, rendered: false });
  }

  setupThumbObserver();
}

function setupThumbObserver() {
  if (thumbObserver || thumbItems.length === 0) return;
  thumbObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const pageNum = parseInt(entry.target.dataset.page, 10);
        const idx = pageNum - 1;
        if (!thumbItems[idx]?.rendered) renderThumb(idx);
      });
    },
    { root: thumbnailContainerEl, rootMargin: "300px" },
  );
  thumbItems.forEach((t) => thumbObserver.observe(t.item));
}

async function renderThumb(idx) {
  const thumb = thumbItems[idx];
  if (!thumb || thumb.rendered) return;
  thumb.rendered = true;

  try {
    const page = await state.pdfDoc.getPage(thumb.pageNum);
    const viewport = page.getViewport({ scale: THUMB_SCALE * SCALE });
    thumb.canvas.width = Math.floor(viewport.width);
    thumb.canvas.height = Math.floor(viewport.height);
    const ctx = thumb.canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;
  } catch {
    // ignore render errors
  }
}

export function updateActiveThumb(pageNum) {
  for (const t of thumbItems) {
    t.item.classList.toggle("active", t.pageNum === pageNum);
  }
}
