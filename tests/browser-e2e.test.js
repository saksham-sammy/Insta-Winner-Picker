'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
let chromium = null;
try {
  chromium = require('playwright').chromium;
} catch {
  /* playwright is optional */
}
const { createApp, listenWithFallback } = require('../server/server.js');

test('Browser E2E: Direct Web App Studio Flow', async (t) => {
  if (!chromium) {
    t.skip('Playwright not installed in local project, skipping browser E2E test');
    return;
  }
  const { server } = createApp();
  const port = await listenWithFallback(server, 0);
  const baseUrl = `http://127.0.0.1:${port}`;

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (err) {
    server.close();
    t.skip(`Playwright browser launch skipped: ${err.message}`);
    return;
  }

  t.after(async () => {
    if (browser) await browser.close();
    server.close();
  });

  const page = await browser.newPage();
  await page.goto(baseUrl);

  // 1. Check title and Direct Link Banner
  const title = await page.title();
  assert.ok(title.includes('Insta Lucky Winner Picker'));

  const directBanner = page.locator('#directLinkBanner');
  assert.equal(await directBanner.isVisible(), true);

  const statusText = await page.locator('#sessionStatusText').textContent();
  assert.equal(statusText.trim(), 'Set Instagram session');

  // 2. Click "Load Sample Giveaway"
  await page.click('#loadDemoBtn');

  // 3. Verify metrics strip updated
  await page.waitForFunction(() => {
    const el = document.getElementById('statTotalComments');
    return el && Number(el.textContent) > 0;
  });

  const totalComments = await page.locator('#statTotalComments').textContent();
  assert.equal(totalComments, '65');

  const eligibleEntries = await page.locator('#statEligibleEntries').textContent();
  assert.equal(eligibleEntries, '40');

  // 4. Click "Pick Single Lucky Winner"
  const pickBtn = page.locator('#pickWinnerPrimaryBtn');
  assert.equal(await pickBtn.isEnabled(), true);
  await pickBtn.click();

  // 5. Wait for winner stage to become visible (drumroll animation is ~2.8s)
  const winnerStage = page.locator('#stageWinner');
  await winnerStage.waitFor({ state: 'visible', timeout: 6000 });

  const winnerHandle = await page.locator('#winnerUsernameLink').textContent();
  assert.ok(winnerHandle.startsWith('@'));
  assert.ok(winnerHandle.length > 2);

  const commentText = await page.locator('#winnerCommentText').textContent();
  assert.ok(commentText.length > 0);

  // 6. Test session modal open and close
  await page.click('#openSessionModalBtn');
  const sessionModal = page.locator('#sessionModal');
  assert.equal(await sessionModal.isVisible(), true);

  await page.click('#closeSessionModalBtn');
  assert.equal(await sessionModal.isVisible(), false);
});
