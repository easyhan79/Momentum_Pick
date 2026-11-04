/* Run against `pnpm preview --port 4173`.
 * Requires Playwright via the local install or NODE_PATH; no production services.
 */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const evidence = path.resolve(__dirname, '../../docs/evidence');
  await fs.mkdir(evidence, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const result = { app: {}, original: {}, failures: [] };
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    const mutations = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', req => { if (!['GET', 'HEAD'].includes(req.method())) mutations.push(req.url()); });
    // Image failure is deliberately handled by the product's fallback.
    await page.route('https://images.unsplash.com/**', route => route.abort());
    const base = process.env.SHOWROOM_QA_URL || 'http://127.0.0.1:4173';
    const response = await page.goto(base, { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200);
    assert.equal(await page.getByRole('tab').count(), 3);
    const zoneResults = [];
    for (let tab = 0; tab < 3; tab++) {
      await page.getByRole('tab').nth(tab).click();
      assert.equal(await page.locator('[data-zone-index]').count(), 5);
      for (let zone = 0; zone < 5; zone++) {
        await page.locator(`[data-zone-index="${zone}"]`).click();
        assert.equal(await page.locator(`[data-zone-index="${zone}"]`).getAttribute('aria-pressed'), 'true');
        assert.equal(await page.locator('.active-zone-heading .hotspot').innerText(), String(zone + 1));
        zoneResults.push([tab, zone]);
      }
    }
    await page.getByRole('tab').nth(0).click();
    await page.getByRole('tab').nth(0).focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.getByRole('tab').nth(1).getAttribute('aria-selected'), 'true');
    await page.keyboard.press('Home');
    assert.equal(await page.getByRole('tab').nth(0).getAttribute('aria-selected'), 'true');
    await page.locator('#slider-spend').fill('30000');
    assert.match(await page.locator('#out-revenue').innerText(), /4,050/);
    await page.locator('#slider-teams').fill('50');
    await page.locator('#slider-margin').fill('40');
    assert.match(await page.locator('#out-revenue').innerText(), /4,500/);
    assert.match(await page.locator('#out-profit').innerText(), /1,800/);
    await page.getByRole('button', { name: '문의 화면 동작 확인' }).click();
    assert.match(await page.locator('.demo-result').innerText(), /실제 문의는 접수되지 않았습니다/);
    assert.equal(await page.locator('input[type=tel], input[type=email]').count(), 0);
    assert.equal(await page.locator('#unlocked-report').count(), 0);
    result.app.tabHotspotCombinations = zoneResults.length;
    result.app.keyboard = 'passed';
    result.app.calculator = 'passed';
    result.app.demoInquiry = 'passed';
    result.app.imageFallback = await page.locator('.image-empty').count();

    const widths = [375, 768, 1440];
    for (const fixture of ['terrace', 'factory', 'land', 'sparse', 'edges', 'untrusted']) {
      await page.goto(`${base}/?fixture=${fixture}`, { waitUntil: 'networkidle' });
      result.app[fixture] = [];
      for (const width of widths) {
        await page.setViewportSize({ width, height: 1000 });
        const sizes = await page.evaluate(() => ({ inner: innerWidth, scroll: document.documentElement.scrollWidth }));
        assert.ok(sizes.scroll <= sizes.inner, `${fixture} overflow at ${width}: ${JSON.stringify(sizes)}`);
        result.app[fixture].push({ width, overflow: false });
      }
      if (['factory', 'land', 'sparse'].includes(fixture)) assert.equal(await page.locator('#calculator').count(), 0);
      if (fixture === 'factory') {
        assert.equal(await page.getByRole('tab').count(), 1);
        assert.equal(await page.locator('[data-zone-index]').count(), 2);
        assert.equal(await page.locator('.zone-metric').count(), 0);
      }
      if (['land', 'sparse'].includes(fixture)) assert.equal(await page.getByRole('tab').count(), 0);
      if (fixture === 'edges' || fixture === 'untrusted') {
        for (const [tab, expected] of [[0, 0], [1, 1], [2, 5]]) {
          await page.getByRole('tab').nth(tab).click();
          assert.equal(await page.locator('[data-zone-index]').count(), expected);
          if (expected) await page.locator(`[data-zone-index="${expected - 1}"]`).click();
        }
        await page.getByRole('tab').nth(1).click();
        assert.equal(await page.locator('[data-zone-index="0"]').getAttribute('aria-pressed'), 'true');
      }
      if (fixture === 'untrusted') {
        assert.equal(await page.evaluate(() => window.__injected), undefined);
        assert.equal(await page.locator('img[src^="javascript:"], a[href^="javascript:"], .active-zone svg[onload]').count(), 0);
        assert.ok((await page.locator('.hero-property').innerText()).includes('<img'));
      }
    }
    await page.goto(`${base}/?fixture=terrace`, { waitUntil: 'networkidle' });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: path.join(evidence, 'phase1-desktop.png') });
    await page.locator('#concepts').screenshot({ path: path.join(evidence, 'phase1-concepts.png') });
    await page.setViewportSize({ width: 375, height: 900 });
    await page.screenshot({ path: path.join(evidence, 'phase1-mobile.png'), fullPage: true });
    await page.goto(`${base}/?fixture=factory`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(evidence, 'phase1-factory.png'), fullPage: true });
    assert.equal(mutations.length, 0);
    assert.deepEqual(errors, []);
    result.app.mutatingRequests = mutations.length;
    result.app.javascriptErrors = errors;
    result.app.externalImages = 'blocked to verify offline fallback; image rights not verified';

    // Functional reference checks with third-party dependencies isolated.
    // These are not a CDN availability or full visual baseline test.
    const original = await context.newPage();
    await original.addInitScript(() => { window.tailwind = {}; window.lucide = { createIcons() {} }; });
    const refPath = path.resolve(__dirname, '../../reference/terrace201_original.html');
    const originalHtml = await fs.readFile(refPath, 'utf8');
    await original.route('**/*', route => route.request().url() === `${base}/reference-baseline`
      ? route.fulfill({ contentType: 'text/html; charset=utf-8', body: originalHtml })
      : route.abort());
    await original.goto(`${base}/reference-baseline`, { waitUntil: 'domcontentloaded' });
    for (const key of ['cafe', 'kids', 'edu']) {
      await original.locator(`#tab-${key}`).click();
      for (let index = 0; index < 5; index++) {
        await original.locator(`#hs-btn-${index}`).click();
        assert.equal(await original.locator('#active-hs-num').innerText(), String(index + 1));
      }
    }
    await original.locator('#slider-spend').fill('30000');
    assert.match(await original.locator('#out-revenue').innerText(), /4,050/);
    await original.locator('#lead-name').fill('합성 테스트');
    await original.locator('#lead-phone').fill('000-0000-0000');
    const originalMutations = [];
    original.on('request', req => { if (!['GET', 'HEAD'].includes(req.method())) originalMutations.push(req.url()); });
    await original.locator('#lead-form button[type=submit]').click();
    assert.equal(await original.locator('#unlocked-report').evaluate(el => el.classList.contains('hidden')), false);
    assert.deepEqual(originalMutations, []);
    result.original = { tabHotspotCombinations: 15, slider: 'passed', inquiry: 'DOM-only unlock confirmed', externalDependencies: 'mocked/blocked' };
  } catch (error) {
    result.failures.push(error.stack);
    process.exitCode = 1;
  } finally {
    await browser.close();
    await fs.writeFile(path.join(evidence, 'browser-qa.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result, null, 2));
  }
})();
