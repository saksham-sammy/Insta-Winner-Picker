'use strict';
/**
 * Insta Lucky Winner Picker — local link server (no browser extension needed).
 *
 *   node server/server.js --open      →  http://localhost:3000
 *
 * - Serves the Winner Studio UI from /src
 * - POST /api/session   saves YOUR Instagram sessionid (local file only, never sent anywhere but instagram.com)
 * - GET  /api/comments  streams every comment of a post/reel link as NDJSON (live progress)
 *
 * Zero dependencies (Node 18+). Binds to 127.0.0.1 only.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { exec } = require('node:child_process');
const Parser = require('../src/parser.js');

const ROOT = path.resolve(__dirname, '..');
const STATIC_DIR = path.join(ROOT, 'src');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function createApp(options = {}) {
  const igBase = (options.igBase || process.env.IG_BASE || 'https://www.instagram.com').replace(/\/$/, '');
  const sessionFile = options.sessionFile || path.join(ROOT, '.session.json');

  /** @type {{sessionid: string, username: string|null} | null} */
  let session = null;

  function loadSession() {
    if (process.env.IG_SESSIONID) {
      session = { sessionid: cleanSessionId(process.env.IG_SESSIONID), username: null };
      return;
    }
    try {
      const raw = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
      if (raw && raw.sessionid) session = { sessionid: raw.sessionid, username: raw.username || null };
    } catch {
      session = null;
    }
  }

  function cleanSessionId(v) {
    return String(v || '')
      .trim()
      .replace(/^sessionid\s*=\s*/i, '')
      .replace(/^["']|["']$/g, '')
      .replace(/;.*$/, '')
      .trim();
  }

  function igHeaders(sess) {
    const csrf = crypto.randomBytes(16).toString('hex');
    const userId = decodeURIComponent(sess.sessionid).split(':')[0];
    const cookie =
      `sessionid=${sess.sessionid}; csrftoken=${csrf}` + (/^\d+$/.test(userId) ? `; ds_user_id=${userId}` : '');
    return {
      'User-Agent': UA,
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'X-IG-App-ID': '936619743392459',
      'X-ASBD-ID': '129477',
      'X-IG-WWW-Claim': '0',
      'X-Requested-With': 'XMLHttpRequest',
      'X-CSRFToken': csrf,
      Referer: 'https://www.instagram.com/',
      Cookie: cookie,
    };
  }

  async function igGet(pathAndQuery, sess) {
    try {
      const resp = await fetch(igBase + pathAndQuery, { headers: igHeaders(sess), redirect: 'manual' });
      const text = await resp.text();
      let json = null;
      try {
        json = JSON.parse(text.replace(/^for\s*\(\s*;\s*;\s*\)\s*;/, '').trim());
      } catch {
        /* not JSON */
      }
      return { status: resp.status, json, snippet: json ? null : text.slice(0, 160) };
    } catch (err) {
      return { status: 0, json: null, error: String(err && err.message ? err.message : err) };
    }
  }

  function isAuthFailure(res) {
    const j = res.json;
    return (
      res.status === 401 ||
      res.status === 302 ||
      (j && (j.message === 'login_required' || j.require_login === true))
    );
  }

  async function validateSession(sess) {
    const res = await igGet('/api/v1/accounts/current_user/?edit=true', sess);
    if (res.status === 200 && res.json && res.json.user && res.json.user.username) {
      return { ok: true, username: res.json.user.username };
    }
    if (isAuthFailure(res)) return { ok: false, message: 'Instagram rejected this sessionid (expired or wrong). Copy it again from a logged-in browser.' };
    return {
      ok: false,
      message: `Could not verify the session (HTTP ${res.status}${res.error ? ' — ' + res.error : ''}). Try again in a minute.`,
    };
  }

  const cacheDir = options.cacheDir || path.join(ROOT, 'data');
  if (!fs.existsSync(cacheDir)) {
    try { fs.mkdirSync(cacheDir, { recursive: true }); } catch {}
  }

  function findCacheFilePath(shortcode) {
    if (!shortcode) return null;
    const directPath = path.join(cacheDir, `comments_${shortcode}.json`);
    if (fs.existsSync(directPath)) return directPath;
    try {
      const files = fs.readdirSync(cacheDir);
      const targetLower = `comments_${shortcode.toLowerCase()}.json`;
      const match = files.find((f) => f.toLowerCase() === targetLower);
      if (match) return path.join(cacheDir, match);
    } catch {}
    return directPath;
  }

  function loadCachedComments(shortcode) {
    try {
      const p = findCacheFilePath(shortcode);
      if (p && fs.existsSync(p)) {
        const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (raw && Array.isArray(raw.comments)) return raw;
      }
    } catch (e) {
      /* ignore */
    }
    return null;
  }

  function saveCachedComments(shortcode, mediaId, meta, comments) {
    try {
      const p = findCacheFilePath(shortcode);
      const data = {
        shortcode,
        mediaId: mediaId || null,
        postMeta: meta || {},
        total: comments.length,
        lastSyncedAt: Date.now(),
        comments,
      };
      fs.writeFileSync(p, JSON.stringify(data), 'utf8');
    } catch (e) {
      console.error('Failed to write comment cache:', e.message);
    }
  }

  /** Streams comments for one post as NDJSON lines through `send`. */
  async function streamComments({ shortcode, replies }, send, aborted) {
    const cached = loadCachedComments(shortcode);
    const allCommentsMap = new Map();
    const sentIds = new Set();
    const meta = { shortcode, mediaId: null, ownerUsername: null, commentCount: null };

    if (cached && Array.isArray(cached.comments) && cached.comments.length > 0) {
      if (cached.mediaId) meta.mediaId = cached.mediaId;
      if (cached.postMeta) {
        if (cached.postMeta.ownerUsername) meta.ownerUsername = cached.postMeta.ownerUsername;
        if (cached.postMeta.commentCount != null) meta.commentCount = cached.postMeta.commentCount;
      }
      for (const c of cached.comments) {
        if (c && c.id) {
          allCommentsMap.set(c.id, c);
          sentIds.add(c.id);
        }
      }
      send({
        type: 'cache_hit',
        shortcode,
        mediaId: meta.mediaId,
        total: allCommentsMap.size,
        ownerUsername: meta.ownerUsername,
        commentCount: meta.commentCount,
        lastSyncedAt: cached.lastSyncedAt,
        comments: cached.comments,
      });
    }

    if (!session) {
      if (allCommentsMap.size > 0) {
        send({
          type: 'done',
          total: allCommentsMap.size,
          freshAdded: 0,
          ownerUsername: meta.ownerUsername,
          commentCount: meta.commentCount,
          note: 'Loaded comments from local cache. Connect Instagram login to sync newer comments.'
        });
        return;
      }
      send({ type: 'error', code: 'NO_SESSION', message: 'Connect your Instagram login first (one-time setup).' });
      return;
    }
    const sess = session;

    let mediaId = meta.mediaId || Parser.shortcodeToMediaId(shortcode);
    if (!mediaId) {
      const o = await igGet(
        `/api/v1/oembed/?url=${encodeURIComponent(`https://www.instagram.com/p/${shortcode}/`)}`,
        sess
      );
      if (o.json && o.json.media_id) mediaId = String(o.json.media_id).split('_')[0];
    }
    if (!mediaId) {
      if (allCommentsMap.size > 0) {
        send({ type: 'done', total: allCommentsMap.size, freshAdded: 0, ownerUsername: meta.ownerUsername, commentCount: meta.commentCount });
        return;
      }
      send({ type: 'error', code: 'BAD_LINK', message: 'Could not work out the post ID from that link.' });
      return;
    }

    meta.mediaId = mediaId;
    send({ type: 'meta', ...meta });

    const queue = [{ param: null, cursor: null }];
    const seenCursors = new Set();
    const needReplies = [];
    let pages = 0;
    let zeroRun = 0;
    let freshAdded = 0;

    const persistCache = () => {
      saveCachedComments(shortcode, mediaId, meta, Array.from(allCommentsMap.values()));
    };

    async function get(pathAndQuery) {
      for (let attempt = 0; attempt <= 4; attempt++) {
        if (aborted()) return { aborted: true };
        const res = await igGet(pathAndQuery, sess);
        if (res.status === 429 || res.status === 503) {
          const wait = Math.min(60, 4 * 2 ** attempt);
          for (let s = wait; s > 0 && !aborted(); s--) {
            send({
              type: 'progress',
              message: `Instagram asked us to slow down — resuming in ${s}s (${allCommentsMap.size.toLocaleString()} comments read so far)...`,
            });
            await sleep(1000);
          }
          continue;
        }
        return res;
      }
      return { status: 429, json: null, error: 'Rate limited by Instagram' };
    }

    function emit(parsed) {
      if (parsed.postMeta.ownerUsername) meta.ownerUsername = parsed.postMeta.ownerUsername;
      if (parsed.postMeta.commentCount != null && meta.commentCount == null) {
        meta.commentCount = parsed.postMeta.commentCount;
      }
      const fresh = parsed.comments.filter((c) => !sentIds.has(c.id));
      fresh.forEach((c) => {
        sentIds.add(c.id);
        allCommentsMap.set(c.id, c);
      });
      freshAdded += fresh.length;
      send({
        type: 'comments',
        comments: fresh,
        total: allCommentsMap.size,
        freshCount: fresh.length,
        ownerUsername: meta.ownerUsername,
        commentCount: meta.commentCount,
      });
      if (fresh.length > 0) persistCache();
      return fresh.length;
    }

    while (queue.length > 0 && !aborted() && pages < 3000) {
      const cur = queue.shift();
      let p = `/api/v1/media/${mediaId}/comments/?can_support_threading=true&permalink_enabled=false`;
      if (cur.param) p += `&${cur.param}=${encodeURIComponent(cur.cursor)}`;

      let res = await get(p);
      if (res.aborted) return;

      // Smart casing recovery for shortcodes (e.g. DfRxjqKxy8d vs DFRxjqKxy8d)
      if (pages === 0 && res.status === 404) {
        const altShortcode = shortcode.startsWith('Df')
          ? shortcode.replace(/^Df/, 'DF')
          : shortcode.startsWith('DF')
          ? shortcode.replace(/^DF/, 'Df')
          : null;
        if (altShortcode) {
          const altMediaId = Parser.shortcodeToMediaId(altShortcode);
          if (altMediaId && altMediaId !== mediaId) {
            const altRes = await get(`/api/v1/media/${altMediaId}/comments/?can_support_threading=true&permalink_enabled=false`);
            if (altRes.status === 200 && altRes.json && altRes.json.status !== 'fail') {
              mediaId = altMediaId;
              meta.mediaId = altMediaId;
              res = altRes;
            }
          }
        }
      }

      const j = res.json;
      if (!j || j.status === 'fail' || res.status !== 200) {
        if (isAuthFailure(res)) {
          send({ type: 'error', code: 'SESSION_EXPIRED', message: 'Your Instagram login expired. Paste a fresh sessionid.' });
        } else if (res.status === 404) {
          send({ type: 'error', code: 'NOT_FOUND', message: 'Post not found, or your account cannot see it.' });
        } else if (pages > 0) {
          send({
            type: 'error',
            code: 'PARTIAL',
            message: `Stopped early at ${allCommentsMap.size.toLocaleString()} comments (HTTP ${res.status}${j && j.message ? ' — ' + j.message : ''}).`,
          });
        } else {
          send({
            type: 'error',
            code: 'API_FAILED',
            message: `Instagram refused the request (HTTP ${res.status}${j && j.message ? ' — ' + j.message : res.snippet ? ' — ' + res.snippet : res.error ? ' — ' + res.error : ''}).`,
          });
        }
        persistCache();
        return;
      }

      pages++;
      const added = emit(Parser.parsePayloadForInstagramData(j, null, null));
      zeroRun = added === 0 ? zeroRun + 1 : 0;
      send({
        type: 'progress',
        message: `Reading comments — ${allCommentsMap.size.toLocaleString()}${meta.commentCount ? ` of ~${Number(meta.commentCount).toLocaleString()}` : ''} (page ${pages})...`,
      });

      if (replies && Array.isArray(j.comments)) {
        for (const c of j.comments) {
          const n = Number(c.child_comment_count || 0);
          const preview = Array.isArray(c.preview_child_comments) ? c.preview_child_comments.length : 0;
          if (c.pk && n > preview) needReplies.push(String(c.pk));
        }
      }

      for (const [param, key] of [['max_id', 'next_max_id'], ['min_id', 'next_min_id']]) {
        const raw = j[key];
        const cursor = raw == null || raw === '' ? null : typeof raw === 'object' ? JSON.stringify(raw) : String(raw);
        if (cursor && !seenCursors.has(`${param}:${cursor}`)) {
          seenCursors.add(`${param}:${cursor}`);
          queue.push({ param, cursor });
        }
      }

      if (zeroRun >= 4) break;
      if (queue.length > 0) await sleep(450 + Math.floor(Math.random() * 400));
    }

    for (let i = 0; i < needReplies.length && !aborted(); i++) {
      const cq = [{ param: null, cursor: null }];
      const cs = new Set();
      let cp = 0;
      while (cq.length > 0 && !aborted() && cp < 60) {
        const c = cq.shift();
        let p = `/api/v1/media/${mediaId}/comments/${needReplies[i]}/child_comments/`;
        if (c.param) p += `?${c.param}=${encodeURIComponent(c.cursor)}`;
        const res = await get(p);
        if (res.aborted || !res.json || res.status !== 200) break;
        cp++;
        emit(Parser.parsePayloadForInstagramData(res.json, null, null));
        for (const [param, raw] of [
          ['max_id', res.json.has_more_tail_child_comments ? res.json.next_max_child_cursor : null],
          ['min_id', res.json.has_more_head_child_comments ? res.json.next_min_child_cursor : null],
        ]) {
          const cursor = raw == null || raw === '' ? null : typeof raw === 'object' ? JSON.stringify(raw) : String(raw);
          if (cursor && !cs.has(`${param}:${cursor}`)) {
            cs.add(`${param}:${cursor}`);
            cq.push({ param, cursor });
          }
        }
        await sleep(350 + Math.floor(Math.random() * 250));
      }
      send({ type: 'progress', message: `Reading replies (${i + 1}/${needReplies.length}) — ${allCommentsMap.size.toLocaleString()} comments...` });
    }

    persistCache();
    send({
      type: 'done',
      total: allCommentsMap.size,
      freshAdded,
      ownerUsername: meta.ownerUsername,
      commentCount: meta.commentCount,
      aborted: aborted(),
    });
  }

  /* ------------------------- HTTP layer ------------------------- */

  function isLocalHost(hostHeader) {
    const host = String(hostHeader || '').replace(/:\d+$/, '').toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  }

  function isAllowedHost(hostHeader) {
    if (process.env.ALLOW_REMOTE === 'true' || process.env.ALLOW_REMOTE === '1' || process.env.HOST === '0.0.0.0') {
      return true;
    }
    return isLocalHost(hostHeader);
  }

  function isAllowedOrigin(origin, hostHeader) {
    if (!origin) return true;
    let originHost = '';
    try {
      originHost = new URL(origin).host.toLowerCase();
    } catch {
      return false;
    }
    const cleanReqHost = String(hostHeader || '').trim().toLowerCase();
    if (originHost === cleanReqHost) return true;
    if (process.env.ALLOW_REMOTE === 'true' || process.env.ALLOW_REMOTE === '1' || process.env.HOST === '0.0.0.0') {
      return true;
    }
    return isLocalHost(originHost);
  }

  function json(res, code, obj) {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(obj));
  }

  function readBody(req, limit = 10_000) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > limit) {
          reject(new Error('Body too large'));
          req.destroy();
          return;
        }
        chunks.push(c);
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }

  function serveStatic(req, res, pathname) {
    const isIcon = pathname.startsWith('/icons/');
    const baseDir = isIcon ? path.join(ROOT, 'icons') : STATIC_DIR;
    const rel = pathname === '/' ? '/studio.html' : isIcon ? pathname.replace(/^\/icons\/?/, '/') : pathname;
    const full = path.resolve(baseDir, '.' + decodeURIComponent(rel));
    if (!full.startsWith(baseDir + path.sep) && full !== baseDir) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    fs.readFile(full, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(data);
    });
  }

  const server = http.createServer(async (req, res) => {
    try {
      if (!isAllowedHost(req.headers.host)) {
        res.writeHead(403);
        res.end('Forbidden host');
        return;
      }
      const origin = req.headers.origin;
      if (origin && !isAllowedOrigin(origin, req.headers.host)) {
        res.writeHead(403);
        res.end('Forbidden origin');
        return;
      }

      const url = new URL(req.url, 'http://localhost');

      if (url.pathname === '/api/status' && req.method === 'GET') {
        return json(res, 200, { ok: true, configured: Boolean(session), username: session ? session.username : null });
      }

      if (url.pathname === '/api/session' && req.method === 'POST') {
        let body;
        try {
          body = JSON.parse(await readBody(req));
        } catch {
          return json(res, 400, { ok: false, message: 'Invalid request.' });
        }
        const sid = cleanSessionId(body && body.sessionid);
        if (!sid || sid.length < 20) {
          return json(res, 400, { ok: false, message: 'That does not look like a sessionid. It is a long value (30+ characters).' });
        }
        const check = await validateSession({ sessionid: sid });
        if (!check.ok) return json(res, 400, { ok: false, message: check.message });
        session = { sessionid: sid, username: check.username };
        try {
          fs.writeFileSync(sessionFile, JSON.stringify({ sessionid: sid, username: check.username }), { mode: 0o600 });
        } catch {
          /* still usable in memory */
        }
        return json(res, 200, { ok: true, username: check.username });
      }

      if (url.pathname === '/api/session' && req.method === 'DELETE') {
        session = null;
        try {
          fs.unlinkSync(sessionFile);
        } catch {
          /* ignore */
        }
        return json(res, 200, { ok: true });
      }

      if (url.pathname === '/api/cache' && req.method === 'GET') {
        const input = String(url.searchParams.get('url') || '').trim();
        let shortcode = null;
        if (/^[A-Za-z0-9_-]{6,60}$/.test(input)) shortcode = input;
        else if (/^https?:\/\/([\w-]+\.)?instagram\.com\//i.test(input)) shortcode = Parser.extractShortcodeFromUrl(input);

        if (!shortcode) return json(res, 400, { ok: false, message: 'Invalid post link or shortcode.' });
        const cached = loadCachedComments(shortcode);
        if (!cached || !Array.isArray(cached.comments) || cached.comments.length === 0) {
          return json(res, 200, { ok: true, cached: false, shortcode, total: 0 });
        }
        return json(res, 200, {
          ok: true,
          cached: true,
          shortcode,
          mediaId: cached.mediaId,
          postMeta: cached.postMeta,
          total: cached.comments.length,
          lastSyncedAt: cached.lastSyncedAt,
          comments: cached.comments,
        });
      }

      if (url.pathname === '/api/cache' && req.method === 'POST') {
        let body;
        try {
          body = JSON.parse(await readBody(req, 50_000_000));
        } catch {
          return json(res, 400, { ok: false, message: 'Invalid JSON request.' });
        }
        if (!body.shortcode || !Array.isArray(body.comments)) {
          return json(res, 400, { ok: false, message: 'Missing shortcode or comments array.' });
        }
        saveCachedComments(body.shortcode, body.mediaId, body.postMeta || {}, body.comments);
        return json(res, 200, { ok: true, total: body.comments.length });
      }

      if (url.pathname === '/api/comments' && req.method === 'GET') {
        const input = String(url.searchParams.get('url') || '').trim();
        const replies = url.searchParams.get('replies') === '1';
        let shortcode = null;
        if (/^[A-Za-z0-9_-]{6,60}$/.test(input)) shortcode = input;
        else if (/^https?:\/\/([\w-]+\.)?instagram\.com\//i.test(input)) shortcode = Parser.extractShortcodeFromUrl(input);

        res.writeHead(200, {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Accel-Buffering': 'no',
        });
        let closed = false;
        res.on('close', () => {
          closed = true;
        });
        const send = (obj) => {
          if (!closed) res.write(JSON.stringify(obj) + '\n');
        };

        if (!shortcode) {
          send({ type: 'error', code: 'BAD_LINK', message: 'Paste a full Instagram post or reel link (instagram.com/p/... or /reel/...).' });
          return res.end();
        }
        try {
          await streamComments({ shortcode, replies }, send, () => closed);
        } catch (err) {
          send({ type: 'error', code: 'SERVER', message: String(err && err.message ? err.message : err) });
        }
        return res.end();
      }

      if (req.method === 'GET') return serveStatic(req, res, url.pathname);

      res.writeHead(405);
      res.end('Method not allowed');
    } catch (err) {
      if (!res.headersSent) json(res, 500, { ok: false, message: String(err && err.message ? err.message : err) });
      else res.end();
    }
  });

  loadSession();
  return { server, getSession: () => session };
}

function listenWithFallback(server, startPort, host = (process.env.HOST || '127.0.0.1'), tries = 10) {
  return new Promise((resolve, reject) => {
    let port = startPort;
    const attempt = () => {
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE' && tries-- > 0) {
          port++;
          attempt();
        } else reject(err);
      });
      server.listen(port, host, () => {
        const addr = server.address();
        resolve(addr && typeof addr === 'object' ? addr.port : port);
      });
    };
    attempt();
  });
}

module.exports = { createApp, listenWithFallback };

if (require.main === module) {
  const { server, getSession } = createApp();
  const wantedPort = Number(process.env.PORT) || 3000;
  const wantedHost = process.env.HOST || '127.0.0.1';
  listenWithFallback(server, wantedPort, wantedHost)
    .then((port) => {
      const displayHost = wantedHost === '0.0.0.0' ? 'localhost' : wantedHost;
      const link = `http://${displayHost}:${port}`;
      console.log('\n  Insta Lucky Winner Picker is running');
      console.log(`  Open this link:  ${link}`);
      console.log(getSession() ? '  Instagram login: connected' : '  Instagram login: not connected yet (the page will guide you)');
      console.log('  Press Ctrl+C to stop.\n');
      if (process.argv.includes('--open')) {
        const cmd = process.platform === 'win32' ? `start "" "${link}"` : process.platform === 'darwin' ? `open "${link}"` : `xdg-open "${link}"`;
        exec(cmd, () => {});
      }
    })
    .catch((err) => {
      console.error('Could not start the server:', err.message);
      process.exit(1);
    });
}
