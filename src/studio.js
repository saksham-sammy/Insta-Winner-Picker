/**
 * Insta Lucky Winner Picker — Studio Application Controller
 * Works both inside the Chrome/Edge Extension and standalone in any browser.
 */
(function () {
  const Parser = window.__InstaLuckyParser;

  // State
  let currentDataset = {
    shortcode: null,
    postUrl: null,
    postMeta: { ownerUsername: null, commentCount: null },
    comments: [],
  };

  let rules = {
    uniqueUsers: true,
    includeReplies: false,
    keyword: '',
    keywordMode: 'any',
    minMentions: 0,
    excludedUsers: '',
  };

  let drawHistory = []; // Array of { rank, entry, poolSize, drawnAt }
  let activeWinnerRecord = null;
  let computedPool = { entries: [], qualifyingComments: [], stats: emptyStats() };
  let activeExplorerTab = 'eligible'; // 'eligible' | 'all'
  let isSpinning = false;

  function emptyStats() {
    return {
      totalComments: 0,
      totalUniqueCommenters: 0,
      qualifyingCommentCount: 0,
      eligibleEntriesCount: 0,
      skippedReplies: 0,
      skippedExcluded: 0,
      skippedKeyword: 0,
      skippedMentions: 0,
    };
  }

  // DOM Elements
  const postSourceLabel = document.getElementById('postSourceLabel');
  const postExternalLink = document.getElementById('postExternalLink');
  const loadDemoBtn = document.getElementById('loadDemoBtn');
  const openImportModalBtn = document.getElementById('openImportModalBtn');
  const exportCsvBtn = document.getElementById('exportCsvBtn');

  const statTotalComments = document.getElementById('statTotalComments');
  const statUniqueUsers = document.getElementById('statUniqueUsers');
  const statQualifyingComments = document.getElementById('statQualifyingComments');
  const statEligibleEntries = document.getElementById('statEligibleEntries');

  const resetFiltersBtn = document.getElementById('resetFiltersBtn');
  const modeUniqueBtn = document.getElementById('modeUniqueBtn');
  const modeAllBtn = document.getElementById('modeAllBtn');
  const keywordInput = document.getElementById('keywordInput');
  const keywordModeSelect = document.getElementById('keywordModeSelect');
  const minMentionsInput = document.getElementById('minMentionsInput');
  const mentionsDecBtn = document.getElementById('mentionsDecBtn');
  const mentionsIncBtn = document.getElementById('mentionsIncBtn');
  const excludeUsersInput = document.getElementById('excludeUsersInput');
  const addOwnerExcludeBtn = document.getElementById('addOwnerExcludeBtn');
  const includeRepliesCheck = document.getElementById('includeRepliesCheck');
  const replyCountHint = document.getElementById('replyCountHint');
  const animateSpinCheck = document.getElementById('animateSpinCheck');
  const filterSummaryBox = document.getElementById('filterSummaryBox');

  const stageIdle = document.getElementById('stageIdle');
  const stageReadyTitle = document.getElementById('stageReadyTitle');
  const stageReadySub = document.getElementById('stageReadySub');
  const pickWinnerPrimaryBtn = document.getElementById('pickWinnerPrimaryBtn');

  const stageSpinning = document.getElementById('stageSpinning');
  const slotTickerHandle = document.getElementById('slotTickerHandle');
  const slotTickerComment = document.getElementById('slotTickerComment');

  const stageWinner = document.getElementById('stageWinner');
  const winnerAvatarInitial = document.getElementById('winnerAvatarInitial');
  const winnerAvatarImg = document.getElementById('winnerAvatarImg');
  const winnerUsernameLink = document.getElementById('winnerUsernameLink');
  const winnerFullName = document.getElementById('winnerFullName');
  const winnerOddsChip = document.getElementById('winnerOddsChip');
  const winnerQualCountChip = document.getElementById('winnerQualCountChip');
  const winnerTimestamp = document.getElementById('winnerTimestamp');
  const winnerCommentText = document.getElementById('winnerCommentText');
  const winnerMentionsRow = document.getElementById('winnerMentionsRow');
  const allUserCommentsDetails = document.getElementById('allUserCommentsDetails');
  const allUserCommentsSummary = document.getElementById('allUserCommentsSummary');
  const allUserCommentsList = document.getElementById('allUserCommentsList');
  const pickBackupWinnerBtn = document.getElementById('pickBackupWinnerBtn');
  const redrawFreshBtn = document.getElementById('redrawFreshBtn');
  const copyWinnerBtn = document.getElementById('copyWinnerBtn');

  const historySection = document.getElementById('historySection');
  const historyCount = document.getElementById('historyCount');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');
  const historyList = document.getElementById('historyList');

  const tabEligibleBtn = document.getElementById('tabEligibleBtn');
  const tabAllCommentsBtn = document.getElementById('tabAllCommentsBtn');
  const tabEligibleCount = document.getElementById('tabEligibleCount');
  const tabAllCount = document.getElementById('tabAllCount');
  const searchInput = document.getElementById('searchInput');
  const commentsTableBody = document.getElementById('commentsTableBody');
  const tablePaginationNote = document.getElementById('tablePaginationNote');

  // Modal Elements
  const importModal = document.getElementById('importModal');
  const closeImportModalBtn = document.getElementById('closeImportModalBtn');
  const cancelImportBtn = document.getElementById('cancelImportBtn');
  const confirmImportBtn = document.getElementById('confirmImportBtn');
  const importFileInput = document.getElementById('importFileInput');
  const importTextarea = document.getElementById('importTextarea');
  const importErrorMsg = document.getElementById('importErrorMsg');

  // Direct Link Reader Elements
  const directLinkBanner = document.getElementById('directLinkBanner');
  const openSessionModalBtn = document.getElementById('openSessionModalBtn');
  const sessionStatusDot = document.getElementById('sessionStatusDot');
  const sessionStatusText = document.getElementById('sessionStatusText');
  const directPostUrlInput = document.getElementById('directPostUrlInput');
  const clearDirectUrlBtn = document.getElementById('clearDirectUrlBtn');
  const directIncludeRepliesCheck = document.getElementById('directIncludeRepliesCheck');
  const directFetchCommentsBtn = document.getElementById('directFetchCommentsBtn');
  const directStopSyncBtn = document.getElementById('directStopSyncBtn');
  const directSyncStatusWrap = document.getElementById('directSyncStatusWrap');
  const directSyncSpinner = document.getElementById('directSyncSpinner');
  const directSyncStatusMsg = document.getElementById('directSyncStatusMsg');
  const directProgressBarTrack = document.getElementById('directProgressBarTrack');
  const directProgressBarFill = document.getElementById('directProgressBarFill');

  // Cache Notice Elements
  const cacheNoticeBanner = document.getElementById('cacheNoticeBanner');
  const cacheCountText = document.getElementById('cacheCountText');
  const cacheDateText = document.getElementById('cacheDateText');
  const forceSyncNewBtn = document.getElementById('forceSyncNewBtn');
  const clearCacheBtn = document.getElementById('clearCacheBtn');

  // Session Modal Elements
  const sessionModal = document.getElementById('sessionModal');
  const sessionModalTitle = document.getElementById('sessionModalTitle');
  const closeSessionModalBtn = document.getElementById('closeSessionModalBtn');
  const cancelSessionModalBtn = document.getElementById('cancelSessionModalBtn');
  const saveSessionBtn = document.getElementById('saveSessionBtn');
  const disconnectSessionBtn = document.getElementById('disconnectSessionBtn');
  const autoDetectSessionBtn = document.getElementById('autoDetectSessionBtn');
  const sessionActiveInfo = document.getElementById('sessionActiveInfo');
  const connectedUsernameLabel = document.getElementById('connectedUsernameLabel');
  const sessionIdInput = document.getElementById('sessionIdInput');
  const toggleSessionVisibilityBtn = document.getElementById('toggleSessionVisibilityBtn');
  const sessionErrorMsg = document.getElementById('sessionErrorMsg');
  const sessionSuccessMsg = document.getElementById('sessionSuccessMsg');

  const toastEl = document.getElementById('toast');
  let toastTimer = null;

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.remove('hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 2600);
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDate(unixSeconds) {
    if (!unixSeconds) return '';
    try {
      const d = new Date(Number(unixSeconds) * 1000);
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  }

  /**
   * Apply a newly loaded dataset, auto-excluding the post author by default.
   */
  function applyDataset(dataset, sourceDescription = null) {
    if (!dataset || !Array.isArray(dataset.comments)) return;

    const prevShortcode = currentDataset.shortcode;
    currentDataset = {
      shortcode: dataset.shortcode || null,
      postUrl: dataset.postUrl || null,
      postMeta: dataset.postMeta || {},
      comments: dataset.comments,
    };

    // Reset draw history when switching to a brand new post
    if (dataset.shortcode !== prevShortcode || sourceDescription) {
      drawHistory = [];
      activeWinnerRecord = null;
    }

    const owner = currentDataset.postMeta && currentDataset.postMeta.ownerUsername;
    if (owner) {
      // Auto-populate post author in excluded list if currently empty or from previous post
      if (!excludeUsersInput.value.trim() || dataset.shortcode !== prevShortcode) {
        excludeUsersInput.value = owner;
        rules.excludedUsers = owner;
      }
      addOwnerExcludeBtn.textContent = `+ Exclude @${owner}`;
      addOwnerExcludeBtn.classList.remove('hidden');
    } else {
      addOwnerExcludeBtn.classList.add('hidden');
    }

    // Update topbar context
    if (sourceDescription) {
      postSourceLabel.textContent = sourceDescription;
    } else if (currentDataset.shortcode && currentDataset.shortcode !== '__unknown__') {
      const ownerPrefix = owner ? `@${owner} • ` : '';
      postSourceLabel.textContent = `${ownerPrefix}Post /p/${currentDataset.shortcode} (${currentDataset.comments.length.toLocaleString()} comments)`;
    } else {
      postSourceLabel.textContent = `Loaded ${currentDataset.comments.length.toLocaleString()} comments`;
    }

    if (currentDataset.postUrl && currentDataset.postUrl.startsWith('http')) {
      postExternalLink.href = currentDataset.postUrl;
      postExternalLink.classList.remove('hidden');
    } else {
      postExternalLink.classList.add('hidden');
    }

    const replyCount = currentDataset.comments.filter((c) => c && c.isReply).length;
    replyCountHint.textContent = replyCount > 0 ? `(${replyCount.toLocaleString()} found)` : '(0)';

    exportCsvBtn.disabled = currentDataset.comments.length === 0;

    recomputeAndRender();
  }

  function syncRulesFromInputs() {
    rules.keyword = keywordInput.value;
    rules.keywordMode = keywordModeSelect.value;
    rules.minMentions = Math.max(0, parseInt(minMentionsInput.value, 10) || 0);
    rules.excludedUsers = excludeUsersInput.value;
    rules.includeReplies = includeRepliesCheck.checked;
  }

  function recomputeAndRender(excludeDrawnWinners = false) {
    syncRulesFromInputs();

    const alreadyWonUsers = excludeDrawnWinners
      ? drawHistory.map((h) => h.entry.username)
      : [];

    computedPool = Parser.filterAndBuildEntries(currentDataset.comments, {
      ...rules,
      alreadyWonUsers,
    });

    const s = computedPool.stats;
    statTotalComments.textContent = s.totalComments.toLocaleString();
    statUniqueUsers.textContent = s.totalUniqueCommenters.toLocaleString();
    statQualifyingComments.textContent = s.qualifyingCommentCount.toLocaleString();
    statEligibleEntries.textContent = s.eligibleEntriesCount.toLocaleString();

    tabEligibleCount.textContent = s.eligibleEntriesCount.toLocaleString();
    tabAllCount.textContent = s.totalComments.toLocaleString();

    // Filter breakdown summary
    if (s.totalComments === 0) {
      filterSummaryBox.textContent = 'No comments loaded yet.';
    } else {
      const notes = [];
      if (s.skippedReplies > 0) notes.push(`${s.skippedReplies} replies excluded`);
      if (s.skippedExcluded > 0) notes.push(`${s.skippedExcluded} excluded users`);
      if (s.skippedKeyword > 0) notes.push(`${s.skippedKeyword} missing keyword`);
      if (s.skippedMentions > 0) notes.push(`${s.skippedMentions} missing @mentions`);
      const deduped = s.qualifyingCommentCount - s.eligibleEntriesCount;
      if (rules.uniqueUsers && deduped > 0) {
        notes.push(`${deduped} extra comments merged by unique user`);
      }
      filterSummaryBox.textContent =
        notes.length > 0
          ? `Filtered out: ${notes.join(' • ')}.`
          : `All ${s.eligibleEntriesCount.toLocaleString()} entries qualify with current rules.`;
    }

    renderStage();
    renderHistory();
    renderTable();
  }

  function renderStage() {
    if (isSpinning) return;

    if (activeWinnerRecord) {
      stageIdle.classList.add('hidden');
      stageSpinning.classList.add('hidden');
      stageWinner.classList.remove('hidden');

      const { entry, poolSize, drawnAt } = activeWinnerRecord;
      const qc = entry.primaryComment;

      winnerAvatarInitial.textContent = (entry.username[0] || 'W').toUpperCase();
      if (entry.avatarUrl) {
        winnerAvatarImg.src = entry.avatarUrl;
        winnerAvatarImg.classList.remove('hidden');
      } else {
        winnerAvatarImg.classList.add('hidden');
      }

      winnerUsernameLink.textContent = `@${entry.username}`;
      winnerUsernameLink.href = `https://www.instagram.com/${encodeURIComponent(entry.username)}/`;
      winnerFullName.textContent = entry.fullName || '';

      winnerOddsChip.textContent = `1 in ${poolSize.toLocaleString()} eligible pool`;
      winnerQualCountChip.textContent =
        entry.qualifyingCount > 1
          ? `${entry.qualifyingCount} qualifying comments`
          : '1 qualifying comment';

      const commentTime = formatDate(qc.createdAt);
      winnerTimestamp.textContent = commentTime || `Drawn ${new Date(drawnAt).toLocaleTimeString()}`;
      winnerCommentText.textContent = qc.text;

      if (qc.mentions && qc.mentions.length > 0) {
        winnerMentionsRow.innerHTML = qc.mentions
          .map((m) => `<span class="mention-tag">@${escapeHtml(m)}</span>`)
          .join('');
        winnerMentionsRow.classList.remove('hidden');
      } else {
        winnerMentionsRow.classList.add('hidden');
      }

      if (entry.allQualifyingComments && entry.allQualifyingComments.length > 1) {
        allUserCommentsSummary.textContent = `View all ${entry.allQualifyingComments.length} qualifying comments by @${entry.username}`;
        allUserCommentsList.innerHTML = entry.allQualifyingComments
          .map((c) => `<li>${escapeHtml(c.text)}</li>`)
          .join('');
        allUserCommentsDetails.classList.remove('hidden');
      } else {
        allUserCommentsDetails.classList.add('hidden');
      }

      // Check if backup draw has remaining candidates
      const remainingPool = Parser.filterAndBuildEntries(currentDataset.comments, {
        ...rules,
        alreadyWonUsers: drawHistory.map((h) => h.entry.username),
      });
      pickBackupWinnerBtn.disabled = remainingPool.entries.length === 0;
      return;
    }

    // Idle state
    stageWinner.classList.add('hidden');
    stageSpinning.classList.add('hidden');
    stageIdle.classList.remove('hidden');

    const count = computedPool.entries.length;
    if (currentDataset.comments.length === 0) {
      stageReadyTitle.textContent = 'Ready to Pick a Lucky Winner';
      stageReadySub.innerHTML =
        'Open an Instagram post and click the extension icon to read all comments, or click <strong>Load Sample Giveaway</strong> above to test.';
      pickWinnerPrimaryBtn.disabled = true;
    } else if (count === 0) {
      stageReadyTitle.textContent = '0 Eligible Entries Match Filters';
      stageReadySub.textContent =
        'Relax your keyword, @mentions, or username exclusion filters on the left to restore eligible entries.';
      pickWinnerPrimaryBtn.disabled = true;
    } else {
      stageReadyTitle.textContent = `${count.toLocaleString()} Eligible ${count === 1 ? 'Entry' : 'Entries'} Ready`;
      stageReadySub.textContent = rules.uniqueUsers
        ? 'Each unique qualifying commenter has an equal 1-ticket chance via Web Crypto CSPRNG.'
        : 'Each qualifying comment counts as 1 ticket in the draw.';
      pickWinnerPrimaryBtn.disabled = false;
    }
  }

  winnerAvatarImg.addEventListener('error', () => {
    winnerAvatarImg.classList.add('hidden');
  });

  function renderHistory() {
    if (drawHistory.length === 0) {
      historySection.classList.add('hidden');
      return;
    }
    historySection.classList.remove('hidden');
    historyCount.textContent = String(drawHistory.length);
    historyList.innerHTML = drawHistory
      .map(
        (item) => `
        <div class="history-pill">
          <span class="history-rank">#${item.rank}</span>
          <a class="user-link" href="https://www.instagram.com/${encodeURIComponent(item.entry.username)}/" target="_blank" rel="noopener noreferrer">@${escapeHtml(item.entry.username)}</a>
          <span style="color: var(--muted); font-size: 11px;">(1/${item.poolSize})</span>
        </div>
      `
      )
      .join('');
  }

  /**
   * Perform the winner draw (either fresh draw or backup draw excluding already-drawn users).
   */
  async function executeWinnerDraw({ excludePreviousWinners = false } = {}) {
    if (isSpinning) return;

    if (!excludePreviousWinners) {
      drawHistory = [];
    }

    syncRulesFromInputs();
    const alreadyWonUsers = excludePreviousWinners
      ? drawHistory.map((h) => h.entry.username)
      : [];

    const drawPool = Parser.filterAndBuildEntries(currentDataset.comments, {
      ...rules,
      alreadyWonUsers,
    });

    if (drawPool.entries.length === 0) {
      showToast('No remaining eligible entries to draw from!');
      return;
    }

    // Cryptographically pick the true winner right away
    const chosen = Parser.pickRandomEntry(drawPool.entries);
    if (!chosen) return;

    if (animateSpinCheck.checked && drawPool.entries.length > 1) {
      isSpinning = true;
      stageIdle.classList.add('hidden');
      stageWinner.classList.add('hidden');
      stageSpinning.classList.remove('hidden');

      const durationMs = 2700;
      const start = performance.now();
      let lastSwap = 0;

      await new Promise((resolve) => {
        function frame(now) {
          const elapsed = now - start;
          const progress = Math.min(1, elapsed / durationMs);
          // Ease out interval: starts fast (45ms), slows down to 280ms near end
          const interval = 45 + Math.pow(progress, 2.4) * 240;

          if (now - lastSwap >= interval) {
            lastSwap = now;
            const randomPreview =
              drawPool.entries[Math.floor(Math.random() * drawPool.entries.length)];
            slotTickerHandle.textContent = `@${randomPreview.username}`;
            slotTickerComment.textContent = randomPreview.primaryComment.text;
          }

          if (progress < 1) {
            requestAnimationFrame(frame);
          } else {
            slotTickerHandle.textContent = `@${chosen.winner.username}`;
            slotTickerComment.textContent = chosen.winner.primaryComment.text;
            setTimeout(resolve, 260);
          }
        }
        requestAnimationFrame(frame);
      });

      isSpinning = false;
    }

    const record = {
      rank: drawHistory.length + 1,
      entry: chosen.winner,
      poolSize: drawPool.entries.length,
      drawnAt: Date.now(),
    };
    drawHistory.push(record);
    activeWinnerRecord = record;

    recomputeAndRender(false);
    launchConfetti();
  }

  /**
   * Render Explorer Table (capped at 500 rendered DOM rows for instant responsiveness,
   * while searching filters across 100% of items in memory).
   */
  function renderTable() {
    const query = searchInput.value.trim().toLowerCase();
    const MAX_RENDER = 500;

    if (currentDataset.comments.length === 0) {
      commentsTableBody.innerHTML = `
        <tr>
          <td colspan="5" class="empty-cell">
            No comments loaded yet. Collect comments from an Instagram post via the extension icon, or click <strong>Load Sample Giveaway</strong>.
          </td>
        </tr>`;
      tablePaginationNote.classList.add('hidden');
      return;
    }

    if (activeExplorerTab === 'eligible') {
      const filtered = computedPool.entries.filter((e) => {
        if (!query) return true;
        return (
          e.username.toLowerCase().includes(query) ||
          e.primaryComment.text.toLowerCase().includes(query)
        );
      });

      if (filtered.length === 0) {
        commentsTableBody.innerHTML = `
          <tr>
            <td colspan="5" class="empty-cell">No eligible entries match your search/filters.</td>
          </tr>`;
        tablePaginationNote.classList.add('hidden');
        return;
      }

      const slice = filtered.slice(0, MAX_RENDER);
      commentsTableBody.innerHTML = slice
        .map((e, idx) => {
          const mentions = e.primaryComment.mentions || [];
          const mentionsStr =
            mentions.length > 0
              ? mentions.map((m) => `@${escapeHtml(m)}`).join(', ')
              : '—';
          const badge =
            e.qualifyingCount > 1
              ? `Eligible (${e.qualifyingCount} comments merged)`
              : 'Eligible (1 entry)';

          return `
            <tr>
              <td>${idx + 1}</td>
              <td>
                <a class="user-link" href="https://www.instagram.com/${encodeURIComponent(e.username)}/" target="_blank" rel="noopener noreferrer">@${escapeHtml(e.username)}</a>
              </td>
              <td>${escapeHtml(e.primaryComment.text)}</td>
              <td>${mentionsStr}</td>
              <td><span class="status-pill ok">${badge}</span></td>
            </tr>`;
        })
        .join('');

      if (filtered.length > MAX_RENDER) {
        tablePaginationNote.textContent = `Showing first ${MAX_RENDER.toLocaleString()} of ${filtered.length.toLocaleString()} eligible entries (use search or Export CSV to view all).`;
        tablePaginationNote.classList.remove('hidden');
      } else {
        tablePaginationNote.classList.add('hidden');
      }
    } else {
      // 'all' tab: show every comment + exact eligibility diagnosis!
      const excludedSet = new Set(
        String(rules.excludedUsers || '')
          .split(/[\s,;]+/)
          .map((u) => u.trim().replace(/^@/, '').toLowerCase())
          .filter(Boolean)
      );
      const keywordTerms = String(rules.keyword || '')
        .split(',')
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean);
      const seenQualifyingUser = new Set();

      const diagnosed = currentDataset.comments.map((c) => {
        const mentions = Parser.extractMentions(c.text, c.username);
        const userLower = c.username.toLowerCase();
        let ok = true;
        let reason = 'Eligible';

        if (!rules.includeReplies && c.isReply) {
          ok = false;
          reason = 'Excluded (Reply)';
        } else if (excludedSet.has(userLower)) {
          ok = false;
          reason = 'Excluded Username';
        } else if (keywordTerms.length > 0) {
          const lt = c.text.toLowerCase();
          const match =
            rules.keywordMode === 'all'
              ? keywordTerms.every((t) => lt.includes(t))
              : keywordTerms.some((t) => lt.includes(t));
          if (!match) {
            ok = false;
            reason = 'Missing Keyword';
          }
        }
        if (ok && mentions.length < rules.minMentions) {
          ok = false;
          reason = `Mentions (${mentions.length}/${rules.minMentions})`;
        }
        if (ok && rules.uniqueUsers) {
          if (seenQualifyingUser.has(userLower)) {
            ok = false;
            reason = 'Duplicate User (Merged)';
          } else {
            seenQualifyingUser.add(userLower);
          }
        }

        return { c, mentions, ok, reason };
      });

      const filtered = diagnosed.filter(({ c }) => {
        if (!query) return true;
        return (
          c.username.toLowerCase().includes(query) ||
          c.text.toLowerCase().includes(query)
        );
      });

      if (filtered.length === 0) {
        commentsTableBody.innerHTML = `
          <tr>
            <td colspan="5" class="empty-cell">No comments match your search.</td>
          </tr>`;
        tablePaginationNote.classList.add('hidden');
        return;
      }

      const slice = filtered.slice(0, MAX_RENDER);
      commentsTableBody.innerHTML = slice
        .map(({ c, mentions, ok, reason }, idx) => {
          const mentionsStr =
            mentions.length > 0
              ? mentions.map((m) => `@${escapeHtml(m)}`).join(', ')
              : '—';
          return `
            <tr>
              <td>${idx + 1}</td>
              <td>
                <a class="user-link" href="https://www.instagram.com/${encodeURIComponent(c.username)}/" target="_blank" rel="noopener noreferrer">@${escapeHtml(c.username)}</a>
              </td>
              <td>${escapeHtml(c.text)}</td>
              <td>${mentionsStr}</td>
              <td><span class="status-pill ${ok ? 'ok' : 'skip'}">${escapeHtml(reason)}</span></td>
            </tr>`;
        })
        .join('');

      if (filtered.length > MAX_RENDER) {
        tablePaginationNote.textContent = `Showing first ${MAX_RENDER.toLocaleString()} of ${filtered.length.toLocaleString()} comments (Export CSV for full dataset).`;
        tablePaginationNote.classList.remove('hidden');
      } else {
        tablePaginationNote.classList.add('hidden');
      }
    }
  }

  /**
   * Lightweight 60fps Canvas Confetti Celebration
   */
  function launchConfetti() {
    const canvas = document.getElementById('confettiCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ['#f58529', '#dd2a7b', '#8134af', '#10b981', '#fbbf24', '#38bdf8'];
    const pieces = Array.from({ length: 110 }, () => ({
      x: canvas.width * 0.5 + (Math.random() - 0.5) * 260,
      y: canvas.height * 0.38,
      vx: (Math.random() - 0.5) * 16,
      vy: -Math.random() * 14 - 4,
      size: 6 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * Math.PI * 2,
      vRot: (Math.random() - 0.5) * 0.25,
    }));

    let frameCount = 0;
    function tick() {
      frameCount++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      for (const p of pieces) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.34;
        p.vx *= 0.99;
        p.rot += p.vRot;
        if (p.y < canvas.height + 20) alive = true;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
      if (alive && frameCount < 200) {
        requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    requestAnimationFrame(tick);
  }

  /**
   * Generate realistic sample Instagram giveaway post comments for 1-click demo/testing.
   */
  function generateSampleGiveawayDataset() {
    const now = Math.floor(Date.now() / 1000);
    const sampleComments = [
      { id: 's1', username: 'glowstudio_official', text: 'Drop 2 friends below + #glowgiveaway to win our Summer Kit! ✨', createdAt: now - 86400, isReply: false },
      { id: 's2', username: 'priya.sharma', text: 'Omg been waiting for this!! @neha_k @arjun.dev #glowgiveaway 🔥', createdAt: now - 82000, isReply: false },
      { id: 's3', username: 'priya.sharma', text: 'Fingers crossed!! 🤞✨ #glowgiveaway', createdAt: now - 81500, isReply: false },
      { id: 's4', username: 'alex_designs', text: 'Amazing bundle! Checking in with @sara.lee and @mike_ross #glowgiveaway', createdAt: now - 79000, isReply: false },
      { id: 's5', username: 'rohan_fit', text: 'First comment forgot tags haha', createdAt: now - 76000, isReply: false },
      { id: 's6', username: 'rohan_fit', text: 'Tagging @kabir_99 @vikram.s #glowgiveaway lets go!!', createdAt: now - 75800, isReply: false },
      { id: 's7', username: 'maya.patel', text: '@zoya_art @isha.blogs we need this kit! #glowgiveaway 💖', createdAt: now - 70000, isReply: false },
      { id: 's8', username: 'zoya_art', text: '@maya.patel yesssManifesting for us!!', createdAt: now - 69200, isReply: true, parentId: 's7' },
      { id: 's9', username: 'daniel.kim', text: 'Count me in! @lucas_w @chloe.chen @emma_stone #glowgiveaway', createdAt: now - 64000, isReply: false },
      { id: 's10', username: 'ananya_music', text: 'So aesthetic 😍 @riya.dance @tanvi_vibes #glowgiveaway', createdAt: now - 58000, isReply: false },
      { id: 's11', username: 'sneaky_self_tagger', text: 'Hope I win @sneaky_self_tagger @sneaky_self_tagger #glowgiveaway', createdAt: now - 54000, isReply: false },
      { id: 's12', username: 'liam.oconnor', text: '@noah_smith @olivia.jones check this out! #glowgiveaway', createdAt: now - 49000, isReply: false },
      { id: 's13', username: 'kavya_reads', text: 'Best products ever! @aditi.b @meera_nair #glowgiveaway 🌟', createdAt: now - 42000, isReply: false },
      { id: 's14', username: 'carlos.mendez', text: 'Vamos!! @sofia_g @mateo.r #glowgiveaway', createdAt: now - 36000, isReply: false },
      { id: 's15', username: 'hana_tanaka', text: 'Love everything you make! @yuki.s @ren_k #glowgiveaway 🌸', createdAt: now - 28000, isReply: false },
      { id: 's16', username: 'samir_tech', text: 'Awesome giveaway! @dev_patel @nikhil.ai #glowgiveaway', createdAt: now - 19000, isReply: false },
      { id: 's17', username: 'elena.rossi', text: 'Dream giveaway ✨ @giulia_m @marco.v #glowgiveaway', createdAt: now - 12000, isReply: false },
      { id: 's18', username: 'tara_bakes', text: 'Would love to win this! @simran.k #glowgiveaway', createdAt: now - 7000, isReply: false },
    ];

    return {
      shortcode: 'DEMO_GIVEAWAY',
      postUrl: 'https://www.instagram.com/',
      postMeta: {
        ownerUsername: 'glowstudio_official',
        commentCount: sampleComments.length,
      },
      comments: sampleComments,
    };
  }

  /**
   * Export all read comments + current filter eligibility to CSV.
   */
  function exportCommentsToCsv() {
    if (currentDataset.comments.length === 0) return;

    const qualifiedIds = new Set(computedPool.qualifyingComments.map((c) => c.id));
    const header = [
      'comment_id',
      'username',
      'text',
      'mentions_count',
      'is_reply',
      'likes',
      'created_at_iso',
      'matches_current_filters',
    ];

    const escapeCsv = (val) => {
      const str = String(val ?? '');
      if (/[",\r\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = currentDataset.comments.map((c) => {
      const mentions = Parser.extractMentions(c.text, c.username);
      const iso = c.createdAt ? new Date(c.createdAt * 1000).toISOString() : '';
      return [
        c.id,
        c.username,
        c.text,
        mentions.length,
        c.isReply ? 'true' : 'false',
        c.likes || 0,
        iso,
        qualifiedIds.has(c.id) ? 'true' : 'false',
      ]
        .map(escapeCsv)
        .join(',');
    });

    const csvContent = '\uFEFF' + [header.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const sc = currentDataset.shortcode || 'export';
    a.download = `insta-comments-${sc}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Exported CSV successfully!');
  }

  // Event Listeners
  modeUniqueBtn.addEventListener('click', () => {
    rules.uniqueUsers = true;
    modeUniqueBtn.classList.add('active');
    modeAllBtn.classList.remove('active');
    activeWinnerRecord = null;
    recomputeAndRender();
  });

  modeAllBtn.addEventListener('click', () => {
    rules.uniqueUsers = false;
    modeAllBtn.classList.add('active');
    modeUniqueBtn.classList.remove('active');
    activeWinnerRecord = null;
    recomputeAndRender();
  });

  keywordInput.addEventListener('input', () => {
    activeWinnerRecord = null;
    recomputeAndRender();
  });

  keywordModeSelect.addEventListener('change', () => {
    activeWinnerRecord = null;
    recomputeAndRender();
  });

  minMentionsInput.addEventListener('input', () => {
    activeWinnerRecord = null;
    recomputeAndRender();
  });

  mentionsDecBtn.addEventListener('click', () => {
    const val = Math.max(0, (parseInt(minMentionsInput.value, 10) || 0) - 1);
    minMentionsInput.value = String(val);
    activeWinnerRecord = null;
    recomputeAndRender();
  });

  mentionsIncBtn.addEventListener('click', () => {
    const val = Math.min(20, (parseInt(minMentionsInput.value, 10) || 0) + 1);
    minMentionsInput.value = String(val);
    activeWinnerRecord = null;
    recomputeAndRender();
  });

  excludeUsersInput.addEventListener('input', () => {
    activeWinnerRecord = null;
    recomputeAndRender();
  });

  addOwnerExcludeBtn.addEventListener('click', () => {
    const owner = currentDataset.postMeta && currentDataset.postMeta.ownerUsername;
    if (!owner) return;
    const current = excludeUsersInput.value.trim();
    if (!current.toLowerCase().includes(owner.toLowerCase())) {
      excludeUsersInput.value = current ? `${current}, ${owner}` : owner;
      activeWinnerRecord = null;
      recomputeAndRender();
    }
  });

  includeRepliesCheck.addEventListener('change', () => {
    activeWinnerRecord = null;
    recomputeAndRender();
  });

  resetFiltersBtn.addEventListener('click', () => {
    rules.uniqueUsers = true;
    modeUniqueBtn.classList.add('active');
    modeAllBtn.classList.remove('active');
    keywordInput.value = '';
    keywordModeSelect.value = 'any';
    minMentionsInput.value = '0';
    includeRepliesCheck.checked = false;
    const owner = currentDataset.postMeta && currentDataset.postMeta.ownerUsername;
    excludeUsersInput.value = owner || '';
    activeWinnerRecord = null;
    recomputeAndRender();
    showToast('Filters reset to defaults');
  });

  pickWinnerPrimaryBtn.addEventListener('click', () =>
    executeWinnerDraw({ excludePreviousWinners: false })
  );
  pickBackupWinnerBtn.addEventListener('click', () =>
    executeWinnerDraw({ excludePreviousWinners: true })
  );
  redrawFreshBtn.addEventListener('click', () =>
    executeWinnerDraw({ excludePreviousWinners: false })
  );

  copyWinnerBtn.addEventListener('click', async () => {
    if (!activeWinnerRecord) return;
    const { entry, poolSize } = activeWinnerRecord;
    const postLine =
      currentDataset.postUrl && currentDataset.postUrl.startsWith('http')
        ? `\nPost: ${currentDataset.postUrl}`
        : '';
    const announcement = `🎉 Giveaway Winner Announcement! 🎉\nCongratulations @${entry.username}!\nWinning comment: "${entry.primaryComment.text}"\nSelected randomly from ${poolSize.toLocaleString()} eligible entries.${postLine}`;
    try {
      await navigator.clipboard.writeText(announcement);
      showToast('Copied winner announcement to clipboard!');
    } catch {
      showToast('Could not access clipboard.');
    }
  });

  clearHistoryBtn.addEventListener('click', () => {
    drawHistory = [];
    activeWinnerRecord = null;
    recomputeAndRender();
  });

  tabEligibleBtn.addEventListener('click', () => {
    activeExplorerTab = 'eligible';
    tabEligibleBtn.classList.add('active');
    tabAllCommentsBtn.classList.remove('active');
    renderTable();
  });

  tabAllCommentsBtn.addEventListener('click', () => {
    activeExplorerTab = 'all';
    tabAllCommentsBtn.classList.add('active');
    tabEligibleBtn.classList.remove('active');
    renderTable();
  });

  searchInput.addEventListener('input', renderTable);

  loadDemoBtn.addEventListener('click', () => {
    const demo = generateSampleGiveawayDataset();
    applyDataset(
      demo,
      'Sample Giveaway Post (@glowstudio_official • 18 sample comments loaded)'
    );
    showToast('Sample giveaway loaded — try filters or click Pick Single Lucky Winner!');
  });

  exportCsvBtn.addEventListener('click', exportCommentsToCsv);

  // Import Modal Handlers
  function openModal() {
    importErrorMsg.classList.add('hidden');
    importModal.classList.remove('hidden');
  }
  function closeModal() {
    importModal.classList.add('hidden');
  }

  openImportModalBtn.addEventListener('click', openModal);
  closeImportModalBtn.addEventListener('click', closeModal);
  cancelImportBtn.addEventListener('click', closeModal);
  importModal.addEventListener('click', (e) => {
    if (e.target === importModal) closeModal();
  });

  importFileInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      importTextarea.value = String(reader.result || '');
    };
    reader.readAsText(file);
  });

  confirmImportBtn.addEventListener('click', () => {
    const parsed = Parser.parseManualCommentsInput(importTextarea.value);
    if (!parsed || parsed.length === 0) {
      importErrorMsg.textContent =
        'Could not parse any comments. Use "username, comment" lines, CSV, or JSON.';
      importErrorMsg.classList.remove('hidden');
      return;
    }
    applyDataset(
      {
        shortcode: 'IMPORTED',
        postUrl: null,
        postMeta: { ownerUsername: null, commentCount: parsed.length },
        comments: parsed,
      },
      `Imported Dataset (${parsed.length.toLocaleString()} comments)`
    );
    closeModal();
    showToast(`Loaded ${parsed.length.toLocaleString()} comments!`);
  });

  // =====================================================================
  // Live Instagram sync (extension mode)
  // Runs each step directly inside the open Instagram tab via InstaBridge and
  // streams comments into this page. Every failure is shown in the banner.
  // =====================================================================
  const Bridge = window.InstaBridge;
  const urlParams = new URLSearchParams(window.location.search);

  const liveSyncBanner = document.getElementById('liveSyncBanner');
  const syncDot = document.getElementById('syncDot');
  const igTabSelect = document.getElementById('igTabSelect');
  const syncStatusMsg = document.getElementById('syncStatusMsg');
  const studioStartSyncBtn = document.getElementById('studioStartSyncBtn');
  const studioScrollSyncBtn = document.getElementById('studioScrollSyncBtn');
  const studioStopSyncBtn = document.getElementById('studioStopSyncBtn');

  let connectedIgTabId = Number(urlParams.get('tab')) || null;
  let collecting = false;
  let stopRequested = false;
  let lastUiPush = 0;

  function isExtensionEnv() {
    return Boolean(
      typeof chrome !== 'undefined' &&
        chrome.runtime &&
        chrome.runtime.id &&
        chrome.tabs &&
        chrome.scripting &&
        chrome.storage &&
        chrome.storage.local &&
        Bridge
    );
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function setStatus(msg, { running = false, error = false } = {}) {
    syncStatusMsg.textContent = msg;
    syncStatusMsg.style.color = error ? '#fca5a5' : '';
    syncDot.classList.toggle('running', running);
    syncDot.style.background = error ? '#ef4444' : '';
  }

  function setCollectingUi(on) {
    collecting = on;
    studioStartSyncBtn.classList.toggle('hidden', on);
    studioScrollSyncBtn.classList.toggle('hidden', on);
    studioStopSyncBtn.classList.toggle('hidden', !on);
  }

  function isInstagramPostTab(t) {
    return Boolean(
      t &&
        t.id &&
        t.url &&
        /^https?:\/\/([\w-]+\.)?instagram\.com\//i.test(t.url) &&
        Parser.extractShortcodeFromUrl(t.url)
    );
  }

  async function refreshIgTabs() {
    const tabs = (await chrome.tabs.query({})).filter(isInstagramPostTab);
    liveSyncBanner.classList.remove('hidden');

    if (tabs.length === 0) {
      connectedIgTabId = null;
      igTabSelect.innerHTML = '<option>none open</option>';
      studioStartSyncBtn.disabled = true;
      studioScrollSyncBtn.disabled = true;
      if (!collecting) {
        setStatus('No Instagram post or reel tab is open. Open one, then click Read All Comments.', { error: true });
      }
      return tabs;
    }

    if (!tabs.some((t) => t.id === connectedIgTabId)) connectedIgTabId = tabs[0].id;
    igTabSelect.innerHTML = tabs
      .map(
        (t) =>
          `<option value="${t.id}" ${t.id === connectedIgTabId ? 'selected' : ''}>/p/${escapeHtml(
            Parser.extractShortcodeFromUrl(t.url) || ''
          )}</option>`
      )
      .join('');
    studioStartSyncBtn.disabled = false;
    studioScrollSyncBtn.disabled = false;
    return tabs;
  }

  function normalizeCursor(v) {
    if (v == null || v === '') return null;
    return typeof v === 'object' ? JSON.stringify(v) : String(v);
  }

  function mergeComments(state, comments) {
    let added = 0;
    for (const c of comments || []) {
      if (!c || !c.id || !c.username) continue;
      if (!state.comments.has(c.id)) {
        state.comments.set(c.id, c);
        added++;
      } else {
        const prev = state.comments.get(c.id);
        state.comments.set(c.id, {
          ...prev,
          ...c,
          isReply: prev.isReply || c.isReply,
          parentId: prev.parentId || c.parentId,
        });
      }
    }
    return added;
  }

  function applyParsed(state, parsed) {
    const m = parsed.postMeta || {};
    if (m.ownerUsername) state.meta.ownerUsername = m.ownerUsername;
    if (m.commentCount != null && state.meta.commentCount == null) state.meta.commentCount = m.commentCount;
    if (m.captionText && !state.meta.captionText) state.meta.captionText = m.captionText;
    return mergeComments(state, parsed.comments);
  }

  function buildDataset(state) {
    return {
      shortcode: state.shortcode,
      postUrl: `https://www.instagram.com/p/${state.shortcode}/`,
      postMeta: { ...state.meta, mediaId: state.mediaId },
      comments: Array.from(state.comments.values()),
    };
  }

  function pushDataset(state, force = false) {
    if (!state.shortcode) return;
    const now = Date.now();
    if (!force && now - lastUiPush < 500) return;
    lastUiPush = now;
    applyDataset(buildDataset(state));
  }

  async function persist(state) {
    if (!state.shortcode) return;
    try {
      const payload = { ...buildDataset(state), savedAt: Date.now() };
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        await chrome.storage.local.set({ activeGiveawayDataset: payload });
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('activeGiveawayDataset', JSON.stringify(payload));
      }
    } catch (e) {
      /* non-fatal */
    }
  }

  async function apiGet(tabId, url, headers, state) {
    for (let attempt = 0; attempt <= 4; attempt++) {
      if (stopRequested) return { aborted: true };
      const res = await Bridge.fetchJson(tabId, url, headers);
      if (res.status === 429 || res.status === 503) {
        const wait = Math.min(60, 4 * 2 ** attempt);
        for (let s = wait; s > 0 && !stopRequested; s--) {
          setStatus(
            `Instagram asked us to slow down — resuming in ${s}s (${state.comments.size.toLocaleString()} comments read so far)...`,
            { running: true }
          );
          await sleep(1000);
        }
        continue;
      }
      return res;
    }
    return { ok: false, status: 429, json: null, error: 'Rate limited by Instagram' };
  }

  async function collectViaApi(state, probe, fetchReplies) {
    const headers = {
      Accept: '*/*',
      'X-IG-App-ID': probe.appId || '936619743392459',
      'X-ASBD-ID': '129477',
      'X-IG-WWW-Claim': probe.claim || '0',
      'X-Requested-With': 'XMLHttpRequest',
    };
    if (probe.csrf) headers['X-CSRFToken'] = probe.csrf;

    const base = `${probe.origin}/api/v1/media/${state.mediaId}`;
    const queue = [{ param: null, cursor: null }];
    const seen = new Set();
    const needReplies = [];
    let pages = 0;
    let zeroRun = 0;

    while (queue.length > 0 && !stopRequested && pages < 3000) {
      const cur = queue.shift();
      let url = `${base}/comments/?can_support_threading=true&permalink_enabled=false`;
      if (cur.param) url += `&${cur.param}=${encodeURIComponent(cur.cursor)}`;

      const res = await apiGet(connectedIgTabId, url, headers, state);
      if (res.aborted) break;

      const j = res.json;
      if (!res.ok || !j || j.status === 'fail') {
        const detail = (j && (j.message || j.status)) || res.error || res.snippet || '';
        return { ok: pages > 0, reason: `HTTP ${res.status}${detail ? ' — ' + String(detail).slice(0, 120) : ''}`, pages };
      }

      pages++;
      const added = applyParsed(state, Parser.parsePayloadForInstagramData(j, null, null));
      zeroRun = added === 0 ? zeroRun + 1 : 0;

      const total = state.meta.commentCount ? ` of ~${Number(state.meta.commentCount).toLocaleString()}` : '';
      setStatus(`Reading comments via Instagram API — ${state.comments.size.toLocaleString()}${total} (page ${pages})...`, { running: true });
      pushDataset(state);

      if (fetchReplies && Array.isArray(j.comments)) {
        for (const c of j.comments) {
          const total = Number(c.child_comment_count || 0);
          const preview = Array.isArray(c.preview_child_comments) ? c.preview_child_comments.length : 0;
          if (c.pk && total > preview) needReplies.push(String(c.pk));
        }
      }

      for (const [param, key] of [['max_id', 'next_max_id'], ['min_id', 'next_min_id']]) {
        const cursor = normalizeCursor(j[key]);
        if (cursor && !seen.has(`${param}:${cursor}`)) {
          seen.add(`${param}:${cursor}`);
          queue.push({ param, cursor });
        }
      }

      if (zeroRun >= 4) break;
      if (queue.length > 0) await sleep(500 + Math.floor(Math.random() * 400));
    }

    if (fetchReplies) {
      for (let i = 0; i < needReplies.length && !stopRequested; i++) {
        const childQueue = [{ param: null, cursor: null }];
        const childSeen = new Set();
        let childPages = 0;
        while (childQueue.length > 0 && !stopRequested && childPages < 60) {
          const cq = childQueue.shift();
          let url = `${base}/comments/${needReplies[i]}/child_comments/`;
          if (cq.param) url += `?${cq.param}=${encodeURIComponent(cq.cursor)}`;
          const res = await apiGet(connectedIgTabId, url, headers, state);
          if (res.aborted || !res.ok || !res.json) break;
          childPages++;
          applyParsed(state, Parser.parsePayloadForInstagramData(res.json, null, null));
          const pairs = [
            ['max_id', res.json.has_more_tail_child_comments ? res.json.next_max_child_cursor : null],
            ['min_id', res.json.has_more_head_child_comments ? res.json.next_min_child_cursor : null],
          ];
          for (const [param, raw] of pairs) {
            const cursor = normalizeCursor(raw);
            if (cursor && !childSeen.has(`${param}:${cursor}`)) {
              childSeen.add(`${param}:${cursor}`);
              childQueue.push({ param, cursor });
            }
          }
          await sleep(400 + Math.floor(Math.random() * 300));
        }
        setStatus(`Reading replies (${i + 1}/${needReplies.length}) — ${state.comments.size.toLocaleString()} comments total...`, { running: true });
        pushDataset(state);
      }
    }

    return { ok: pages > 0, reason: pages > 0 ? 'ok' : 'no pages returned', pages };
  }

  async function collectViaDom(state, fetchReplies) {
    try {
      await chrome.tabs.update(connectedIgTabId, { active: true });
    } catch (e) {
      /* ignore */
    }

    let idleCalls = 0;
    for (let round = 0; round < 400 && !stopRequested; round++) {
      setStatus(
        `Visual scroll mode — keep the Instagram tab in front. ${state.comments.size.toLocaleString()} comments read...`,
        { running: true }
      );
      const r = await Bridge.domCollect(connectedIgTabId, {
        durationMs: 9000,
        fetchReplies,
        ownerHint: state.meta.ownerUsername || '',
      });
      if (r.owner && !state.meta.ownerUsername) state.meta.ownerUsername = r.owner;
      const added = mergeComments(state, r.comments);
      pushDataset(state);
      idleCalls = r.reachedEnd || added === 0 ? idleCalls + 1 : 0;
      if (idleCalls >= 2) break;
    }

    try {
      const me = await chrome.tabs.getCurrent();
      if (me && me.id) await chrome.tabs.update(me.id, { active: true });
    } catch (e) {
      /* ignore */
    }
  }

  async function runCollection(mode) {
    if (collecting) return;
    stopRequested = false;
    setCollectingUi(true);
    const state = {
      shortcode: null,
      mediaId: null,
      comments: new Map(),
      meta: { ownerUsername: null, commentCount: null, captionText: null },
    };
    const fetchReplies = includeRepliesCheck.checked;

    try {
      await refreshIgTabs();
      if (!connectedIgTabId) throw new Error('No Instagram post or reel tab is open.');

      const tab = await chrome.tabs.get(connectedIgTabId);
      state.shortcode = Parser.extractShortcodeFromUrl(tab.url);
      if (!state.shortcode) throw new Error('The selected tab is not an Instagram post or reel.');

      setStatus('Connecting to the Instagram tab...', { running: true });
      const probe = await Bridge.probe(connectedIgTabId, state.shortcode);
      state.mediaId = probe.mediaId || Parser.shortcodeToMediaId(state.shortcode);
      if (probe.owner) state.meta.ownerUsername = probe.owner;
      if (!state.mediaId) throw new Error('Could not determine the post ID. Refresh the Instagram tab and retry.');
      pushDataset(state, true);

      let apiOk = false;
      let apiReason = '';
      if (mode === 'auto') {
        const r = await collectViaApi(state, probe, fetchReplies);
        apiOk = r.ok;
        apiReason = r.reason;
      }

      if (!stopRequested && (mode === 'scroll' || !apiOk || state.comments.size === 0)) {
        if (mode === 'auto') {
          setStatus(`Instagram API unavailable (${apiReason}). Switching to visual scroll mode...`, { running: true });
          await sleep(1500);
        }
        await collectViaDom(state, fetchReplies);
      }

      pushDataset(state, true);
      await persist(state);

      const n = state.comments.size;
      if (n === 0) {
        setStatus(
          'No comments could be read. Make sure you are logged in to Instagram and the post shows its comments, then try Visual Scroll Mode.',
          { error: true }
        );
      } else {
        const total = state.meta.commentCount ? ` (post reports ~${Number(state.meta.commentCount).toLocaleString()} incl. replies)` : '';
        setStatus(
          `${stopRequested ? 'Paused' : 'Finished'} — ${n.toLocaleString()} comments ready${total}. Pick your winner below!`
        );
        showToast(`${n.toLocaleString()} comments loaded from Instagram`);
      }
    } catch (err) {
      console.error('[InstaLucky]', err);
      pushDataset(state, true);
      await persist(state);
      const n = state.comments.size;
      setStatus(
        `${err && err.message ? err.message : String(err)}${n ? ` — ${n.toLocaleString()} comments were read before the error and are ready to use.` : ''}`,
        { error: true }
      );
    } finally {
      setCollectingUi(false);
      syncDot.classList.remove('running');
    }
  }

  studioStartSyncBtn.addEventListener('click', () => runCollection('auto'));
  studioScrollSyncBtn.addEventListener('click', () => runCollection('scroll'));
  studioStopSyncBtn.addEventListener('click', () => {
    stopRequested = true;
    setStatus('Stopping — keeping the comments read so far...', { running: true });
  });
  igTabSelect.addEventListener('change', () => {
    connectedIgTabId = Number(igTabSelect.value) || null;
  });
  window.addEventListener('focus', () => {
    if (isExtensionEnv() && !collecting) refreshIgTabs().catch(() => {});
  });

  /* ---------------- Direct Link Reader & Session Modal ---------------- */
  let serverSessionConfigured = false;
  let serverUsername = null;
  let directAbortController = null;
  let directCollecting = false;

  function setDirectCollectingUi(on) {
    directCollecting = on;
    directFetchCommentsBtn.classList.toggle('hidden', on);
    directStopSyncBtn.classList.toggle('hidden', !on);
    directPostUrlInput.disabled = on;
    directIncludeRepliesCheck.disabled = on;
    if (clearDirectUrlBtn) clearDirectUrlBtn.classList.toggle('hidden', on || !directPostUrlInput.value);
  }

  async function checkServerStatus() {
    try {
      const res = await fetch('/api/status', { cache: 'no-store' });
      if (!res.ok) return false;
      const data = await res.json();
      if (data && typeof data.configured === 'boolean') {
        serverSessionConfigured = Boolean(data.configured);
        serverUsername = data.username || null;
        updateSessionStatusUi();
        return true;
      }
    } catch {
      /* not running behind node server */
    }
    return false;
  }

  function updateSessionStatusUi() {
    if (!sessionStatusDot || !sessionStatusText) return;
    if (serverSessionConfigured) {
      sessionStatusDot.className = 'status-dot online';
      sessionStatusText.textContent = serverUsername ? `@${serverUsername} connected` : 'Instagram connected';
      sessionActiveInfo.classList.remove('hidden');
      connectedUsernameLabel.textContent = serverUsername ? `Logged in as @${serverUsername}` : 'Instagram session is active';
      disconnectSessionBtn.classList.remove('hidden');
    } else {
      sessionStatusDot.className = 'status-dot warning';
      sessionStatusText.textContent = 'Set Instagram session';
      sessionActiveInfo.classList.add('hidden');
    }
  }

  function openSessionModal() {
    sessionErrorMsg.classList.add('hidden');
    sessionSuccessMsg.classList.add('hidden');
    sessionModal.classList.remove('hidden');
    sessionIdInput.value = '';
    sessionIdInput.focus();
  }

  function closeSessionModal() {
    sessionModal.classList.add('hidden');
  }

  openSessionModalBtn.addEventListener('click', openSessionModal);
  closeSessionModalBtn.addEventListener('click', closeSessionModal);
  cancelSessionModalBtn.addEventListener('click', closeSessionModal);

  toggleSessionVisibilityBtn.addEventListener('click', () => {
    const isPass = sessionIdInput.type === 'password';
    sessionIdInput.type = isPass ? 'text' : 'password';
    toggleSessionVisibilityBtn.textContent = isPass ? '🔒' : '👁';
  });

  saveSessionBtn.addEventListener('click', async () => {
    const val = sessionIdInput.value.trim();
    if (!val) {
      sessionErrorMsg.textContent = 'Please paste your sessionid value.';
      sessionErrorMsg.classList.remove('hidden');
      return;
    }
    sessionErrorMsg.classList.add('hidden');
    sessionSuccessMsg.classList.add('hidden');
    saveSessionBtn.disabled = true;
    saveSessionBtn.textContent = 'Verifying...';

    try {
      const resp = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionid: val }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        throw new Error(data.message || 'Instagram session verification failed.');
      }
      serverSessionConfigured = true;
      serverUsername = data.username || null;
      updateSessionStatusUi();
      sessionSuccessMsg.textContent = data.username ? `Connected as @${data.username}!` : 'Instagram connected successfully!';
      sessionSuccessMsg.classList.remove('hidden');
      showToast('Instagram connected');
      setTimeout(() => {
        closeSessionModal();
      }, 1200);
    } catch (err) {
      sessionErrorMsg.textContent = err.message || 'Failed to save session.';
      sessionErrorMsg.classList.remove('hidden');
    } finally {
      saveSessionBtn.disabled = false;
      saveSessionBtn.textContent = 'Save & Verify Connection';
    }
  });

  disconnectSessionBtn.addEventListener('click', async () => {
    try {
      await fetch('/api/session', { method: 'DELETE' });
    } catch {
      /* ignore */
    }
    serverSessionConfigured = false;
    serverUsername = null;
    updateSessionStatusUi();
    showToast('Instagram session disconnected');
    closeSessionModal();
  });

  directPostUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      startDirectCollection();
    }
  });

  let cacheCheckTimer = null;
  directPostUrlInput.addEventListener('input', () => {
    clearDirectUrlBtn.classList.toggle('hidden', !directPostUrlInput.value || directCollecting);
    if (cacheCheckTimer) clearTimeout(cacheCheckTimer);
    cacheCheckTimer = setTimeout(() => {
      checkCacheForUrl(directPostUrlInput.value.trim());
    }, 250);
  });

  clearDirectUrlBtn.addEventListener('click', () => {
    directPostUrlInput.value = '';
    clearDirectUrlBtn.classList.add('hidden');
    cacheNoticeBanner.classList.add('hidden');
    directPostUrlInput.focus();
  });

  async function checkCacheForUrl(rawUrl) {
    const shortcode = Parser.extractShortcodeFromUrl(rawUrl);
    if (!shortcode) {
      cacheNoticeBanner.classList.add('hidden');
      return;
    }
    try {
      const resp = await fetch(`/api/cache?url=${encodeURIComponent(rawUrl)}`, { cache: 'no-store' });
      if (!resp.ok) return;
      const data = await resp.json();
      if (data && data.ok && data.cached && Array.isArray(data.comments) && data.comments.length > 0) {
        applyDataset({
          shortcode: data.shortcode,
          postUrl: `https://www.instagram.com/p/${data.shortcode}/`,
          postMeta: data.postMeta || { mediaId: data.mediaId },
          comments: data.comments,
        });
        cacheCountText.textContent = data.total.toLocaleString();
        cacheDateText.textContent = formatDate(data.lastSyncedAt / 1000) || 'recently';
        cacheNoticeBanner.classList.remove('hidden');
        showToast(`⚡ Instant load: ${data.total.toLocaleString()} comments ready`);
      } else {
        cacheNoticeBanner.classList.add('hidden');
      }
    } catch {}
  }

  forceSyncNewBtn.addEventListener('click', () => {
    startDirectCollection();
  });

  clearCacheBtn.addEventListener('click', () => {
    cacheNoticeBanner.classList.add('hidden');
    currentDataset = { shortcode: null, postUrl: null, postMeta: {}, comments: [] };
    recomputeAndRender();
    showToast('Cache cleared from view');
  });

  window.addEventListener('AUTO_SESSION_SYNCED', (e) => {
    serverSessionConfigured = true;
    serverUsername = (e && e.detail && e.detail.username) || null;
    updateSessionStatusUi();
    closeSessionModal();
    showToast('⚡ Instagram cookies connected automatically!');
  });

  async function autoAcquireSession() {
    if (serverSessionConfigured) return true;

    // 1. Direct extension environment cookie access
    if (typeof chrome !== 'undefined' && chrome.cookies) {
      try {
        const ck = await chrome.cookies.get({ url: 'https://www.instagram.com', name: 'sessionid' });
        if (ck && ck.value) {
          const r = await fetch('/api/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionid: ck.value }),
          });
          const d = await r.json();
          if (d && d.ok) {
            serverSessionConfigured = true;
            serverUsername = d.username || null;
            updateSessionStatusUi();
            return true;
          }
        }
      } catch {}
    }

    // 2. Trigger auto-bridge content script
    try {
      window.dispatchEvent(new CustomEvent('REQUEST_AUTO_SESSION'));
      await sleep(500);
      const live = await checkServerStatus();
      if (serverSessionConfigured) return true;
    } catch {}

    // 3. Re-verify status with server in case .session.json exists
    try {
      const live = await checkServerStatus();
      if (serverSessionConfigured) return true;
    } catch {}

    return false;
  }

  autoDetectSessionBtn.addEventListener('click', async () => {
    autoDetectSessionBtn.disabled = true;
    autoDetectSessionBtn.textContent = 'Accepting cookies & connecting...';
    sessionErrorMsg.classList.add('hidden');
    try {
      const ok = await autoAcquireSession();
      if (ok || serverSessionConfigured) {
        showToast('⚡ Cookies accepted! Running comment reader now...');
        closeSessionModal();
        await startDirectCollection();
        return;
      }
      const igLink = document.getElementById('openInstagramTabLink');
      if (igLink) igLink.classList.remove('hidden');
      throw new Error('No active Instagram session detected. Open instagram.com in this browser and log in, then click Allow & Run.');
    } catch (err) {
      sessionErrorMsg.textContent = err.message || 'Auto-connect failed.';
      sessionErrorMsg.classList.remove('hidden');
    } finally {
      autoDetectSessionBtn.disabled = false;
      autoDetectSessionBtn.textContent = '⚡ Allow Cookies & Run Automatically';
    }
  });

  async function startDirectCollection() {
    if (directCollecting) return;
    const rawUrl = directPostUrlInput.value.trim();
    if (!rawUrl) {
      showToast('Please paste an Instagram post or reel URL.');
      directPostUrlInput.focus();
      return;
    }
    const shortcode = Parser.extractShortcodeFromUrl(rawUrl);
    if (!shortcode) {
      showToast('Please paste a valid Instagram link (instagram.com/p/... or /reel/...).');
      directPostUrlInput.focus();
      return;
    }

    const isLive = await checkServerStatus();
    if (!isLive) {
      showToast('Server not reachable. Make sure "npm start" or start.bat is running.');
      return;
    }

    if (!serverSessionConfigured) {
      const acquired = await autoAcquireSession();
      if (!acquired && !serverSessionConfigured) {
        openSessionModal();
        return;
      }
    }

    setDirectCollectingUi(true);
    directSyncStatusWrap.classList.remove('hidden');
    directSyncSpinner.classList.remove('hidden');
    directSyncStatusMsg.textContent = `Connecting to Instagram for post /p/${shortcode}...`;
    directSyncStatusMsg.className = 'direct-status-msg';
    directProgressBarTrack.classList.add('hidden');
    directProgressBarFill.style.width = '0%';

    const state = {
      shortcode,
      mediaId: null,
      comments: new Map(),
      meta: { ownerUsername: null, commentCount: null, captionText: null },
    };

    directAbortController = new AbortController();
    const includeReplies = directIncludeRepliesCheck.checked;

    try {
      const resp = await fetch(`/api/comments?url=${encodeURIComponent(rawUrl)}${includeReplies ? '&replies=1' : ''}`, {
        signal: directAbortController.signal,
      });

      if (!resp.ok) {
        throw new Error(`Server returned HTTP ${resp.status}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          let packet;
          try {
            packet = JSON.parse(trimmed);
          } catch {
            continue;
          }

          if (packet.type === 'cache_hit') {
            if (Array.isArray(packet.comments)) {
              for (const c of packet.comments) {
                if (c && c.id && c.username) state.comments.set(c.id, c);
              }
            }
            if (packet.ownerUsername) state.meta.ownerUsername = packet.ownerUsername;
            if (packet.commentCount != null) state.meta.commentCount = packet.commentCount;
            if (packet.mediaId) state.mediaId = packet.mediaId;
            pushDataset(state, true);
            directSyncStatusMsg.textContent = `⚡ Loaded ${state.comments.size.toLocaleString()} previous comments from disk cache. Checking for newer comments...`;
            cacheCountText.textContent = state.comments.size.toLocaleString();
            cacheDateText.textContent = formatDate(packet.lastSyncedAt / 1000) || 'recently';
            cacheNoticeBanner.classList.remove('hidden');
          } else if (packet.type === 'meta') {
            if (packet.mediaId) state.mediaId = packet.mediaId;
            if (packet.ownerUsername) state.meta.ownerUsername = packet.ownerUsername;
            if (packet.commentCount != null) state.meta.commentCount = packet.commentCount;
            pushDataset(state, true);
          } else if (packet.type === 'progress') {
            directSyncStatusMsg.textContent = packet.message;
            if (state.meta.commentCount && state.comments.size > 0) {
              const pct = Math.min(96, Math.round((state.comments.size / Number(state.meta.commentCount)) * 100));
              directProgressBarTrack.classList.remove('hidden');
              directProgressBarFill.style.width = `${pct}%`;
            }
          } else if (packet.type === 'comments') {
            if (Array.isArray(packet.comments)) {
              for (const c of packet.comments) {
                if (c && c.id && c.username) state.comments.set(c.id, c);
              }
            }
            if (packet.ownerUsername) state.meta.ownerUsername = packet.ownerUsername;
            if (packet.commentCount != null && state.meta.commentCount == null) {
              state.meta.commentCount = packet.commentCount;
            }
            pushDataset(state, false);
          } else if (packet.type === 'done') {
            directProgressBarFill.style.width = '100%';
            const n = state.comments.size;
            directSyncSpinner.classList.add('hidden');
            const freshNote = packet.freshAdded > 0 ? ` (+${packet.freshAdded.toLocaleString()} new comments read)` : '';
            directSyncStatusMsg.textContent = `Completed! ${n.toLocaleString()} total comments ready${freshNote}. Pick your lucky winner below!`;
            showToast(`Finished — ${n.toLocaleString()} comments ready`);
            cacheCountText.textContent = n.toLocaleString();
            cacheDateText.textContent = 'just now';
            cacheNoticeBanner.classList.remove('hidden');
          } else if (packet.type === 'error') {
            if (packet.code === 'NO_SESSION' || packet.code === 'SESSION_EXPIRED') {
              serverSessionConfigured = false;
              updateSessionStatusUi();
              openSessionModal();
              sessionErrorMsg.textContent = packet.message;
              sessionErrorMsg.classList.remove('hidden');
            }
            throw new Error(packet.message || 'Error from server');
          }
        }
      }

      pushDataset(state, true);
      await persist(state);
    } catch (err) {
      directSyncSpinner.classList.add('hidden');
      if (err.name === 'AbortError') {
        directSyncStatusMsg.textContent = `Stopped. Kept ${state.comments.size.toLocaleString()} comments read so far.`;
        showToast('Comment collection stopped');
      } else {
        directSyncStatusMsg.textContent = err.message || 'Failed to read comments';
        directSyncStatusMsg.classList.add('error');
        showToast(err.message || 'Failed to read comments');
      }
      pushDataset(state, true);
      await persist(state);
    } finally {
      setDirectCollectingUi(false);
      directAbortController = null;
    }
  }

  directFetchCommentsBtn.addEventListener('click', startDirectCollection);
  directStopSyncBtn.addEventListener('click', () => {
    if (directAbortController) {
      directAbortController.abort();
    }
  });

  // Boot
  (async function boot() {
    recomputeAndRender();

    // Check server status
    const isServer = await checkServerStatus();

    // Restore saved dataset if available
    try {
      let ds = null;
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const stored = await chrome.storage.local.get('activeGiveawayDataset');
        ds = stored && stored.activeGiveawayDataset;
      } else if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem('activeGiveawayDataset');
        if (raw) ds = JSON.parse(raw);
      }
      if (ds && Array.isArray(ds.comments) && ds.comments.length > 0) applyDataset(ds);
    } catch (e) {
      /* ignore */
    }

    if (isExtensionEnv()) {
      await refreshIgTabs();
      if (urlParams.get('auto') === '1' && connectedIgTabId) {
        window.history.replaceState(null, '', `${window.location.pathname}?tab=${connectedIgTabId}`);
        runCollection('auto');
      } else if (connectedIgTabId) {
        setStatus('Ready — click Read All Comments to load this post.');
      }
    } else if (isServer) {
      // Auto-detect cookies silently if available
      if (!serverSessionConfigured) {
        await autoAcquireSession();
      }

      // Pre-fill target reel link if empty and check cache
      const initialUrl = urlParams.get('url') || directPostUrlInput.value.trim() || 'https://www.instagram.com/p/DfRxjqKxy8d/';
      directPostUrlInput.value = initialUrl;
      clearDirectUrlBtn.classList.remove('hidden');
      await checkCacheForUrl(initialUrl);
      directPostUrlInput.focus();
    }
  })();
})();
