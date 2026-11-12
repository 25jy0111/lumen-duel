import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// Start Vite first. Override BROWSER_PATH for another Chromium executable.
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
const errors = [];
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(`${message.text()} ${message.location().url}`); });
// Fixed initial hands; speed up only the CPU presentation delay, retaining real DOM actions.
await page.addInitScript(() => {
  let seed = 41;
  crypto.getRandomValues = array => { array[0] = seed++; return array; };
  const timeout = window.setTimeout.bind(window);
  window.setTimeout = (callback, delay, ...args) => timeout(callback, delay === 650 ? 25 : delay, ...args);
});
const directory = new URL('../test-results/', import.meta.url);
await mkdir(directory, { recursive: true });
const totals = { attacks: 0, defenses: 0, heals: 0, prayers: 0, actions: 0 };
let checkedExtraAlone = false;

try {
  await page.goto(process.env.GAME_URL || 'http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'あなたの手札' }).waitFor();
  await page.getByRole('button', { name: '遊び方', exact: true }).click();
  assert.equal(await page.getByRole('region', { name: '遊び方' }).isVisible(), true);
  await page.getByRole('button', { name: '遊び方', exact: true }).click();
  await page.screenshot({ path: fileURLToPath(new URL('desktop.png', directory)), fullPage: true });

  for (let step = 0; step < 600; step++) {
    if (await page.locator('.winner-content').count()) break;
    const instruction = await page.locator('.hand-instruction').innerText();
    if (instruction.includes('CPUが行動')) { await page.waitForTimeout(35); continue; }
    const primary = page.locator('.action-buttons .button-primary');
    if (instruction.includes('防具を選んで')) {
      const armor = page.locator('.game-card.kind-armor:enabled');
      for (const card of await armor.all()) await card.click();
      await primary.click();
      totals.defenses++;
    } else {
      assert.equal(await primary.isDisabled(), true, 'Empty attack selection must be disabled');
      const extrasAlone = page.locator('.game-card.kind-extra:enabled');
      if (!checkedExtraAlone && await extrasAlone.count()) {
        await extrasAlone.first().click();
        assert.equal(await primary.isDisabled(), true, 'An extra weapon alone must be rejected in the UI');
        await extrasAlone.first().click();
        checkedExtraAlone = true;
      }
      const hp = Number(await page.getByRole('meter', { name: 'あなたのHP' }).getAttribute('aria-valuenow'));
      const healing = page.locator('.game-card.kind-item:enabled').filter({ hasText: '朝露の小瓶' });
      const weapons = page.locator('.game-card.kind-weapon:enabled');
      const miracles = page.locator('.game-card.kind-miracle:enabled');
      const items = page.locator('.game-card.kind-item:enabled');
      if (hp <= 28 && await healing.count()) {
        await healing.first().click();
        totals.heals++;
      } else if (await weapons.count()) {
        const axe = weapons.filter({ hasText: '黄昏の斧' });
        await (await axe.count() ? axe.first() : weapons.first()).click();
        const extras = page.locator('.game-card.kind-extra:enabled');
        for (const extra of await extras.all()) await extra.click();
        totals.attacks++;
      } else if (await miracles.count()) {
        await miracles.first().click();
        totals.attacks++;
      } else if (await items.count()) {
        await items.first().click();
        totals.heals++;
      } else {
        const prayer = page.getByRole('button', { name: '祈る', exact: true });
        assert.equal(await prayer.isEnabled(), true, 'Every human main turn must allow a legal action');
        await prayer.click();
        totals.prayers++;
        totals.actions++;
        continue;
      }
      assert.equal(await primary.isEnabled(), true, 'Selected combination must be playable');
      await primary.click();
    }
    totals.actions++;
    await page.waitForTimeout(35);
  }

  const result = page.locator('.winner-content');
  assert.equal(await result.isVisible(), true, 'An actual human-v-CPU DOM match must finish');
  assert.ok(totals.attacks > 0 && totals.defenses > 0, 'Match must include attacking and defending');
  assert.equal(checkedExtraAlone, true);
  assert.ok(await page.locator('.battle-log li').count() > 1);
  assert.equal(await page.locator('[role="alert"]').count(), 0);
  const winner = await result.locator('h1').innerText();
  await page.screenshot({ path: fileURLToPath(new URL('finished.png', directory)), fullPage: true });
  await page.getByRole('button', { name: /もう一度対戦する/ }).click();
  assert.equal(await result.count(), 0, 'Replay must clear the result');
  assert.equal(await page.locator('.game-card').count(), 9, 'Replay restores initial human hand');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: fileURLToPath(new URL('mobile.png', directory)), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Mobile layout must not overflow horizontally');
  assert.equal(await page.getByRole('button', { name: '新しいゲーム', exact: true }).isVisible(), true);
  await page.getByRole('button', { name: '新しいゲーム', exact: true }).click();
  assert.equal(await page.locator('.game-card').count(), 9);
  assert.deepEqual(errors, [], 'No browser runtime/console errors');
  console.log(JSON.stringify({ result: 'PASS', winner, ...totals, viewportChecks: ['1440x1050', '390x844'], consoleErrors: errors.length }, null, 2));
} finally {
  await browser.close();
}
