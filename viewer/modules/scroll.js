import { SCROLL_STEP } from "./constants.js";
import { container } from "./dom.js";
import { state } from "./state.js";

const scrollBy = (x, y) =>
  container.scrollBy({ left: x, top: y, behavior: "auto" });
const scrollTo = (x, y) =>
  container.scrollTo({ left: x, top: y, behavior: "auto" });

export const scrollDown = () => scrollBy(0, SCROLL_STEP);
export const scrollUp = () => scrollBy(0, -SCROLL_STEP);
export const scrollHalfDown = () => scrollBy(0, container.clientHeight / 2);
export const scrollHalfUp = () => scrollBy(0, -container.clientHeight / 2);
export const scrollRight = () => scrollBy(SCROLL_STEP, 0);
export const scrollLeft = () => scrollBy(-SCROLL_STEP, 0);
export const scrollTop = () => scrollTo(0, 0);
export const scrollBottom = () => scrollTo(0, container.scrollHeight);
export const scrollPageDown = () => scrollBy(0, container.clientHeight);
export const scrollPageUp = () => scrollBy(0, -container.clientHeight);

export function scrollToPage(pageNum) {
  state.pageEntries[pageNum - 1]?.wrapper.scrollIntoView({ block: "start" });
}

function currentPageIndex() {
  const { pageEntries } = state;
  const mid = container.scrollTop + container.clientHeight / 2;
  for (let i = pageEntries.length - 1; i >= 0; i--) {
    if (pageEntries[i].wrapper.offsetTop <= mid) return i;
  }
  return 0;
}

export function scrollNextPage() {
  const next = currentPageIndex() + 1;
  if (next < state.pageEntries.length) scrollToPage(next + 1);
}

export function scrollPrevPage() {
  const prev = currentPageIndex() - 1;
  scrollToPage(Math.max(prev + 1, 1));
}
