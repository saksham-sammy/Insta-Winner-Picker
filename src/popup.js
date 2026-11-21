/**
 * Extension Popup Controller
 * Finds the Instagram post/reel tab (active one first, else any open one) and hands it
 * to the Winner Studio, which does all the reading and shows live progress.
 */
(function () {
  const Parser = window.__InstaLuckyParser;

  const notPostView = document.getElementById('notPostView');
  const postView = document.getElementById('postView');
  const shortcodeBadge = document.getElementById('shortcodeBadge');
  const detectedLabel = document.getElementById('detectedLabel');
  const collectAndOpenBtn = document.getElementById('collectAndOpenBtn');
  const openStudioBtn = document.getElementById('openStudioBtn');
  const openStudioStandaloneBtn = document.getElementById('openStudioStandaloneBtn');

  let targetTabId = null;

  function isInstagramPost(tab) {
    return Boolean(
      tab &&
        tab.id &&
        tab.url &&
        /^https?:\/\/([\w-]+\.)?instagram\.com\//i.test(tab.url) &&
        Parser.extractShortcodeFromUrl(tab.url)
    );
  }

  function openStudio(auto) {
    chrome.runtime.sendMessage(
      { type: 'OPEN_STUDIO', tabId: targetTabId, auto },
      () => window.close()
    );
  }

  collectAndOpenBtn.addEventListener('click', () => {
    collectAndOpenBtn.disabled = true;
    openStudio(true);
  });
  openStudioBtn.addEventListener('click', () => openStudio(false));
  openStudioStandaloneBtn.addEventListener('click', () => openStudio(false));

  (async function init() {
    try {
      chrome.runtime.sendMessage({ type: 'SYNC_COOKIE' }, () => {});
    } catch {}
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    let target = isInstagramPost(active) ? active : null;

    if (!target) {
      const all = (await chrome.tabs.query({})).filter(isInstagramPost);
      all.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
      target = all[0] || null;
    }

    if (!target) {
      notPostView.classList.remove('hidden');
      postView.classList.add('hidden');
      return;
    }

    targetTabId = target.id;
    shortcodeBadge.textContent = `/p/${Parser.extractShortcodeFromUrl(target.url)}`;
    detectedLabel.textContent = target.active ? 'Current tab' : 'Open in another tab';
    postView.classList.remove('hidden');
    notPostView.classList.add('hidden');
  })();
})();
