/**
 * Shared Instagram Comment Parser, Post Metadata Extractor, Giveaway Filter,
 * and Cryptographically Unbiased Winner Selector.
 *
 * Works in:
 * - Chrome/Edge Extension MAIN world & ISOLATED world
 * - Extension Popup & Studio UI
 * - Node.js test suite
 */
(function (root) {
  if (root.__InstaLuckyParser) return;

  const SHORTCODE_ALPHABET =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

  /**
   * Extract shortcode from any Instagram post/reel/tv URL or pathname.
   * Supports both /p/CODE/ and /username/p/CODE/ formats.
   */
  function extractShortcodeFromUrl(urlOrPath) {
    if (!urlOrPath || typeof urlOrPath !== 'string') return null;
    try {
      const path = urlOrPath.startsWith('http')
        ? new URL(urlOrPath).pathname
        : urlOrPath;
      const match = path.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
      return match ? match[1] : null;
    } catch {
      const match = urlOrPath.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
      return match ? match[1] : null;
    }
  }

  /**
   * Convert a public Instagram shortcode (<= 12 chars) into a numeric media PK string.
   * Private posts use long ~39-char shortcodes which must be resolved via DOM/SSR JSON instead.
   */
  function shortcodeToMediaId(shortcode) {
    if (!shortcode || typeof shortcode !== 'string') return null;
    const trimmed = shortcode.trim();
    if (trimmed.length === 0 || trimmed.length > 12) return null;
    const core = trimmed.slice(0, 11);
    let id = 0n;
    for (let i = 0; i < core.length; i++) {
      const idx = SHORTCODE_ALPHABET.indexOf(core[i]);
      if (idx === -1) return null;
      id = id * 64n + BigInt(idx);
    }
    return id > 0n ? id.toString(10) : null;
  }

  /**
   * Extract unique @mentions from comment text, ignoring email addresses,
   * stripping trailing dots, and excluding self-mentions by the comment author.
   */
  function extractMentions(text, authorUsername = '') {
    if (!text || typeof text !== 'string') return [];
    const authorLower = String(authorUsername || '').trim().replace(/^@/, '').toLowerCase();
    const regex = /(?:^|[^a-zA-Z0-9._])@([a-zA-Z0-9._]{1,30})/g;
    const seen = new Set();
    let match;
    while ((match = regex.exec(text)) !== null) {
      // Instagram usernames cannot end with a period
      const clean = match[1].replace(/\.+$/, '');
      if (!clean) continue;
      const lower = clean.toLowerCase();
      if (lower === authorLower) continue;
      seen.add(lower);
    }
    return Array.from(seen);
  }

  /**
   * Normalize a single comment node from either api/v1 or GraphQL formats.
   */
  function normalizeCommentNode(node, defaultIsReply = false, defaultParentId = null) {
    if (!node || typeof node !== 'object') return null;

    const rawId = node.pk || node.id;
    const userObj = node.user || node.owner;
    const username = userObj && (userObj.username || userObj.handle);
    const text = typeof node.text === 'string' ? node.text : null;

    if (!rawId || !username || text === null) return null;

    // Instagram may send parent_comment_id as 0 / "0" / "" for top-level comments
    const rawParent = node.parent_comment_id;
    const hasRealParent =
      rawParent != null && String(rawParent) !== '' && String(rawParent) !== '0';
    const parentId = hasRealParent
      ? String(rawParent)
      : defaultParentId != null && String(defaultParentId) !== '0'
        ? String(defaultParentId)
        : null;

    const isReply = Boolean(defaultIsReply || parentId);
    const createdAtRaw =
      node.created_at_utc ?? node.created_at ?? node.taken_at ?? null;
    const createdAt =
      createdAtRaw != null && !Number.isNaN(Number(createdAtRaw))
        ? Number(createdAtRaw)
        : null;

    const likes =
      node.comment_like_count ??
      node.like_count ??
      (node.edge_liked_by && node.edge_liked_by.count) ??
      0;

    const childCount =
      node.child_comment_count ??
      (node.edge_threaded_comments && node.edge_threaded_comments.count) ??
      0;

    const rawMediaId = node.media_id || node.media_pk || null;
    const cleanMediaId = rawMediaId ? String(rawMediaId).split('_')[0] : null;

    return {
      id: String(rawId),
      username: String(username).trim(),
      fullName: String((userObj && userObj.full_name) || '').trim(),
      avatarUrl: String((userObj && userObj.profile_pic_url) || ''),
      text,
      createdAt,
      likes: Number(likes) || 0,
      isReply,
      parentId,
      childCommentCount: Number(childCount) || 0,
      mediaId: cleanMediaId,
    };
  }

  /**
   * Recursively inspect any Instagram JSON payload (api/v1, GraphQL, or Relay SSR)
   * to extract post metadata and normalized comments without misclassifying post captions.
   */
  function parsePayloadForInstagramData(
    payload,
    targetShortcode = null,
    targetMediaId = null
  ) {
    const commentsMap = new Map();
    const postMeta = {
      mediaId: targetMediaId ? String(targetMediaId).split('_')[0] : null,
      shortcode: targetShortcode || null,
      ownerUsername: null,
      commentCount: null,
      captionText: null,
      appId: null,
    };

    const visited = new WeakSet();

    function addComment(c) {
      if (!c) return;
      if (
        postMeta.mediaId &&
        c.mediaId &&
        String(c.mediaId) !== String(postMeta.mediaId)
      ) {
        return;
      }
      const existing = commentsMap.get(c.id);
      if (!existing) {
        commentsMap.set(c.id, c);
      } else {
        // Merge richer fields if a later payload has more info
        commentsMap.set(c.id, {
          ...existing,
          ...c,
          isReply: existing.isReply || c.isReply,
          parentId: existing.parentId || c.parentId,
          avatarUrl: c.avatarUrl || existing.avatarUrl,
          fullName: c.fullName || existing.fullName,
        });
      }
    }

    function harvestCommentObject(node, isReply = false, parentId = null) {
      if (!node || typeof node !== 'object') return;
      const norm = normalizeCommentNode(node, isReply, parentId);
      if (!norm) return;
      addComment(norm);

      // Extract inline preview replies (api/v1)
      const inlineReplies =
        node.preview_child_comments || node.child_comments || null;
      if (Array.isArray(inlineReplies)) {
        for (const child of inlineReplies) {
          harvestCommentObject(child, true, norm.id);
        }
      }

      // Extract inline threaded replies (GraphQL)
      if (
        node.edge_threaded_comments &&
        Array.isArray(node.edge_threaded_comments.edges)
      ) {
        for (const edge of node.edge_threaded_comments.edges) {
          if (edge && edge.node) {
            harvestCommentObject(edge.node, true, norm.id);
          }
        }
      }
    }

    function walk(obj, depth) {
      if (!obj || typeof obj !== 'object' || depth > 28) return;
      if (visited.has(obj)) return;
      visited.add(obj);

      if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
          walk(obj[i], depth + 1);
        }
        return;
      }

      // Capture X-IG-App-ID if present in Relay config
      if (!postMeta.appId && typeof obj.appId === 'string' && /^\d{10,20}$/.test(obj.appId)) {
        postMeta.appId = obj.appId;
      }

      // Detect media item matching shortcode or mediaId
      const objCode = obj.code || obj.shortcode || null;
      const objRawPk = obj.pk || obj.media_id || obj.id || null;
      const objCleanPk =
        objRawPk && /^\d+(?:_\d+)?$/.test(String(objRawPk))
          ? String(objRawPk).split('_')[0]
          : null;

      const matchesShortcode =
        targetShortcode && objCode && String(objCode) === String(targetShortcode);
      const matchesMediaId =
        postMeta.mediaId &&
        objCleanPk &&
        String(objCleanPk) === String(postMeta.mediaId) &&
        (objCode || obj.caption !== undefined || obj.comment_count !== undefined);

      if (matchesShortcode || matchesMediaId || (!targetShortcode && !postMeta.mediaId && objCode && objCleanPk)) {
        if (objCleanPk && !postMeta.mediaId) postMeta.mediaId = objCleanPk;
        if (objCode && !postMeta.shortcode) postMeta.shortcode = String(objCode);

        const mediaUser = obj.user || obj.owner;
        if (mediaUser && mediaUser.username && !postMeta.ownerUsername) {
          postMeta.ownerUsername = String(mediaUser.username);
        }
        const countCandidate =
          obj.comment_count ??
          (obj.edge_media_to_parent_comment && obj.edge_media_to_parent_comment.count) ??
          (obj.edge_media_to_comment && obj.edge_media_to_comment.count) ??
          null;
        if (countCandidate != null && postMeta.commentCount == null) {
          postMeta.commentCount = Number(countCandidate);
        }
      }

      // Top-level api/v1 comments endpoint metadata
      if (obj.caption && typeof obj.caption === 'object') {
        if (!postMeta.captionText && typeof obj.caption.text === 'string') {
          if (!targetShortcode || matchesShortcode || Array.isArray(obj.comments)) {
            postMeta.captionText = obj.caption.text;
          }
        }
        if (
          !postMeta.ownerUsername &&
          obj.caption.user &&
          obj.caption.user.username &&
          Array.isArray(obj.comments)
        ) {
          postMeta.ownerUsername = String(obj.caption.user.username);
        }
      }
      if (Array.isArray(obj.comments) && typeof obj.comment_count === 'number') {
        if (postMeta.commentCount == null) {
          postMeta.commentCount = obj.comment_count;
        }
      }

      // Direct XDTCommentDict node
      if (obj.__typename === 'XDTCommentDict') {
        harvestCommentObject(obj, Boolean(obj.parent_comment_id), obj.parent_comment_id || null);
      }

      // Direct api/v1 arrays
      if (Array.isArray(obj.comments)) {
        for (const item of obj.comments) {
          harvestCommentObject(item, false, null);
        }
      }
      if (Array.isArray(obj.child_comments)) {
        const parentPk =
          (obj.parent_comment && (obj.parent_comment.pk || obj.parent_comment.id)) ||
          null;
        for (const item of obj.child_comments) {
          harvestCommentObject(item, true, parentPk);
        }
      }

      // Traverse keys carefully (skipping caption containers so captions aren't parsed as comments)
      for (const key of Object.keys(obj)) {
        if (
          key === 'caption' ||
          key === 'captions' ||
          key === 'edge_media_to_caption'
        ) {
          continue;
        }

        const val = obj[key];
        if (!val || typeof val !== 'object') continue;

        if (
          key === 'xdt_api__v1__media__media_id__comments__connection' ||
          key === 'edge_media_to_parent_comment' ||
          key === 'edge_media_to_comment'
        ) {
          if (typeof val.count === 'number' && postMeta.commentCount == null) {
            postMeta.commentCount = val.count;
          }
          if (Array.isArray(val.edges)) {
            for (const edge of val.edges) {
              if (edge && edge.node) {
                harvestCommentObject(edge.node, false, null);
              }
            }
          }
          continue;
        }

        if (
          key ===
            'xdt_api__v1__media__media_id__comments__parent_comment_id__child_comments__connection' ||
          key === 'edge_threaded_comments'
        ) {
          if (Array.isArray(val.edges)) {
            for (const edge of val.edges) {
              if (edge && edge.node) {
                harvestCommentObject(edge.node, true, edge.node.parent_comment_id || null);
              }
            }
          }
          continue;
        }

        walk(val, depth + 1);
      }
    }

    walk(payload, 0);

    return {
      postMeta,
      comments: Array.from(commentsMap.values()),
    };
  }

  /**
   * Parse comma/newline/space-separated username exclusions into a lowercase Set.
   */
  function parseUsernameSet(input) {
    const set = new Set();
    if (!input) return set;
    const rawList = Array.isArray(input)
      ? input
      : String(input).split(/[\s,;]+/);
    for (const item of rawList) {
      const cleaned = String(item || '').trim().replace(/^@/, '').toLowerCase();
      if (cleaned) set.add(cleaned);
    }
    return set;
  }

  /**
   * Filter comments according to giveaway rules FIRST, then build entries
   * (either 1 entry per unique user, or 1 entry per qualifying comment).
   *
   * Filtering BEFORE deduplicating ensures a user whose 2nd comment meets
   * the keyword/@mention rule is fairly included!
   */
  function filterAndBuildEntries(comments, rules = {}) {
    const {
      uniqueUsers = true,
      includeReplies = false,
      keyword = '',
      keywordMode = 'any', // 'any' | 'all'
      minMentions = 0,
      excludedUsers = [],
      alreadyWonUsers = [],
    } = rules;

    const excludedSet = parseUsernameSet(excludedUsers);
    const wonSet = parseUsernameSet(alreadyWonUsers);
    const requiredMentions = Math.max(0, Number(minMentions) || 0);

    const keywordTerms = String(keyword || '')
      .split(',')
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);

    const allComments = Array.isArray(comments) ? comments : [];
    const qualifyingComments = [];

    let skippedReplies = 0;
    let skippedExcluded = 0;
    let skippedKeyword = 0;
    let skippedMentions = 0;

    for (const c of allComments) {
      if (!c || !c.username || typeof c.text !== 'string') continue;
      const trimmedText = c.text.trim();
      if (!trimmedText) continue;

      if (!includeReplies && c.isReply) {
        skippedReplies++;
        continue;
      }

      const userLower = c.username.trim().replace(/^@/, '').toLowerCase();
      if (excludedSet.has(userLower) || wonSet.has(userLower)) {
        skippedExcluded++;
        continue;
      }

      if (keywordTerms.length > 0) {
        const lowerText = trimmedText.toLowerCase();
        const matches =
          keywordMode === 'all'
            ? keywordTerms.every((term) => lowerText.includes(term))
            : keywordTerms.some((term) => lowerText.includes(term));
        if (!matches) {
          skippedKeyword++;
          continue;
        }
      }

      const mentions = extractMentions(trimmedText, userLower);
      if (mentions.length < requiredMentions) {
        skippedMentions++;
        continue;
      }

      qualifyingComments.push({
        ...c,
        mentions,
      });
    }

    let entries = [];
    if (uniqueUsers) {
      const byUser = new Map();
      for (const qc of qualifyingComments) {
        const key = qc.username.toLowerCase();
        if (!byUser.has(key)) {
          byUser.set(key, {
            entryId: `user:${key}`,
            username: qc.username,
            fullName: qc.fullName || '',
            avatarUrl: qc.avatarUrl || '',
            primaryComment: qc,
            allQualifyingComments: [qc],
            qualifyingCount: 1,
          });
        } else {
          const group = byUser.get(key);
          group.allQualifyingComments.push(qc);
          group.qualifyingCount++;
          if (!group.avatarUrl && qc.avatarUrl) group.avatarUrl = qc.avatarUrl;
          if (!group.fullName && qc.fullName) group.fullName = qc.fullName;
        }
      }
      entries = Array.from(byUser.values());
    } else {
      entries = qualifyingComments.map((qc, idx) => ({
        entryId: `comment:${qc.id || idx}`,
        username: qc.username,
        fullName: qc.fullName || '',
        avatarUrl: qc.avatarUrl || '',
        primaryComment: qc,
        allQualifyingComments: [qc],
        qualifyingCount: 1,
      }));
    }

    const totalUniqueCommenters = new Set(
      allComments
        .filter((c) => c && c.username)
        .map((c) => c.username.toLowerCase())
    ).size;

    return {
      entries,
      qualifyingComments,
      stats: {
        totalComments: allComments.length,
        totalUniqueCommenters,
        qualifyingCommentCount: qualifyingComments.length,
        eligibleEntriesCount: entries.length,
        skippedReplies,
        skippedExcluded,
        skippedKeyword,
        skippedMentions,
      },
    };
  }

  /**
   * Unbiased cryptographically secure random winner draw using rejection sampling.
   */
  function pickRandomEntry(entries, customRandomUint32 = null) {
    if (!Array.isArray(entries) || entries.length === 0) return null;
    if (entries.length === 1) {
      return { winner: entries[0], index: 0 };
    }

    const getUint32 =
      typeof customRandomUint32 === 'function'
        ? customRandomUint32
        : () => {
            if (root.crypto && typeof root.crypto.getRandomValues === 'function') {
              const arr = new Uint32Array(1);
              root.crypto.getRandomValues(arr);
              return arr[0];
            }
            // Node.js crypto fallback
            if (typeof require === 'function') {
              const nodeCrypto = require('crypto');
              return nodeCrypto.randomBytes(4).readUInt32BE(0);
            }
            return Math.floor(Math.random() * 0x100000000);
          };

    const n = entries.length;
    const maxUnbiased = Math.floor(0x100000000 / n) * n;
    let rand;
    do {
      rand = getUint32() >>> 0;
    } while (rand >= maxUnbiased);

    const index = rand % n;
    return {
      winner: entries[index],
      index,
    };
  }

  /**
   * Parse pasted plain-text or CSV/JSON comment exports so users can also
   * use the Winner Studio standalone with exported/copied comment lists.
   */
  function parseManualCommentsInput(rawText) {
    if (!rawText || typeof rawText !== 'string') return [];
    const trimmed = rawText.trim();
    if (!trimmed) return [];

    // 1. Try JSON first (either array of comments or Instagram raw JSON dump)
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          const direct = [];
          for (let i = 0; i < parsed.length; i++) {
            const item = parsed[i];
            if (!item || typeof item !== 'object') continue;
            const username =
              item.username ||
              item.user?.username ||
              item.owner?.username ||
              item.author ||
              null;
            const text =
              item.text ?? item.comment ?? item.body ?? item.message ?? null;
            if (username && text != null) {
              direct.push({
                id: String(item.id || item.pk || `manual_${i + 1}`),
                username: String(username).trim().replace(/^@/, ''),
                fullName: String(item.fullName || item.full_name || ''),
                avatarUrl: String(item.avatarUrl || item.profile_pic_url || ''),
                text: String(text),
                createdAt: item.createdAt || item.created_at || null,
                likes: Number(item.likes || item.like_count || 0) || 0,
                isReply: Boolean(item.isReply || item.is_reply || item.parentId),
                parentId: item.parentId || null,
                childCommentCount: 0,
                mediaId: null,
              });
            }
          }
          if (direct.length > 0) return direct;
        }
        const extracted = parsePayloadForInstagramData(parsed);
        if (extracted.comments.length > 0) return extracted.comments;
      } catch {
        // Fall through to CSV / line-by-line parsing
      }
    }

    // 2. Try CSV or "username: comment" / "@username - comment" line format
    const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return [];

    const results = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // Skip common CSV header row
      if (
        i === 0 &&
        /^(?:"?username"?|"?user"?|"?author"?)\s*[,;\t]\s*(?:"?comment"?|"?text"?)/i.test(
          line
        )
      ) {
        continue;
      }

      // Match CSV: "username","comment text" or username,comment text
      const csvMatch = line.match(
        /^(?:"([^"]+)"|([^,;\t:]+))\s*[,;\t:]\s*(.+)$/
      );
      if (csvMatch) {
        const rawUser = (csvMatch[1] || csvMatch[2] || '').trim().replace(/^@/, '');
        let text = csvMatch[3].trim();
        if (text.startsWith('"') && text.endsWith('"') && text.length >= 2) {
          text = text.slice(1, -1).replace(/""/g, '"');
        }
        if (rawUser && /^[a-zA-Z0-9._]{1,30}$/.test(rawUser) && text) {
          results.push({
            id: `manual_${i + 1}`,
            username: rawUser,
            fullName: '',
            avatarUrl: '',
            text,
            createdAt: null,
            likes: 0,
            isReply: false,
            parentId: null,
            childCommentCount: 0,
            mediaId: null,
          });
          continue;
        }
      }
    }

    return results;
  }

  const api = {
    SHORTCODE_ALPHABET,
    extractShortcodeFromUrl,
    shortcodeToMediaId,
    extractMentions,
    normalizeCommentNode,
    parsePayloadForInstagramData,
    filterAndBuildEntries,
    pickRandomEntry,
    parseManualCommentsInput,
  };

  root.__InstaLuckyParser = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
