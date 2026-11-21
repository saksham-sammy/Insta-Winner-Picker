/**
 * Auto-Bridge Content Script
 * Injected automatically into http://localhost:3000 and http://127.0.0.1:3000
 * Automatically fetches the user's active Instagram session cookie from Brave/Chrome
 * and sends it to the local server, so the user NEVER has to manually copy or paste cookies.
 */
(function () {
  window.__INSTA_PICKER_EXTENSION_ACTIVE = true;

  function autoSyncSession() {
    try {
      if (!chrome || !chrome.runtime || !chrome.runtime.sendMessage) return;
      chrome.runtime.sendMessage({ type: 'GET_IG_SESSION' }, (response) => {
        if (chrome.runtime.lastError || !response || !response.sessionid) return;
        fetch('/api/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionid: response.sessionid }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data && data.ok) {
              window.dispatchEvent(
                new CustomEvent('AUTO_SESSION_SYNCED', { detail: { username: data.username } })
              );
            }
          })
          .catch(() => {});
      });
    } catch {}
  }

  // Run automatically on page load
  autoSyncSession();

  // Listen for trigger from Studio UI
  window.addEventListener('REQUEST_AUTO_SESSION', () => {
    autoSyncSession();
  });
})();
