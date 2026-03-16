const VIEWER_URL = chrome.runtime.getURL('viewer/index.html');

function isPdfUrl(url) {
  try {
    if (url.startsWith(VIEWER_URL)) return false;
    if (url.startsWith('chrome://') || url.startsWith('chrome-extension://')) return false;
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    return path.endsWith('.pdf');
  } catch {
    return false;
  }
}

chrome.webNavigation.onBeforeNavigate.addListener(
  (details) => {
    if (details.frameId !== 0) return;
    if (!isPdfUrl(details.url)) return;

    chrome.tabs.update(details.tabId, {
      url: `${VIEWER_URL}?url=${encodeURIComponent(details.url)}`
    });
  },
  { url: [{ urlContains: '.pdf' }] }
);
