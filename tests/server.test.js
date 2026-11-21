'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { createApp, listenWithFallback } = require('../server/server.js');

test('Server API suite', async (t) => {
  const testSessionFile = path.join(__dirname, '.test-session.json');
  const testCacheDir = path.join(__dirname, '.test-data');
  try {
    fs.unlinkSync(testSessionFile);
  } catch {}
  try {
    fs.rmSync(testCacheDir, { recursive: true, force: true });
  } catch {}

  const { server, getSession } = createApp({ sessionFile: testSessionFile, cacheDir: testCacheDir });
  const port = await listenWithFallback(server, 0); // ephemeral port
  const baseUrl = `http://127.0.0.1:${port}`;

  t.after(() => {
    server.close();
    try {
      fs.unlinkSync(testSessionFile);
    } catch {}
    try {
      fs.rmSync(testCacheDir, { recursive: true, force: true });
    } catch {}
  });

  await t.test('GET / serves studio.html with 200', async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('text/html'));
    const text = await res.text();
    assert.ok(text.includes('Insta Lucky Winner Picker'));
    assert.ok(text.includes('directLinkBanner'));
  });

  await t.test('GET /api/status returns unconfigured initially', async () => {
    const res = await fetch(`${baseUrl}/api/status`);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.ok, true);
    assert.equal(json.configured, false);
  });

  await t.test('GET /api/comments without URL returns BAD_LINK error NDJSON', async () => {
    const res = await fetch(`${baseUrl}/api/comments`);
    assert.equal(res.status, 200);
    const text = await res.text();
    const packet = JSON.parse(text.trim());
    assert.equal(packet.type, 'error');
    assert.equal(packet.code, 'BAD_LINK');
  });

  await t.test('GET /api/comments without session returns NO_SESSION error NDJSON', async () => {
    const res = await fetch(`${baseUrl}/api/comments?url=https://www.instagram.com/p/DFRxjqKxy8d/`);
    assert.equal(res.status, 200);
    const text = await res.text();
    const packet = JSON.parse(text.trim());
    assert.equal(packet.type, 'error');
    assert.equal(packet.code, 'NO_SESSION');
  });

  await t.test('POST /api/session rejects short or invalid sessionid', async () => {
    const res = await fetch(`${baseUrl}/api/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionid: 'short' }),
    });
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.ok, false);
    assert.ok(json.message.includes('sessionid'));
  });

  await t.test('GET /api/cache returns cached: false when not stored', async () => {
    const res = await fetch(`${baseUrl}/api/cache?url=https://www.instagram.com/p/testShortcode/`);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.ok, true);
    assert.equal(json.cached, false);
  });

  await t.test('POST /api/cache saves comments to disk and GET /api/cache retrieves them', async () => {
    const sample = [
      { id: 'c1', username: 'alice', text: 'great reel', createdAt: 1730000000 },
      { id: 'c2', username: 'bob', text: 'amazing @alice', createdAt: 1730000001 },
    ];
    const postRes = await fetch(`${baseUrl}/api/cache`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shortcode: 'testShortcode', comments: sample, postMeta: { ownerUsername: 'host' } }),
    });
    assert.equal(postRes.status, 200);
    const postJson = await postRes.json();
    assert.equal(postJson.ok, true);
    assert.equal(postJson.total, 2);

    const getRes = await fetch(`${baseUrl}/api/cache?url=https://www.instagram.com/p/testShortcode/`);
    assert.equal(getRes.status, 200);
    const getJson = await getRes.json();
    assert.equal(getJson.ok, true);
    assert.equal(getJson.cached, true);
    assert.equal(getJson.total, 2);
    assert.equal(getJson.comments[0].username, 'alice');
  });

  await t.test('DELETE /api/session succeeds', async () => {
    const res = await fetch(`${baseUrl}/api/session`, { method: 'DELETE' });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.ok, true);
  });
});
