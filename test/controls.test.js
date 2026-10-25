import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { axis, detectControlScheme, keys, readAxes, resolveControlScheme, shouldReleaseHold, visibleTouchActions } from '../src/input.js';
import { STUNT_MIN_ALT, STUNT_TIME, stuntFinished, stuntGate, stuntRollAt } from '../src/stunt.js';
import { models } from '../src/vehicles.js';

test('coarse pointer with touch support uses the touch scheme', () => {
  assert.equal(detectControlScheme({ pointerCoarse: true, touchSupport: true, maxTouchPoints: 0 }), 'touch');
});

test('coarse pointer with maxTouchPoints uses the touch scheme', () => {
  assert.equal(detectControlScheme({ pointerCoarse: true, touchSupport: false, maxTouchPoints: 5 }), 'touch');
});

test('a fine pointer stays on keyboard even with a touchscreen', () => {
  assert.equal(detectControlScheme({ pointerCoarse: false, touchSupport: true, maxTouchPoints: 10 }), 'keyboard');
});

test('a coarse pointer without touch stays on keyboard', () => {
  assert.equal(detectControlScheme({ pointerCoarse: true, touchSupport: false, maxTouchPoints: 0 }), 'keyboard');
});

test('missing signals default to keyboard', () => {
  assert.equal(detectControlScheme(), 'keyboard');
});

test('manual and URL scheme override detection', () => {
  assert.equal(resolveControlScheme('touch', 'keyboard', null), 'keyboard');
  assert.equal(resolveControlScheme('keyboard', 'touch', null), 'touch');
  assert.equal(resolveControlScheme('keyboard', 'touch', 'keyboard'), 'keyboard');
  assert.equal(resolveControlScheme('touch', null, null), 'touch');
  assert.equal(resolveControlScheme('touch', 'gamepad', 'nope'), 'touch');
});

test('axis reuses one object and reads the keyboard', () => {
  for (const code of Object.keys(keys)) keys[code] = false;
  const first = axis();
  assert.equal(axis(), first);
  keys.KeyW = true;
  keys.ArrowLeft = true;
  keys.ShiftRight = true;
  keys.KeyE = true;
  const sample = axis();
  assert.equal(sample.accel, true);
  assert.equal(sample.turn, 1);
  assert.equal(sample.boost, true);
  assert.equal(sample.up, true);
  keys.KeyW = false;
  keys.ArrowLeft = false;
  keys.ShiftRight = false;
  keys.KeyE = false;
  keys.KeyD = true;
  assert.equal(axis().turn, -1);
  keys.KeyD = false;
});

test('the stick steers and throttles only past the deadzone', () => {
  const out = { accel: false, brake: false, turn: 0, boost: false, up: false, down: false };
  const base = { left: false, right: false, forward: false, back: false, stickActive: true, stickX: 0.1, stickY: -0.1, boost: false, up: false, down: false };
  readAxes(base, out);
  assert.equal(out.turn, 0);
  assert.equal(out.accel, false);
  readAxes({ ...base, stickX: 0.8, stickY: -0.8 }, out);
  assert.ok(out.turn < 0);
  assert.equal(out.accel, true);
  assert.equal(out.brake, false);
  readAxes({ ...base, stickX: -0.5, stickY: 0.7, forward: true }, out);
  assert.ok(out.turn > 0);
  assert.equal(out.accel, true);
  assert.equal(out.brake, true);
});

test('Ninja Lead keeps the recovered flight definition', () => {
  const ninja = models.find((model) => model.id === 'ninja');
  assert.equal(ninja.short, 'Ninja Lead');
  assert.equal(ninja.name, 'Ninja xe Lead');
  assert.equal(ninja.kind, 'scooter');
  assert.equal(ninja.canFly, true);
  assert.equal(ninja.stunt, true);
  assert.equal(ninja.color, '#efe6cf');
  assert.equal(ninja.mass, 172);
  assert.equal(ninja.topSpeed, 25);
  assert.equal(ninja.max, 25);
  assert.deepEqual(ninja.flight, {
    thrust: 9,
    maxSpeed: 46,
    climbRate: 8,
    yawRate: 1.5,
    response: 3.2,
    lateralGrip: 3.2,
    bank: 0.6,
  });
});

test('a loop starts only in the air and eases through one turn', () => {
  assert.equal(stuntGate({ canStunt: false, flying: true, clearance: 10, busy: false }), 'vehicle');
  assert.equal(stuntGate({ canStunt: true, flying: false, clearance: 10, busy: false }), 'air');
  assert.equal(stuntGate({ canStunt: true, flying: true, clearance: STUNT_MIN_ALT - 0.1, busy: false }), 'air');
  assert.equal(stuntGate({ canStunt: true, flying: true, clearance: STUNT_MIN_ALT, busy: true }), 'busy');
  assert.equal(stuntGate({ canStunt: true, flying: true, clearance: STUNT_MIN_ALT, busy: false }), 'ok');
  assert.equal(stuntRollAt(0, 1), 0);
  assert.ok(Math.abs(stuntRollAt(STUNT_TIME / 2, 1) - Math.PI) < 0.01);
  assert.ok(Math.abs(stuntRollAt(STUNT_TIME, -1) + Math.PI * 2) < 1e-6);
  assert.equal(stuntFinished(STUNT_TIME), true);
  assert.equal(stuntFinished(STUNT_TIME - 0.01), false);
});

test('touch actions drop throttle and brake and show climb only in the air', () => {
  assert.deepEqual(visibleTouchActions(), ['boost', 'fly', 'horn']);
  assert.deepEqual(visibleTouchActions({ flying: true }), ['climb', 'descend', 'boost', 'fly', 'horn']);
  assert.deepEqual(visibleTouchActions({ flying: false, canStunt: true }), ['boost', 'fly', 'horn']);
  assert.deepEqual(visibleTouchActions({ flying: true, canStunt: true }), ['climb', 'descend', 'boost', 'fly', 'stunt', 'horn']);
  for (const actions of [visibleTouchActions(), visibleTouchActions({ flying: true, canStunt: true })]) {
    assert.equal(actions.includes('throttle'), false);
    assert.equal(actions.includes('brake'), false);
  }
});

test('a held touch releases on its own pointer and survives a different one', () => {
  assert.equal(shouldReleaseHold(null, 1, 'pointerup'), false);
  assert.equal(shouldReleaseHold(3, 3, 'pointerup'), true);
  assert.equal(shouldReleaseHold(3, 9, 'pointerup'), false);
  assert.equal(shouldReleaseHold(3, 3, 'pointercancel'), true);
  assert.equal(shouldReleaseHold(3, 9, 'lostpointercapture'), false);
  assert.equal(shouldReleaseHold(3, 3, 'lostpointercapture'), true);
  assert.equal(shouldReleaseHold(3, null, 'touchend'), true);
  assert.equal(shouldReleaseHold(3, null, 'touchcancel'), true);
  assert.equal(shouldReleaseHold(3, 3, 'click'), false);
  assert.equal(shouldReleaseHold(0, 0, 'pointerup'), true);
});

test('the touch pad markup has no duplicate throttle or brake buttons', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const start = html.indexOf('id="touchActions"');
  const end = html.indexOf('id="pause"');
  const pad = html.slice(start, end);
  assert.equal(pad.includes('data-key="KeyW"'), false);
  assert.equal(pad.includes('data-key="KeyS"'), false);
  assert.equal(pad.includes('aria-label="Ga"'), false);
  assert.equal(pad.includes('aria-label="Phanh"'), false);
  assert.match(pad, /data-action="climb"[^>]*data-need="flying"[^>]*data-key="KeyE"/);
  assert.match(pad, /data-action="descend"[^>]*data-need="flying"[^>]*data-key="KeyQ"/);
  assert.match(pad, /data-action="stunt"[^>]*data-need="stunt"/);
  assert.match(pad, /data-action="boost"[^>]*data-key="ShiftLeft"/);
  assert.match(pad, /data-action="horn"[^>]*data-key="KeyH"/);
  assert.match(pad, /id="mfly"/);
  assert.match(html, /touch-action:\s*none/);
  assert.match(html, /html\[data-hud="minimal"\]\[data-flying="1"\] #alt\{display:block !important\}/);
  assert.match(html, /pointer-events:none/);
});
