import {
  container,
  currentPageEl,
  errorEl,
  loadingEl,
  statusBar,
} from "./dom.js";
import { state } from "./state.js";

let statusTimer = null;

export function showStatus(msg, clearAfterMs = 0) {
  statusBar.textContent = msg;
  clearTimeout(statusTimer);
  if (clearAfterMs > 0) {
    statusTimer = setTimeout(() => (statusBar.textContent = ""), clearAfterMs);
  }
}

export function showError(html) {
  loadingEl.classList.add("hidden");
  errorEl.innerHTML = html;
  errorEl.classList.remove("hidden");
}

export function updatePageIndicator() {
  const { pageEntries } = state;
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
