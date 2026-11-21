/**
 * Manifest V3 Background Service Worker
 * - Opens/focuses the Winner Studio tab
 * - Auto-detects Instagram sessionid and syncs to local server so users never have to paste cookies
 */
async function syncSessionCookieToServer() {
  try {
    if (!chrome.cookies) return;
    const cookie = await chrome.cookies.get({ url: 'https://www.instagram.com', name: 'sessionid' });
    if (cookie && cookie.value) {
      await fetch('http://127.0.0.1:3000/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionid: cookie.value }),
      });
    }
  } catch {
    /* server not running or network error */
  }
}

// Auto-sync on startup and when visiting instagram.com
syncSessionCookieToServer();
if (chrome.tabs && chrome.tabs.onUpdated) {
  chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (tab && tab.url && tab.url.includes('instagram.com') && changeInfo.status === 'complete') {
      syncSessionCookieToServer();
    }
  });
}

async function openStudio({ tabId = null, auto = false } = {}) {
  syncSessionCookieToServer();
  const base = chrome.runtime.getURL('src/studio.html');
  const target = tabId ? `${base}?tab=${tabId}${auto ? '&auto=1' : ''}` : base;

  const existing = await chrome.tabs.query({ url: `${base}*` });
  if (existing && existing.length > 0) {
    const tab = existing[0];
    await chrome.tabs.update(tab.id, { url: target, active: true });
    if (tab.windowId) await chrome.windows.update(tab.windowId, { focused: true });
    return tab.id;
  }
  const created = await chrome.tabs.create({ url: target });
  return created ? created.id : null;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === 'GET_IG_SESSION') {
    chrome.cookies.get({ url: 'https://www.instagram.com', name: 'sessionid' }, (cookie) => {
      if (cookie && cookie.value) {
        sendResponse({ ok: true, sessionid: cookie.value });
      } else {
        sendResponse({ ok: false, error: 'No active Instagram session found in this browser' });
      }
    });
    return true;
  }
  if (message && message.type === 'SYNC_COOKIE') {
    syncSessionCookieToServer()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (message && message.type === 'OPEN_STUDIO') {
    openStudio({ tabId: message.tabId || null, auto: Boolean(message.auto) })
      .then((id) => sendResponse({ ok: true, id }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  return false;
});
