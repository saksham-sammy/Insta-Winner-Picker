/**
 * Tab Bridge — runs small, self-contained functions INSIDE the open Instagram tab
 * via chrome.scripting.executeScript and returns their results directly to the Studio.
 *
 * No content-script messaging, no background relay: every call either returns data or
 * throws a readable error that the Studio shows on screen.
 *
 * NOTE: the *InPage functions are serialized and executed in the Instagram tab, so they
 * must stay fully self-contained (no references to outer variables).
 */
(function (root) {
  /* ---------- Functions executed INSIDE the Instagram tab ---------- */

  function probeInPage(shortcode) {
    const out = {
      href: location.href,
      origin: location.origin,
      csrf: '',
      claim: '0',
      appId: '',
      mediaId: null,
      owner: null,
      loggedInHint: false,
    };
    try {
      const cookie = document.cookie || '';
      const m = cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
      out.csrf = m ? decodeURIComponent(m[1]) : '';
      out.loggedInHint = /(?:^|;\s*)ds_user_id=/.test(cookie);
    } catch (e) { /* ignore */ }
    try {
      out.claim = window.sessionStorage.getItem('www-claim-v2') || '0';
    } catch (e) { /* ignore */ }
    try {
      const meta = document.querySelector('meta[property="al:ios:url"]');
      const mm = meta && meta.content ? meta.content.match(/media\?id=(\d+)/) : null;
      if (mm) out.mediaId = mm[1];
    } catch (e) { /* ignore */ }
    try {
      const scripts = document.querySelectorAll('script');
      for (const s of scripts) {
        const t = s.textContent;
        if (!t || t.length < 20) continue;
        if (!out.appId) {
          const a = t.match(/"X-IG-App-ID"\s*:\s*"(\d{10,20})"/) || t.match(/"appId"\s*:\s*"?(\d{10,20})"?/);
          if (a) out.appId = a[1];
        }
        if (out.appId) break;
      }
    } catch (e) { /* ignore */ }
    try {
      const root = document.querySelector('[role="dialog"]') || document.querySelector('main') || document;
      const link = root.querySelector('header a[href^="/"]');
      const hm = link ? (link.getAttribute('href') || '').match(/^\/([a-zA-Z0-9._]{1,30})\/?$/) : null;
      if (hm) out.owner = hm[1];
    } catch (e) { /* ignore */ }
    return out;
  }

  async function fetchJsonInPage(url, headers) {
    try {
      const resp = await fetch(url, { method: 'GET', credentials: 'include', headers });
      const text = await resp.text();
      let json = null;
      try {
        json = JSON.parse(text.replace(/^for\s*\(\s*;\s*;\s*\)\s*;/, '').trim());
      } catch (e) { /* not JSON */ }
      return {
        status: resp.status,
        ok: resp.ok,
        json,
        snippet: json ? null : text.slice(0, 200),
      };
    } catch (e) {
      return { status: 0, ok: false, json: null, error: String(e && e.message ? e.message : e) };
    }
  }

  async function domCollectInPage(opts) {
    const durationMs = (opts && opts.durationMs) || 9000;
    const fetchReplies = Boolean(opts && opts.fetchReplies);
    const ownerHint = String((opts && opts.ownerHint) || '').toLowerCase();

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const hash = (str) => {
      let h = 2166136261;
      for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return (h >>> 0).toString(36);
    };

    const found = new Map();

    const findRoot = () =>
      document.querySelector('[role="dialog"] article') ||
      document.querySelector('[role="dialog"]') ||
      document.querySelector('main article') ||
      document.querySelector('main') ||
      document.body;

    const findPane = (root) => {
      let best = null;
      let bestScore = 0;
      for (const el of root.querySelectorAll('ul, div, section')) {
        const oy = getComputedStyle(el).overflowY;
        if (oy !== 'auto' && oy !== 'scroll' && oy !== 'overlay') continue;
        if (el.clientHeight < 100) continue;
        const range = el.scrollHeight - el.clientHeight;
        const score = range + el.querySelectorAll('time').length * 250;
        if (score > bestScore && (range > 8 || el.querySelectorAll('time').length >= 2)) {
          bestScore = score;
          best = el;
        }
      }
      return best;
    };

    const clickMore = (root) => {
      let clicked = 0;
      for (const btn of root.querySelectorAll('button, [role="button"]')) {
        if (!(btn instanceof HTMLElement) || btn.offsetParent === null) continue;
        const aria = (btn.getAttribute('aria-label') || (btn.querySelector('svg') && btn.querySelector('svg').getAttribute('aria-label')) || '').toLowerCase();
        const text = (btn.innerText || '').trim().toLowerCase();
        const more =
          aria.includes('load more comments') ||
          text.startsWith('load more comments') ||
          text.startsWith('view more comments') ||
          /^view all [\d,]+ comments$/.test(text);
        const replies =
          fetchReplies &&
          (/^view replies\s*\(\d+\)/.test(text) ||
            /^view all \d+ replies/.test(text) ||
            text.startsWith('view more replies'));
        if (more || replies) {
          try { btn.click(); clicked++; } catch (e) { /* ignore */ }
        }
      }
      return clicked;
    };

    let ownerUsername = ownerHint;
    const harvest = (root) => {
      if (!ownerUsername) {
        const hl = root.querySelector('header a[href^="/"]');
        const hm = hl ? (hl.getAttribute('href') || '').match(/^\/([a-zA-Z0-9._]{1,30})\/?$/) : null;
        if (hm) ownerUsername = hm[1].toLowerCase();
      }
      const times = root.querySelectorAll('time');
      times.forEach((timeEl, idx) => {
        let container = timeEl.parentElement;
        let steps = 0;
        while (
          container && container.parentElement && container.parentElement !== root &&
          steps < 8 && container.parentElement.querySelectorAll('time').length === 1
        ) {
          container = container.parentElement;
          steps++;
        }
        if (!container || container === root) return;

        // Real comment rows have a "Reply" action; the post caption / footer do not.
        const rowText = container.innerText || '';
        if (!/(^|\n)\s*Reply\s*($|\n)/i.test(rowText)) return;

        let username = null;
        for (const a of container.querySelectorAll('a[href^="/"]')) {
          const href = a.getAttribute('href') || '';
          if (/^\/(p|reel|explore)\//.test(href) || href.includes('/liked_by/')) continue;
          const m = href.match(/^\/([a-zA-Z0-9._]{1,30})\/?$/);
          if (m) { username = m[1]; break; }
        }
        if (!username) return;

        let best = '';
        for (const el of container.querySelectorAll('span, div[dir="auto"]')) {
          if (el.querySelector('time') || el.closest('a')) continue;
          if (el.querySelector('a[href="/' + username + '/"]')) continue;
          if (el.querySelector('[role="button"]')) continue;
          const raw = (el.innerText || '').trim();
          if (!raw || raw.toLowerCase() === username.toLowerCase()) continue;
          if (/^(reply|edited|edited\s*•?|see translation|hide replies|view replies.*|view all \d+ replies|\d[\d,]*\s*likes?|pinned|following|follow|original audio|•)$/i.test(raw)) continue;
          if (raw.length > best.length) best = raw;
        }
        if (!best) return;

        const dt = timeEl.getAttribute('datetime');
        const createdAt = dt ? Math.floor(new Date(dt).getTime() / 1000) : null;
        const id = 'dom_' + username + '_' + hash(best);
        if (!found.has(id)) {
          found.set(id, {
            id, username, fullName: '', avatarUrl: '', text: best, createdAt,
            likes: 0, isReply: false, parentId: null, childCommentCount: 0, mediaId: null,
          });
        }
      });
    };

    const start = Date.now();
    let stagnant = 0;
    let lastSize = 0;
    let reachedEnd = false;

    while (Date.now() - start < durationMs) {
      const root = findRoot();
      const clicked = clickMore(root);
      const pane = findPane(root);
      if (pane) pane.scrollTop = pane.scrollHeight;
      else window.scrollBy(0, 750);
      await sleep(900);
      harvest(root);
      if (found.size > lastSize) { stagnant = 0; lastSize = found.size; }
      else if (clicked > 0) { stagnant += 0.4; }
      else { stagnant += 1; }
      if (stagnant >= 6) { reachedEnd = true; break; }
    }

    return { comments: Array.from(found.values()), reachedEnd, owner: ownerUsername || null };
  }

  /* ---------- Studio-side wrappers ---------- */

  function withTimeout(promise, ms, label) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)),
        ms
      );
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  async function exec(tabId, func, args, timeoutMs, label) {
    let results;
    try {
      results = await withTimeout(
        chrome.scripting.executeScript({ target: { tabId }, func, args: args || [] }),
        timeoutMs || 45000,
        label || 'Instagram tab'
      );
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      if (/Cannot access|cannot be scripted|No tab with id|Frame with ID/i.test(msg)) {
        throw new Error(
          'Cannot reach the Instagram tab. Refresh the Instagram page once, make sure you are logged in, then try again. (' + msg + ')'
        );
      }
      throw err;
    }
    const first = results && results[0];
    if (!first) throw new Error('The Instagram tab returned nothing. Refresh it and try again.');
    if (first.error) throw new Error(String(first.error.message || first.error));
    return first.result;
  }

  root.InstaBridge = {
    probe: (tabId, shortcode) => exec(tabId, probeInPage, [shortcode], 20000, 'Connecting to Instagram tab'),
    fetchJson: (tabId, url, headers) => exec(tabId, fetchJsonInPage, [url, headers], 45000, 'Instagram request'),
    domCollect: (tabId, opts) =>
      exec(tabId, domCollectInPage, [opts], ((opts && opts.durationMs) || 9000) + 30000, 'Visual scroll'),
  };
})(typeof window !== 'undefined' ? window : globalThis);
