import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';

let browser;
before(async () => {
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
  await mkdir('test-results', { recursive: true });
});
after(async () => browser?.close());

async function openGame({ width = 1440, height = 900, motion = 'reduce' } = {}) {
  const page = await browser.newPage({ viewport: { width, height }, reducedMotion: motion });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(pathToFileURL(resolve('index.html')).href);
  return { page, errors };
}
async function clockIn(page) {
  await page.locator('#primaryModal').click();
  await page.locator('#primaryModal').click();
  await page.waitForFunction(() => state.phase === 'serving');
}
async function scanOrder(page, c) {
  for (const [id, quantity] of Object.entries(c.items)) {
    for (let i = 0; i < quantity; i++) await page.locator(`[data-product="${id}"]`).click();
  }
  if (c.fuel) {
    await page.locator('#pumpsBtn').click();
    await page.locator(`[data-pump="${c.fuel.pump}"]`).click();
    await page.locator('#fuelInput').fill((c.fuel.amount / 100).toFixed(2));
    await page.locator('#authorizeBtn').click();
  }
}
async function returnExactChange(page, cents) {
  for (const value of [2000, 1000, 500, 100, 25, 10, 5, 1]) {
    while (cents >= value) {
      await page.locator(`[data-denom="${value}"]`).click();
      cents -= value;
    }
  }
  assert.equal(cents, 0);
  await page.locator('#giveChange').click();
}

test('cash drawer rejects wrong change, supports undo, and books the sale exactly once', async () => {
  const { page, errors } = await openGame();
  await clockIn(page);
  await page.locator('#chargeBtn').click();
  assert.equal(await page.evaluate(() => state.phase), 'serving');
  await page.locator('[data-product="cola"]').click();
  await page.locator('[data-product="chips"]').click();
  await page.locator('[data-product="candy"]').click();
  await page.locator('[data-remove="candy"]').click();
  await page.locator('#chargeBtn').click();
  assert.equal(await page.evaluate(() => payment.total), 475);
  await page.locator('#takeCash').click();
  await page.locator('#giveChange').click();
  assert.equal(await page.evaluate(() => state.register), 0);
  assert.equal(await page.evaluate(() => state.mistakes), 1);
  await page.locator('[data-denom="1000"]').click();
  await page.locator('[data-undo="0"]').click();
  assert.equal(await page.evaluate(() => payment.tray.length), 0);
  await returnExactChange(page, 525);
  await page.evaluate(() => { completeSale(); confirmChange(); });
  assert.deepEqual(await page.evaluate(() => [state.register, state.completed, ledger.length]), [475, 1, 1]);
  await page.locator('#ledgerTab').click();
  assert.match(await page.locator('#workstationPane').innerText(), /Nora Wells/);
  await page.locator('#stockTab').click();
  assert.match(await page.locator('#workstationPane').innerText(), /Batteries/);
  assert.deepEqual(errors, []);
  await page.close();
});

test('cash edit, individual cents, and zero-change payments work', async () => {
  const { page, errors } = await openGame();
  await clockIn(page);
  await scanOrder(page, { items: { cola: 1, chips: 1 } });
  await page.evaluate(() => { customerNow().tender = 476; });
  await page.locator('#chargeBtn').click();
  await page.locator('#cancelPayment').click();
  assert.equal(await page.evaluate(() => state.phase), 'serving');
  await page.locator('#chargeBtn').click();
  await page.locator('#takeCash').click();
  await returnExactChange(page, 1);
  assert.equal(await page.evaluate(() => state.register), 475);
  // A new page gives an isolated version of the scripted shift.
  await page.reload();
  await clockIn(page);
  await scanOrder(page, { items: { cola: 1, chips: 1 } });
  await page.evaluate(() => { customerNow().tender = 475; });
  await page.locator('#chargeBtn').click();
  await page.locator('#takeCash').click();
  await returnExactChange(page, 0);
  assert.deepEqual(await page.evaluate(() => [state.register, state.mistakes]), [475, 0]);
  assert.deepEqual(errors, []);
  await page.close();
});

test('all 18 encounters complete through actual checkout, pump, and ID controls', async () => {
  const { page, errors } = await openGame();
  await clockIn(page);
  let expectedRevenue = 0;
  let refused = 0;
  for (let encounter = 0; encounter < 18; encounter++) {
    await page.waitForFunction(() => state.phase === 'serving');
    const c = await page.evaluate(() => customerNow());
    await scanOrder(page, c);
    if (c.items.smokes) {
      await page.locator('#chargeBtn').click();
      assert.equal(await page.evaluate(() => state.phase), 'serving', 'ID must be checked first');
      await page.locator('#idBtn').click();
      await page.locator('#idClose').click();
    }
    if (c.age < 21) {
      await page.locator('#refuseBtn').click();
      refused++;
    } else {
      await page.locator('#chargeBtn').click();
      const total = await page.evaluate(() => payment.total);
      expectedRevenue += total;
      if (c.payment === 'cash') {
        const change = await page.evaluate(() => payment.tender - payment.total);
        await page.locator('#takeCash').click();
        await returnExactChange(page, change);
      } else {
        await page.locator('#sendCard').click();
        await page.locator('#tapCard').click();
        assert.equal(await page.locator('#cancelPayment').isDisabled(), true);
        await page.waitForFunction(() => payment?.stage === 'approved');
        await page.locator('#printReceipt').click();
      }
    }
    assert.equal(await page.evaluate(() => state.phase), 'result');
    assert.equal(await page.evaluate(() => state.register), expectedRevenue);
    await page.locator('#nextVisitor').click();
    if ([5, 11].includes(encounter)) {
      await page.locator('#primaryModal').click();
      await page.locator('#primaryModal').click();
    }
  }
  assert.deepEqual(await page.evaluate(() => [state.completed, state.refusals, state.mistakes, ledger.length]), [18, 1, 0, 18]);
  assert.equal(refused, 1);
  assert.match(await page.locator('#modal').innerText(), /CLOCK\s+OUT/);
  await page.locator('#primaryModal').click();
  await page.locator('#primaryModal').click();
  assert.deepEqual(await page.evaluate(() => [state.register, state.completed, ledger.length]), [0, 0, 0]);
  assert.deepEqual(errors, []);
  await page.close();
});

test('wrong pump, invalid fuel amount, and receipt edits during payment are blocked', async () => {
  const { page, errors } = await openGame();
  await clockIn(page);
  await scanOrder(page, { items: { cola: 1, chips: 1 } });
  await page.locator('#chargeBtn').click();
  await page.locator('#takeCash').click();
  await returnExactChange(page, 525);
  await page.locator('#nextVisitor').click();
  await page.waitForFunction(() => state.phase === 'serving');
  await page.locator('[data-product="coffee"]').click();
  await page.locator('#pumpsBtn').click();
  await page.locator('[data-pump="1"]').click();
  await page.locator('#fuelInput').fill('20.001');
  await page.locator('#authorizeBtn').click();
  assert.equal(await page.evaluate(() => state.fuel), null);
  await page.locator('#fuelInput').fill('20.00');
  await page.locator('#authorizeBtn').click();
  await page.locator('#chargeBtn').click();
  assert.equal(await page.evaluate(() => state.phase), 'serving');
  await page.locator('#pumpsBtn').click();
  await page.locator('[data-pump="2"]').click();
  await page.locator('#authorizeBtn').click();
  await page.locator('#chargeBtn').click();
  assert.equal(await page.locator('#removeFuel').isDisabled(), true);
  assert.equal(await page.evaluate(() => payment.total), 2175);
  assert.equal(await page.evaluate(() => state.fuel.amount), 2000);
  await page.locator('#cancelPayment').click();
  await page.locator('#removeFuel').click();
  assert.equal(await page.evaluate(() => state.fuel), null);
  assert.deepEqual(errors, []);
  await page.close();
});

test('real arrivals animate and responsive layouts keep checkout usable', async () => {
  const { page, errors } = await openGame({ motion: 'no-preference' });
  await page.locator('#primaryModal').click();
  await page.locator('#primaryModal').click();
  assert.equal(await page.evaluate(() => state.phase), 'approaching');
  assert.equal(await page.locator('[data-product="cola"]').isDisabled(), true);
  await page.waitForFunction(() => state.phase === 'serving');
  assert.equal(await page.locator('.passer').count(), 3);
  await page.locator('#pendulumToy').click();
  assert.equal(await page.evaluate(() => document.querySelector('.pendulumArm').getAnimations().some(a => a.id === 'nudge')), true);
  await page.locator('#soundToggle').click();
  assert.equal(await page.locator('#soundToggle').getAttribute('aria-expanded'), 'true');
  await page.locator('#muteAudio').click();
  assert.equal(await page.locator('#muteAudio').getAttribute('aria-pressed'), 'true');
  await page.locator('#muteAudio').click();
  assert.equal(await page.locator('#muteAudio').getAttribute('aria-pressed'), 'false');
  await page.locator('#closeAudio').click();
  await page.screenshot({ path: 'test-results/desktop.png' });
  for (const [width, height] of [[1024, 768], [390, 844], [810, 700]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => scrollTo(0, 0));
    const gameBounds = await page.locator('#game').boundingBox();
    assert.equal(gameBounds.y, 0, 'the scene starts at the top of the page');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}px has no horizontal overflow`);
    await page.screenshot({ path: `test-results/scene-${width}.png`, fullPage: true });
    await scanOrder(page, { items: { cola: 1, chips: 1 } });
    await page.locator('#chargeBtn').click();
    await page.locator('#takeCash').click();
    const bounds = await page.locator('#giveChange').boundingBox();
    assert.ok(bounds.y + bounds.height <= height, 'drawer action is within viewport');
    await page.screenshot({ path: `test-results/layout-${width}.png`, fullPage: true });
    await page.locator('#cancelPayment').click();
    await page.locator('#clearBtn').click();
  }
  assert.deepEqual(errors, []);
  await page.close();
});
