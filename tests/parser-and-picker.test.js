const test = require('node:test');
const assert = require('node:assert/strict');
const Parser = require('../src/parser.js');

test('extractShortcodeFromUrl handles all Instagram post and reel URL formats', () => {
  assert.equal(
    Parser.extractShortcodeFromUrl('https://www.instagram.com/p/C8abc123_xy/'),
    'C8abc123_xy'
  );
  assert.equal(
    Parser.extractShortcodeFromUrl('https://www.instagram.com/nike/p/C8abc123_xy/?img_index=1'),
    'C8abc123_xy'
  );
  assert.equal(
    Parser.extractShortcodeFromUrl('https://www.instagram.com/creator.name/reel/DA9_xyz-12/'),
    'DA9_xyz-12'
  );
  assert.equal(Parser.extractShortcodeFromUrl('https://www.instagram.com/explore/'), null);
});

test('shortcodeToMediaId converts standard shortcodes with 64-bit BigInt precision', () => {
  // Known Instagram shortcode -> PK math check ('B' = 1)
  assert.equal(Parser.shortcodeToMediaId('B'), '1');
  const id = Parser.shortcodeToMediaId('C8abc123_xy');
  assert.ok(id && /^\d{15,22}$/.test(id));
  // Private 39-char shortcodes return null so DOM/SSR mediaId is used instead
  assert.equal(
    Parser.shortcodeToMediaId('C8abc123_xyABCDEFGHIJKLMNOPQRSTUVWXYZ12345'),
    null
  );
});

test('extractMentions ignores emails, self-mentions, trailing dots, and duplicate tags', () => {
  const mentions = Parser.extractMentions(
    'Email me at test@gmail.com! Tagging @Alice.Dev. @alice.dev @bob_99 and myself @charlie!',
    'charlie'
  );
  assert.deepEqual(mentions, ['alice.dev', 'bob_99']);
});

test('parsePayloadForInstagramData extracts api/v1 comments & replies while skipping post caption', () => {
  const apiV1Payload = {
    status: 'ok',
    comment_count: 3,
    caption: {
      pk: '1000',
      text: 'Official giveaway post caption! #win',
      user: { username: 'brand_host' },
    },
    comments: [
      {
        pk: '2001',
        text: 'Entering! @friend1 @friend2 #win',
        created_at_utc: 1730000100,
        comment_like_count: 4,
        user: { username: 'user_one', full_name: 'User One' },
        child_comment_count: 1,
        preview_child_comments: [
          {
            pk: '2002',
            text: 'Good luck!',
            created_at_utc: 1730000200,
            parent_comment_id: '2001',
            user: { username: 'friend1' },
          },
        ],
      },
    ],
  };

  const res = Parser.parsePayloadForInstagramData(apiV1Payload, 'SHORT1');
  assert.equal(res.postMeta.ownerUsername, 'brand_host');
  assert.equal(res.postMeta.commentCount, 3);
  assert.equal(res.comments.length, 2);
  assert.equal(res.comments[0].username, 'user_one');
  assert.equal(res.comments[0].isReply, false);
  assert.equal(res.comments[1].username, 'friend1');
  assert.equal(res.comments[1].isReply, true);
});

test('parsePayloadForInstagramData extracts Polaris GraphQL XDTCommentDict and filters foreign media_id', () => {
  const gqlPayload = {
    data: {
      xdt_api__v1__media__media_id__comments__connection: {
        edges: [
          {
            node: {
              __typename: 'XDTCommentDict',
              pk: '9001',
              media_id: '55555',
              text: 'GraphQL comment @buddy',
              created_at: 1730000500,
              user: { username: 'gql_fan' },
            },
          },
          {
            node: {
              __typename: 'XDTCommentDict',
              pk: '9002',
              media_id: '99999', // Different post in SPA feed!
              text: 'Unrelated post comment',
              created_at: 1730000600,
              user: { username: 'other_post_user' },
            },
          },
        ],
      },
    },
  };

  const res = Parser.parsePayloadForInstagramData(gqlPayload, 'MYCODE', '55555');
  assert.equal(res.comments.length, 1);
  assert.equal(res.comments[0].username, 'gql_fan');
});

test('filterAndBuildEntries filters BEFORE deduplicating unique users so 2nd qualifying comment counts', () => {
  const comments = [
    { id: '1', username: 'brand_host', text: 'Giveaway rules @a @b #win', isReply: false },
    { id: '2', username: 'rohan', text: 'Forgot to tag friends!', isReply: false },
    { id: '3', username: 'rohan', text: 'Tagging @amit @priya #win', isReply: false },
    { id: '4', username: 'sara', text: 'First entry @neha @zoya #win', isReply: false },
    { id: '5', username: 'sara', text: 'Second entry @vikram @kabir #win', isReply: false },
    { id: '6', username: 'reply_guy', text: 'Replying @amit @priya #win', isReply: true },
  ];

  const pool = Parser.filterAndBuildEntries(comments, {
    uniqueUsers: true,
    includeReplies: false,
    keyword: '#win',
    minMentions: 2,
    excludedUsers: 'brand_host',
  });

  // Both rohan (via comment #3) and sara (merged #4 & #5 into 1 entry) must be eligible!
  assert.equal(pool.entries.length, 2);
  assert.deepEqual(
    pool.entries.map((e) => e.username),
    ['rohan', 'sara']
  );
  assert.equal(pool.entries[1].qualifyingCount, 2);
});

test('pickRandomEntry selects uniformly without bias and handles single/empty pools', () => {
  assert.equal(Parser.pickRandomEntry([]), null);
  const single = Parser.pickRandomEntry([{ username: 'only_one' }]);
  assert.equal(single.winner.username, 'only_one');
  assert.equal(single.index, 0);

  const entries = [{ username: 'a' }, { username: 'b' }, { username: 'c' }];
  const counts = { a: 0, b: 0, c: 0 };
  for (let i = 0; i < 3000; i++) {
    const res = Parser.pickRandomEntry(entries);
    counts[res.winner.username]++;
  }
  assert.ok(counts.a > 850 && counts.b > 850 && counts.c > 850);
});

test('parseManualCommentsInput parses CSV and @user: comment lines', () => {
  const raw = `username,comment\n@alice, "Hello @bob, love this!"\ncharlie: Count me in @dave`;
  const parsed = Parser.parseManualCommentsInput(raw);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].username, 'alice');
  assert.equal(parsed[0].text, 'Hello @bob, love this!');
  assert.equal(parsed[1].username, 'charlie');
});

test('top-level comments with parent_comment_id 0 are NOT treated as replies', () => {
  const payload = {
    status: 'ok',
    comments: [
      { pk: '1', text: 'hello', parent_comment_id: 0, user: { username: 'a' } },
      { pk: '2', text: 'hi', parent_comment_id: '0', user: { username: 'b' } },
      { pk: '3', text: 'real reply', parent_comment_id: '1', user: { username: 'c' } },
    ],
  };
  const res = Parser.parsePayloadForInstagramData(payload, null, null);
  const byUser = Object.fromEntries(res.comments.map((c) => [c.username, c.isReply]));
  assert.deepEqual(byUser, { a: false, b: false, c: true });
});

test('Extension manifest paths, DOM element IDs, and MV3 CSP compliance', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const extRoot = path.resolve(__dirname, '..');

  const manifest = JSON.parse(
    fs.readFileSync(path.join(extRoot, 'manifest.json'), 'utf8')
  );
  assert.equal(manifest.manifest_version, 3);

  const requiredFiles = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    ...Object.values(manifest.icons),
    'src/studio.html',
    'src/studio.css',
    'src/studio.js',
    'src/tab-bridge.js',
    'src/popup.css',
  ];
  assert.ok(manifest.permissions.includes('scripting'));
  assert.ok(manifest.permissions.includes('tabs'));
  assert.ok(manifest.host_permissions.some((h) => h.includes('instagram.com')));

  for (const relPath of requiredFiles) {
    assert.ok(
      fs.existsSync(path.join(extRoot, relPath)),
      `Missing extension file: ${relPath}`
    );
  }

  for (const [htmlRel, jsRel] of [
    ['src/popup.html', 'src/popup.js'],
    ['src/studio.html', 'src/studio.js'],
  ]) {
    const html = fs.readFileSync(path.join(extRoot, htmlRel), 'utf8');
    const js = fs.readFileSync(path.join(extRoot, jsRel), 'utf8');

    const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
    const jsIds = [...js.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]);

    for (const id of jsIds) {
      assert.ok(htmlIds.has(id), `${jsRel} references missing #${id} in ${htmlRel}`);
    }

    assert.equal(
      /\son[a-z]+\s*=/i.test(html),
      false,
      `${htmlRel} must not contain inline event handlers for MV3 CSP`
    );
  }
});
