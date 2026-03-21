import { container } from "./dom.js";
import { rerenderAll } from "./renderer.js";
import { state } from "./state.js";

const ZOOM_STEP = 0.25;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4.0;

const zoomInputEl = document.getElementById("zoom-input");

function formatZoom(scale) {
  return `${Math.round(scale * 100)}%`;
}

function parseZoom(str) {
  const n = parseFloat(str.replace("%", ""));
  return isNaN(n) ? null : n / 100;
}

export function updateZoomInput() {
  if (zoomInputEl) zoomInputEl.value = formatZoom(state.scale);
}

async function applyZoom(newScale) {
  const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, newScale));
  if (Math.abs(clamped - state.scale) < 0.001) return;

  // 現在のスクロール位置の比率を保存
  const ratio =
    container.scrollHeight > 0
      ? container.scrollTop / container.scrollHeight
      : 0;

  state.scale = clamped;
  updateZoomInput();
  await rerenderAll();

  // スクロール位置を比率で復元
  container.scrollTop = ratio * container.scrollHeight;
}

export const zoomIn = () => applyZoom(state.scale + ZOOM_STEP);
export const zoomOut = () => applyZoom(state.scale - ZOOM_STEP);

export async function fitWidth() {
  if (!state.pdfDoc) return;
  const page = await state.pdfDoc.getPage(1);
  const vp = page.getViewport({ scale: 1 });
  const containerWidth = container.clientWidth - 40; // padding
  await applyZoom(containerWidth / vp.width);
}

export async function fitPage() {
  if (!state.pdfDoc) return;
  const page = await state.pdfDoc.getPage(1);
  const vp = page.getViewport({ scale: 1 });
  const scaleW = (container.clientWidth - 40) / vp.width;
  const scaleH = container.clientHeight / vp.height;
  await applyZoom(Math.min(scaleW, scaleH));
}

export function initZoomControls() {
  document.getElementById("btn-zoom-in")?.addEventListener("click", zoomIn);
  document.getElementById("btn-zoom-out")?.addEventListener("click", zoomOut);
  document.getElementById("btn-fit-width")?.addEventListener("click", fitWidth);
  document.getElementById("btn-fit-page")?.addEventListener("click", fitPage);

  zoomInputEl?.addEventListener("change", () => {
    const val = parseZoom(zoomInputEl.value);
    if (val) applyZoom(val);
    else updateZoomInput();
  });

  zoomInputEl?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      zoomInputEl.blur();
    } else if (e.key === "Escape") {
      updateZoomInput();
      zoomInputEl.blur();
    }
    e.stopPropagation();
  });
}
