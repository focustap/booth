import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, firefox } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { createGameServer } from '../scripts/serve.mjs';

let browser, server, origin;
before(async () => {
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
  server = createGameServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  await mkdir('test-results', { recursive: true });
});
after(async () => { await browser?.close(); await new Promise(resolve => server?.close(resolve)); });

async function open({ offline = false, motion = 'reduce', init, route, engine = browser } = {}) {
  const page = await engine.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: motion });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  if (init) await page.addInitScript(init);
  if (route) await route(page);
  await page.goto(offline ? pathToFileURL(resolve('index.html')).href : origin);
  return { page, errors };
}
async function begin(page) {
  await page.locator('#primaryModal').click();
  await page.locator('#primaryModal').click();
  await page.waitForFunction(() => state.phase === 'serving');
  await page.waitForFunction(() => audio.loops.size === 9);
}
async function meter(page) {
  return page.evaluate(() => {
    const samples = new Float32Array(audio.analyser.fftSize);
    audio.analyser.getFloatTimeDomainData(samples);
    return { rms: Math.sqrt(samples.reduce((s, x) => s + x * x, 0) / samples.length), peak: Math.max(...samples.map(Math.abs)) };
  });
}

test('original asset library contains valid, unclipped, non-silent WAVs and a byte-exact offline pack', async () => {
  const sandbox = { window: {} };
  runInNewContext(await readFile('assets/audio/catalog.js', 'utf8'), sandbox);
  runInNewContext(await readFile('assets/audio/offline.js', 'utf8'), sandbox);
  let count = 0;
  for (const [name, entries] of Object.entries(sandbox.window.NIGHT_AUDIO_CATALOG)) {
    for (const entry of entries) {
      const bytes = await readFile('assets/audio/' + entry.file);
      assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
      assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
      assert.equal(bytes.readUInt32LE(24), 22050);
      assert.equal(bytes.readUInt32LE(40), bytes.length - 44);
      assert.ok(bytes.equals(Buffer.from(sandbox.window.NIGHT_AUDIO_PACK[entry.file], 'base64')));
      let energy = 0, peak = 0;
      const n = (bytes.length - 44) / 2;
      for (let i = 0; i < n; i++) { const v = bytes.readInt16LE(44 + i * 2) / 32768; energy += v * v; peak = Math.max(peak, Math.abs(v)); }
      assert.ok(peak < .8 && peak > .05, name + ' has useful headroom');
      assert.ok(Math.sqrt(energy / n) > .015, name + ' is not silent');
      if (entry.loop) {
        // The seam is no steeper than an ordinary pair of neighboring samples.
        let largest = 0;
        for (let i = 1; i < n; i++) largest = Math.max(largest, Math.abs(bytes.readInt16LE(44 + i * 2) - bytes.readInt16LE(42 + i * 2)));
        const seam = Math.abs(bytes.readInt16LE(44) - bytes.readInt16LE(bytes.length - 2));
        assert.ok(seam <= largest + 1, name + ' has no seam spike');
      }
      count++;
    }
  }
  assert.equal(count, 60);
});

test('audio waits for a gesture, produces real PCM, persists its mix, and mutes every bus', async () => {
  const { page, errors } = await open();
  assert.equal(await page.evaluate(() => audio.ctx), null);
  await begin(page);
  await page.waitForTimeout(700);
  const audible = await meter(page);
  assert.ok(audible.rms > .001 && audible.peak < .85, JSON.stringify(audible));
  assert.equal(await page.evaluate(() => audio.snapshot().missing.length), 0);
  await page.locator('#soundToggle').click();
  for (const [id, value] of [['masterVolume', 37], ['ambienceVolume', 24], ['effectsVolume', 61]]) {
    await page.locator('#' + id).evaluate((el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, value);
  }
  await page.locator('#muteAudio').click();
  await page.waitForTimeout(450);
  assert.ok((await meter(page)).rms < .0001, 'mute silences the actual output');
  await page.screenshot({ path: 'test-results/audio-settings.png' });
  await page.reload();
  assert.deepEqual(await page.evaluate(() => audio.settings), { master: .37, ambience: .24, effects: .61, muted: true });
  assert.equal(await page.evaluate(() => audio.ctx), null, 'reload still respects autoplay');
  await begin(page);
  await page.locator('#soundToggle').click();
  await page.locator('#muteAudio').click();
  await page.waitForTimeout(500);
  assert.ok((await meter(page)).rms > .0001);
  assert.deepEqual(errors, []);
  await page.close();
});

test('cash, card, pump, and computer controls emit different material and equipment cues', async () => {
  const { page, errors } = await open();
  await begin(page);
  await page.locator('[data-product="cola"]').click();
  await page.waitForFunction(() => audio.events.some(e => e.name === 'scanner'));
  await page.locator('[data-product="chips"]').click();
  await page.locator('#chargeBtn').click();
  await page.locator('#takeCash').click();
  await page.waitForFunction(() => audio.events.some(e => e.name === 'drawer-open'));
  await page.locator('[data-denom="500"]').click();
  await page.waitForFunction(() => audio.events.some(e => e.name === 'paper'));
  await page.locator('[data-denom="25"]').click();
  await page.waitForFunction(() => audio.events.some(e => e.name === 'coin'));
  await page.locator('#giveChange').click();
  await page.waitForFunction(() => audio.events.some(e => e.name === 'receipt'));
  await page.locator('#ledgerTab').click();
  await page.waitForFunction(() => audio.events.some(e => e.name === 'mouse'));
  await page.locator('#nextVisitor').click();
  await page.waitForFunction(() => state.phase === 'serving');
  await page.locator('[data-product="coffee"]').click();
  await page.locator('#pumpsBtn').click();
  await page.locator('[data-pump="2"]').click();
  await page.locator('#fuelInput').fill('20');
  await page.locator('#authorizeBtn').click();
  await page.waitForFunction(() => audio.events.some(e => e.name === 'relay'));
  await page.waitForFunction(() => audio.events.some(e => e.name === 'pump-start'));
  await page.locator('#chargeBtn').click();
  await page.locator('#sendCard').click();
  await page.locator('#tapCard').click();
  await page.waitForFunction(() => payment?.stage === 'approved');
  await page.waitForFunction(() => audio.events.some(e => e.name === 'card-tap'));
  await page.waitForFunction(() => audio.events.some(e => e.name === 'approved'));
  await page.locator('#printReceipt').click();
  const names = await page.evaluate(() => audio.events.map(e => e.name));
  for (const name of ['scanner', 'paper', 'coin', 'drawer-open', 'drawer-close', 'receipt', 'relay', 'card-tap', 'approved']) assert.ok(names.includes(name), name);
  assert.deepEqual(errors, []);
  await page.close();
});

test('footsteps follow real arrivals and departures, and pendulum clicks follow actual motion', async () => {
  const { page, errors } = await open({ motion: 'no-preference' });
  await begin(page);
  await page.waitForTimeout(1500);
  assert.ok(await page.evaluate(() => audio.events.filter(e => e.name === 'footstep').length >= 3));
  assert.ok(await page.evaluate(() => audio.events.some(e => e.name === 'knock' && e.outside)));
  await page.waitForFunction(() => audio.events.filter(e => e.name === 'pendulum').length >= 2);
  await page.evaluate(() => document.querySelector('.pendulumArm').getAnimations().forEach(a => a.pause()));
  await page.waitForTimeout(150);
  const before = await page.evaluate(() => audio.events.filter(e => e.name === 'pendulum').length);
  await page.waitForTimeout(1600);
  assert.equal(await page.evaluate(() => audio.events.filter(e => e.name === 'pendulum').length), before, 'a stationary toy makes no clicks');
  await page.locator('#pendulumToy').click();
  await page.waitForFunction(n => audio.events.filter(e => e.name === 'pendulum').length > n, before);
  await page.locator('[data-product="cola"]').click();
  await page.locator('[data-product="chips"]').click();
  await page.locator('#chargeBtn').click();
  await page.locator('#takeCash').click();
  await page.locator('[data-denom="500"]').click();
  await page.locator('[data-denom="25"]').click();
  await page.locator('#giveChange').click();
  await page.waitForFunction(() => audio.events.some(e => e.name === 'engine' && e.group === 'encounter'));
  assert.deepEqual(errors, []);
  await page.close();
});

test('scripted shifts trigger contextual sounds and silence; restarting cancels old work', async () => {
  const { page, errors } = await open();
  await begin(page);
  await page.evaluate(() => { state.shift = 1; state.index = 0; startCustomer(); });
  await page.waitForFunction(() => audio.events.some(e => e.name === 'buzz' && e.group === 'story'));
  await page.evaluate(() => { state.shift = 2; state.index = 2; startCustomer(); });
  await page.waitForFunction(() => audio.events.some(e => e.name === 'knock' && e.group === 'story' && e.pan === -.9));
  await page.evaluate(() => { state.shift = 2; state.index = 5; startCustomer(); });
  await page.waitForFunction(() => audio.duck.gain.value < .1);
  await page.waitForFunction(() => audio.duck.gain.value > .8);
  await page.evaluate(() => { state.shift = 0; state.index = 0; showIntro(); });
  const generation = await page.evaluate(() => audio.generation);
  await page.waitForTimeout(550);
  assert.deepEqual(await page.evaluate(() => [audio.loops.size, audio.voices.size, audio.timers.size]), [0, 0, 0]);
  await page.waitForTimeout(600);
  assert.ok(await page.evaluate(g => audio.events.every(e => e.generation < g), generation), 'no queued events escape the reset');
  await begin(page);
  assert.equal(await page.evaluate(() => audio.loops.size), 9);
  assert.ok(await page.evaluate(() => audio.voices.size < 20));
  assert.deepEqual(errors, []);
  await page.close();
});

test('hidden tabs suspend and discard stale effects; disposal disconnects the graph', async () => {
  const { page, errors } = await open();
  await begin(page);
  await page.evaluate(() => audio.setHidden(true));
  await page.waitForFunction(() => audio.ctx.state === 'suspended');
  assert.equal(await page.evaluate(() => audio.timers.size), 0);
  const count = await page.evaluate(() => audio.events.length);
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => audio.events.length), count);
  await page.evaluate(() => audio.setHidden(false));
  await page.waitForFunction(() => audio.ctx.state === 'running');
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => audio.loops.size), 9);
  await page.evaluate(() => audio.dispose());
  await page.waitForFunction(() => audio.ctx.state === 'closed');
  assert.deepEqual(await page.evaluate(() => [audio.voices.size, audio.loops.size, audio.timers.size]), [0, 0, 0]);
  assert.deepEqual(errors, []);
  await page.close();
});

test('the outside world continues across checkout and customer transitions', async () => {
  const { page, errors } = await open();
  await begin(page);
  await page.evaluate(() => {
    audio.later(.2, () => audio.play('passing-car', { group: 'world', outside: true, pan: -.7, panTo: .7, gain: .2 }), 'world');
    audio.setScene('result', 0);
    audio.setScene('working', 0);
  });
  await page.waitForFunction(() => audio.events.some(e => e.name === 'passing-car'));
  await page.evaluate(() => audio.setScene('result', 0));
  assert.equal(await page.evaluate(() => [...audio.voices].find(v => v.name === 'passing-car')?.stopped), false);
  await page.evaluate(() => audio.setScene('end', 0));
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => [...audio.voices].some(v => v.name === 'passing-car')), false);
  assert.deepEqual(errors, []);
  await page.close();
});

test('direct file play decodes the offline asset pack without fetch or a server', async () => {
  const { page, errors } = await open({ offline: true });
  await begin(page);
  assert.equal(await page.evaluate(() => !!window.NIGHT_AUDIO_PACK), true);
  assert.deepEqual(await page.evaluate(() => audio.snapshot().missing), []);
  await page.waitForTimeout(500);
  assert.ok((await meter(page)).rms > .001);
  assert.deepEqual(errors, []);
  await page.close();
});

test('missing assets, unavailable audio APIs, and denied storage never stop checkout', async () => {
  const broken = await open({ route: async page => {
    await page.route('**/assets/audio/*.wav', route => route.abort());
    await page.route('**/assets/audio/offline.js', route => route.abort());
  } });
  await begin(broken.page);
  assert.ok(await broken.page.evaluate(() => audio.failures.size > 0));
  await broken.page.locator('[data-product="cola"]').click();
  assert.equal(await broken.page.evaluate(() => totalBasket()), 225);
  assert.deepEqual(broken.errors, []);
  await broken.page.close();
  const unavailable = await open({ init: () => {
    window.AudioContext = undefined; window.webkitAudioContext = undefined;
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage denied'); } });
  } });
  await unavailable.page.locator('#primaryModal').click();
  await unavailable.page.locator('#primaryModal').click();
  await unavailable.page.waitForFunction(() => state.phase === 'serving');
  await unavailable.page.locator('[data-product="cola"]').click();
  assert.equal(await unavailable.page.evaluate(() => totalBasket()), 225);
  await unavailable.page.locator('#soundToggle').click();
  assert.match(await unavailable.page.locator('#audioStatus').innerText(), /unavailable/);
  await unavailable.page.locator('#muteAudio').click();
  assert.deepEqual(unavailable.errors, []);
  await unavailable.page.close();
});

test('preview server serves audio with correct MIME and rejects unrelated paths', async () => {
  const wav = await fetch(origin + '/assets/audio/coin-1.wav');
  assert.equal(wav.status, 200);
  assert.equal(wav.headers.get('content-type'), 'audio/wav');
  const js = await fetch(origin + '/audio.js');
  assert.match(js.headers.get('content-type'), /javascript/);
  assert.equal((await fetch(origin + '/package.json')).status, 404);
  assert.equal((await fetch(origin + '/assets/audio/%2e%2e%2fpackage.json')).status, 404);
});

test('Edge and Firefox decode the assets and start a mixed audio graph', async t => {
  for (const name of ['edge', 'firefox']) {
    await t.test(name, async sub => {
      let other;
      try {
        other = name === 'edge' ? await chromium.launch({ channel: 'msedge', headless: true }) : await firefox.launch({ headless: true });
      } catch (error) {
        if (process.env.AUDIO_CROSS_BROWSER !== '1') { sub.skip(name + ' unavailable; set AUDIO_CROSS_BROWSER=1 to require it'); return; }
        throw error;
      }
      try {
        const { page, errors } = await open({ engine: other });
        await begin(page);
        await page.waitForTimeout(800);
        assert.equal(await page.evaluate(() => audio.snapshot().missing.length), 0);
        assert.ok((await meter(page)).rms > .0001);
        await page.locator('[data-product="cola"]').click();
        await page.waitForFunction(() => audio.events.some(e => e.name === 'scanner'));
        assert.deepEqual(errors, []);
        await page.close();
      } finally { await other.close(); }
    });
  }
});
