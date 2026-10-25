import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { containsBox, findOverlaps, intersectionArea } from '../src/hudLayout.js';

const CHROME = ['/usr/local/bin/google-chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((path) => existsSync(path));

test('intersection ignores a parent box and reports a real overlap', () => {
  const parent = { name: 'bar', left: 0, top: 0, right: 100, bottom: 40 };
  const child = { name: 'button', left: 10, top: 4, right: 40, bottom: 36 };
  const other = { name: 'card', left: 80, top: 20, right: 140, bottom: 80 };
  assert.equal(intersectionArea(parent, { name: 'far', left: 200, top: 0, right: 220, bottom: 20 }), 0);
  assert.equal(containsBox(parent, child), true);
  assert.equal(containsBox(child, parent), false);
  assert.deepEqual(findOverlaps([parent, child]), []);
  const hits = findOverlaps([parent, child, other]);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].a, 'bar');
  assert.equal(hits[0].b, 'card');
});

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function serveHtml(html) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function launchChrome(port, profile) {
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--hide-scrollbars',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let log = '';
  chrome.stderr.on('data', (chunk) => {
    log += chunk.toString();
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (log.includes('DevTools listening')) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (!log.includes('DevTools listening')) {
    chrome.kill();
    throw new Error(`Chrome did not open a debugging port: ${log.slice(0, 400)}`);
  }
  return chrome;
}

function connectCdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let next = 0;
  const pending = new Map();
  const waits = [];
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
      return;
    }
    for (let i = waits.length - 1; i >= 0; i--) {
      if (waits[i].method === message.method) {
        const wait = waits.splice(i, 1)[0];
        wait.resolve(message.params);
      }
    }
  });
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', () => reject(new Error('DevTools socket failed')));
  });
  return {
    ready,
    send(method, params = {}, sessionId) {
      const id = ++next;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        const payload = { id, method, params };
        if (sessionId) payload.sessionId = sessionId;
        ws.send(JSON.stringify(payload));
      });
    },
    wait(method) {
      return new Promise((resolve) => waits.push({ method, resolve }));
    },
    close() {
      ws.close();
    },
  };
}

const MEASURE = `(setup) => {
  const root = document.documentElement;
  root.dataset.controls = setup.controls;
  root.dataset.hud = setup.hud;
  root.dataset.flying = setup.flying ? '1' : '0';
  root.dataset.stunt = setup.flying ? '1' : '0';
  root.dataset.iosHint = setup.ios ? 'on' : 'off';
  document.getElementById('schemeToggle').textContent = setup.controls === 'touch' ? 'Cảm ứng' : 'Bàn phím';
  const mission = document.getElementById('mission');
  mission.classList.toggle('on', !!setup.mission);
  document.getElementById('mtitle').textContent = '📦 Giao hàng';
  document.getElementById('mtext').textContent = 'Giao hàng tới phố đi bộ Nguyễn Huệ';
  document.getElementById('mdist').textContent = '420 m';
  document.getElementById('mtimer').textContent = '⏱ 1:30';
  const hint = document.getElementById('controlsHint');
  hint.classList.toggle('on', !!setup.hint);
  document.getElementById('controlsHintText').textContent = 'Cảm ứng: kéo cần trái để lái, ga và phanh. Nút phải: tăng tốc, bay và còi. Khi bay thêm lên và xuống; Ninja Lead có lộn vòng. ⛶ toàn màn hình, 👁 thu gọn giao diện.';
  document.getElementById('toast').textContent = 'Khám phá Sài Gòn theo cách của bạn!';
  document.getElementById('iosHint').classList.toggle('on', !!setup.ios);
  const clipsY = (style) => ['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowY) || ['auto', 'scroll', 'hidden', 'clip'].includes(style.overflow);
  const visibleBox = (el, name) => {
    if (!el) return null;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return null;
    let rect = el.getBoundingClientRect();
    let node = el.parentElement;
    while (node && node !== document.documentElement) {
      const parentStyle = getComputedStyle(node);
      if (clipsY(parentStyle)) {
        const parent = node.getBoundingClientRect();
        const left = Math.max(rect.left, parent.left);
        const top = Math.max(rect.top, parent.top);
        const right = Math.min(rect.right, parent.right);
        const bottom = Math.min(rect.bottom, parent.bottom);
        rect = { left, top, right, bottom };
      }
      node = node.parentElement;
    }
    rect.width = rect.right - rect.left;
    rect.height = rect.bottom - rect.top;
    if (rect.width <= 1 || rect.height <= 1) return null;
    return { name, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
  };
  const boxes = [];
  const selectors = ['header', '.stat', '#panel', '#controlBar', '#controlsHint', '#minimap', '#toast', '#stick', '#touchActions', '#mission', '#iosHint', '#rotateHint', '#fullscreenToggle', '#hudToggle', '#schemeToggle', '#speed', '#alt', '#weather', '#traffic', '#clock', '#money'];
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    const next = visibleBox(el, selector);
    if (next) boxes.push(next);
  }
  for (const el of document.querySelectorAll('#touchActions button')) {
    const next = visibleBox(el, 'button:' + el.dataset.action);
    if (next) boxes.push(next);
  }
  const clip = (selector) => {
    const el = document.querySelector(selector);
    if (!el || getComputedStyle(el).display === 'none') return null;
    return { selector, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
  };
  const panel = document.getElementById('panel');
  const panelStyle = getComputedStyle(panel);
  return {
    boxes,
    clips: ['header', '.stat', '#panel', '#mission', '#controlsHint', '#toast'].map(clip).filter(Boolean),
    viewport: { width: innerWidth, height: innerHeight },
    panelDisplay: panelStyle.display,
    panelRects: panel.getClientRects().length,
    stat: visibleBox(document.querySelector('.stat'), '.stat'),
  };
}`;

test('phone and desktop HUD boxes do not overlap', { skip: !CHROME && 'Chrome is not installed' }, async () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
  const server = await serveHtml(html);
  const pagePort = server.address().port;
  const debugPort = await freePort();
  const profile = mkdtempSync(join(tmpdir(), 'hud-layout-'));
  const chrome = await launchChrome(debugPort, profile);
  let cdp;
  try {
    const version = await (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json();
    cdp = connectCdp(version.webSocketDebuggerUrl);
    await cdp.ready;
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params) => cdp.send(method, params, sessionId);
    await send('Page.enable');
    await send('Runtime.enable');

    const scenarios = [
      { name: '844x390 full flying', width: 844, height: 390, setup: { controls: 'touch', hud: 'full', flying: true, mission: true, hint: true, toast: true, ios: false }, corner: true, clip: true },
      { name: '844x390 full ground with home-screen hint', width: 844, height: 390, setup: { controls: 'touch', hud: 'full', flying: false, mission: true, hint: true, toast: true, ios: true }, corner: true, clip: true },
      { name: '844x390 minimal', width: 844, height: 390, setup: { controls: 'touch', hud: 'minimal', flying: true, mission: true, hint: true, toast: true, ios: false }, corner: true, minimal: true, clip: true },
      { name: '390x844 portrait', width: 390, height: 844, setup: { controls: 'touch', hud: 'full', flying: false, mission: true, hint: true, toast: true, ios: false } },
      { name: '1366x768 desktop', width: 1366, height: 768, setup: { controls: 'keyboard', hud: 'full', flying: false, mission: true, hint: true, toast: true, ios: false } },
    ];

    for (const scenario of scenarios) {
      await send('Emulation.setDeviceMetricsOverride', {
        width: scenario.width,
        height: scenario.height,
        deviceScaleFactor: 1,
        mobile: scenario.width < 900,
      });
      const loaded = cdp.wait('Page.loadEventFired');
      await send('Page.navigate', { url: `http://127.0.0.1:${pagePort}/` });
      await loaded;
      const measured = await send('Runtime.evaluate', {
        expression: `(${MEASURE})(${JSON.stringify(scenario.setup)})`,
        returnByValue: true,
      });
      const data = measured.result.value;
      assert.ok(data, scenario.name);
      assert.equal(data.viewport.width, scenario.width, scenario.name);
      assert.equal(data.viewport.height, scenario.height, scenario.name);
      const overlaps = findOverlaps(data.boxes);
      assert.deepEqual(overlaps, [], `${scenario.name} overlaps ${JSON.stringify(overlaps)} boxes ${JSON.stringify(data.boxes.map((box) => ({ name: box.name, left: Math.round(box.left), top: Math.round(box.top), right: Math.round(box.right), bottom: Math.round(box.bottom) })))}`);
      for (const box of data.boxes) {
        assert.ok(box.left >= -1 && box.top >= -1 && box.right <= scenario.width + 1 && box.bottom <= scenario.height + 1, `${scenario.name} ${box.name} is outside the screen`);
      }
      if (scenario.clip) {
        for (const clip of data.clips) {
          assert.ok(clip.scrollHeight <= clip.clientHeight + 2, `${scenario.name} ${clip.selector} is clipped vertically ${clip.scrollHeight}>${clip.clientHeight}`);
          assert.ok(clip.scrollWidth <= clip.clientWidth + 2, `${scenario.name} ${clip.selector} is clipped horizontally ${clip.scrollWidth}>${clip.clientWidth}`);
        }
      }
      if (scenario.corner) {
        assert.ok(data.stat && data.stat.top <= 12, `${scenario.name} stat top ${data.stat && data.stat.top}`);
        assert.ok(data.stat.right >= scenario.width - 12, `${scenario.name} stat right ${data.stat.right}`);
      }
      if (scenario.minimal) {
        assert.equal(data.panelDisplay, 'none', scenario.name);
        assert.equal(data.panelRects, 0, scenario.name);
        assert.equal(data.boxes.some((box) => box.name === '#panel'), false, scenario.name);
        assert.equal(data.boxes.some((box) => box.name === '#weather'), false, scenario.name);
        assert.equal(data.boxes.some((box) => box.name === '#toast'), false, scenario.name);
      }
    }
  } finally {
    if (cdp) cdp.close();
    chrome.kill('SIGKILL');
    await new Promise((resolve) => {
      if (chrome.exitCode !== null || chrome.signalCode !== null) resolve();
      else chrome.once('exit', resolve);
    });
    server.close();
    for (let attempt = 0; attempt < 12; attempt++) {
      try {
        rmSync(profile, { recursive: true, force: true });
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  }
});
