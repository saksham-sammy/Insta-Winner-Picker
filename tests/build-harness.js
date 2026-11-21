/**
 * Builds tests/harness.html: the real studio.html + a fake `chrome` API whose
 * scripting.executeScript simulates an Instagram tab (paged api/v1 comments, optional
 * failure modes). Lets us exercise the full Studio flow in a real browser.
 *
 * Modes (via ?mode=): ok | rate | fail
 */
const fs = require('node:fs');
const path = require('node:path');

const src = path.resolve(__dirname, '..', 'src');
let html = fs.readFileSync(path.join(src, 'studio.html'), 'utf8');

const fake = `
<script>
(function () {
  const mode = new URLSearchParams(location.search).get('mode') || 'ok';
  const TAB = { id: 11, url: 'https://www.instagram.com/p/DfRxjqKxy8d/', active: false, windowId: 1 };
  const store = {};
  const calls = { fetch: 0 };
  window.__calls = calls;

  const mkComment = (i) => ({
    pk: String(1000 + i),
    text: i % 3 === 0 ? 'Count me in! @friend' + i + ' @buddy' + i + ' #giveaway' : 'nice post ' + i,
    created_at_utc: 1730000000 + i,
    parent_comment_id: 0,
    user: { username: 'user_' + (i % 40), full_name: 'User ' + i },
    child_comment_count: 0,
  });

  function apiPage(url) {
    const m = url.match(/[?&](max_id|min_id)=([^&]+)/);
    const start = m ? Number(decodeURIComponent(m[2])) : 0;
    const size = 50;
    const total = 130;
    const comments = [];
    for (let i = start; i < Math.min(total, start + size); i++) comments.push(mkComment(i));
    const next = start + size < total ? String(start + size) : null;
    return {
      status: 'ok',
      comment_count: total,
      caption: { text: 'Giveaway caption', user: { username: 'mr_host' } },
      comments,
      next_min_id: next,
      has_more_comments: Boolean(next),
    };
  }

  window.chrome = {
    runtime: { id: 'test-ext', getURL: (p) => p, onMessage: { addListener() {} }, sendMessage() {} },
    storage: {
      local: {
        get: async (k) => ({ [k]: store[k] }),
        set: async (o) => { Object.assign(store, o); },
      },
      onChanged: { addListener() {} },
    },
    tabs: {
      query: async () => [TAB],
      get: async () => TAB,
      update: async () => TAB,
      getCurrent: async () => ({ id: 99 }),
    },
    scripting: {
      executeScript: async ({ func, args }) => {
        const name = func.name;
        if (name === 'probeInPage') {
          return [{ result: { href: TAB.url, origin: 'https://www.instagram.com', csrf: 'tok', claim: '0', appId: '', mediaId: null, owner: 'mr_host', loggedInHint: true } }];
        }
        if (name === 'fetchJsonInPage') {
          calls.fetch++;
          await new Promise((r) => setTimeout(r, 30));
          if (mode === 'fail') return [{ result: { status: 400, ok: false, json: { status: 'fail', message: 'useragent mismatch' } } }];
          if (mode === 'rate' && calls.fetch === 2) return [{ result: { status: 429, ok: false, json: null, snippet: 'slow down' } }];
          return [{ result: { status: 200, ok: true, json: apiPage(args[0]) } }];
        }
        if (name === 'domCollectInPage') {
          const comments = [1, 2, 3].map((i) => ({ id: 'dom_x' + i, username: 'dom_user_' + i, fullName: '', avatarUrl: '', text: 'dom comment ' + i, createdAt: null, likes: 0, isReply: false, parentId: null, childCommentCount: 0, mediaId: null }));
          return [{ result: { comments, reachedEnd: true, owner: 'mr_host' } }];
        }
        throw new Error('unexpected func ' + name);
      },
    },
  };
})();
</script>
`;

html = html.replace('<script src="parser.js"></script>', fake + '\n<script src="parser.js"></script>');
fs.writeFileSync(path.join(src, '_harness.html'), html);
console.log('src/_harness.html written');
