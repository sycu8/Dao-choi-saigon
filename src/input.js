// Smart controls: one reused axis object, no allocations in the frame loop.
// Device pick uses (pointer: coarse), touch support and maxTouchPoints.
// A manual choice in localStorage wins over detection. ?controls=touch|keyboard forces it.

export const keys = {};

const STORAGE_KEY = 'xebay.controls';
const HINT_KEY = 'xebay.controlsHint';
const DEADZONE = 0.2;
const LOOK_SPEED = 0.0045;
const YAW_LIMIT = 1.15;
const PITCH_LIMIT = 0.45;

const AXIS = { accel: false, brake: false, turn: 0, boost: false, up: false, down: false };
const STICK = { x: 0, y: 0, active: false };
const PREVENT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export const cameraLook = { yaw: 0, pitch: 0 };

const mouse = { id: -1, dragging: false, x: 0, y: 0, ox: 0, oy: 0 };
const stickPtr = { id: -1, cx: 0, cy: 0, radius: 34 };
const heldCount = Object.create(null);

let scheme = 'keyboard';
let hintForced = false;
let canvas = null;
let knob = null;
const dismissed = new Set();

const HINTS = {
  touch: 'Cảm ứng: kéo cần bên trái để lái, ga và phanh. Nút bên phải: ga, phanh, tăng tốc, lên, xuống, bay, lộn vòng và còi. Chạm nhiều ngón cùng lúc được.',
  keyboard: 'Bàn phím: WASD hoặc phím mũi tên để lái. Shift tăng tốc, Space bay hoặc hạ cánh, Q/E xuống hoặc lên, L lộn vòng khi đang bay, H còi. Kéo chuột để xoay camera.',
};
const TOASTS = {
  touch: 'Cần trái để lái · nút phải để ga, bay và lộn vòng',
  keyboard: 'WASD lái · Space bay · Shift tăng tốc · L lộn vòng',
};
const SCHEME_LABEL = { touch: 'Cảm ứng', keyboard: 'Bàn phím' };

export function detectControlScheme({ pointerCoarse = false, touchSupport = false, maxTouchPoints = 0 } = {}) {
  const points = typeof maxTouchPoints === 'number' && maxTouchPoints > 0 ? maxTouchPoints : 0;
  if (pointerCoarse && (touchSupport || points > 0)) return 'touch';
  return 'keyboard';
}

export function resolveControlScheme(detected, saved, forced) {
  if (forced === 'touch' || forced === 'keyboard') return forced;
  if (saved === 'touch' || saved === 'keyboard') return saved;
  return detected === 'touch' ? 'touch' : 'keyboard';
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function clampStick(dx, dy, radius, out) {
  const r = radius > 0 ? radius : 1;
  let x = dx / r;
  let y = dy / r;
  const mag = Math.hypot(x, y);
  if (mag > 1) {
    x /= mag;
    y /= mag;
  }
  out.x = x;
  out.y = y;
  return out;
}

// state.stickX is +right. Turn is +left, matching A / ArrowLeft.
export function readAxes(state, out) {
  let turn = (state.left ? 1 : 0) - (state.right ? 1 : 0);
  let accel = !!state.forward;
  let brake = !!state.back;
  if (state.stickActive) {
    const sx = state.stickX;
    const sy = state.stickY;
    if (sx > DEADZONE || sx < -DEADZONE) turn = clamp(turn - sx, -1, 1);
    if (sy < -DEADZONE) accel = true;
    else if (sy > DEADZONE) brake = true;
  }
  out.accel = accel;
  out.brake = brake;
  out.turn = turn;
  out.boost = !!state.boost;
  out.up = !!state.up;
  out.down = !!state.down;
  return out;
}

const stickState = {
  left: false, right: false, forward: false, back: false,
  stickActive: false, stickX: 0, stickY: 0, boost: false, up: false, down: false,
};

export function axis() {
  stickState.left = !!(keys.KeyA || keys.ArrowLeft);
  stickState.right = !!(keys.KeyD || keys.ArrowRight);
  stickState.forward = !!(keys.KeyW || keys.ArrowUp);
  stickState.back = !!(keys.KeyS || keys.ArrowDown);
  stickState.boost = !!(keys.ShiftLeft || keys.ShiftRight);
  stickState.up = !!keys.KeyE;
  stickState.down = !!keys.KeyQ;
  stickState.stickActive = STICK.active;
  stickState.stickX = STICK.x;
  stickState.stickY = STICK.y;
  return readAxes(stickState, AXIS);
}

export function updateInput(dt) {
  if (mouse.dragging || scheme !== 'keyboard') return;
  const k = Math.min(1, dt * 3.5);
  cameraLook.yaw += -cameraLook.yaw * k;
  cameraLook.pitch += -cameraLook.pitch * k;
  if (cameraLook.yaw * cameraLook.yaw < 1e-6) cameraLook.yaw = 0;
  if (cameraLook.pitch * cameraLook.pitch < 1e-6) cameraLook.pitch = 0;
}

export function getScheme() {
  return scheme;
}

function storageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

function browserSignals() {
  let pointerCoarse = false;
  try {
    pointerCoarse = !!matchMedia('(pointer: coarse)').matches;
  } catch {
    /* matchMedia missing */
  }
  const points = navigator.maxTouchPoints || 0;
  const touchSupport = 'ontouchstart' in window || points > 0;
  return { pointerCoarse, touchSupport, maxTouchPoints: points };
}

function loadDismissed() {
  dismissed.clear();
  const raw = storageGet(HINT_KEY);
  if (!raw) return;
  for (const part of raw.split(',')) if (part === 'touch' || part === 'keyboard') dismissed.add(part);
}

function saveDismissed() {
  storageSet(HINT_KEY, [...dismissed].join(','));
}

function pressKey(code) {
  heldCount[code] = (heldCount[code] || 0) + 1;
  keys[code] = true;
}

function releaseKey(code) {
  heldCount[code] = (heldCount[code] || 1) - 1;
  if (heldCount[code] <= 0) {
    heldCount[code] = 0;
    keys[code] = false;
  }
}

function resetStick() {
  stickPtr.id = -1;
  STICK.active = false;
  STICK.x = 0;
  STICK.y = 0;
  if (knob) knob.style.transform = 'translate3d(0,0,0)';
}

function releaseTouchHolds() {
  resetStick();
  document.querySelectorAll('#touchActions [data-key]').forEach((button) => {
    if (button._pid == null) return;
    button._pid = null;
    button.classList.remove('down');
    releaseKey(button.dataset.key);
  });
}

function syncChrome() {
  const root = document.documentElement;
  root.dataset.controls = scheme;
  root.classList.toggle('looking', mouse.dragging && scheme === 'keyboard');
  const toggle = document.getElementById('schemeToggle');
  if (toggle) {
    toggle.textContent = SCHEME_LABEL[scheme];
    toggle.setAttribute('aria-label', scheme === 'touch' ? 'Đổi sang điều khiển bàn phím' : 'Đổi sang điều khiển cảm ứng');
  }
  const text = document.getElementById('controlsHintText');
  const box = document.getElementById('controlsHint');
  if (text) text.textContent = HINTS[scheme];
  if (box) {
    const show = hintForced || !dismissed.has(scheme);
    box.classList.toggle('on', show);
    box.setAttribute('aria-hidden', show ? 'false' : 'true');
  }
  const toast = document.getElementById('toast');
  if (toast && (toast.textContent === TOASTS.touch || toast.textContent === TOASTS.keyboard || toast.textContent === 'WASD lái · Space bay · Shift tăng tốc')) {
    toast.textContent = TOASTS[scheme];
  }
  const touch = document.getElementById('touch');
  if (touch) touch.setAttribute('aria-hidden', scheme === 'touch' ? 'false' : 'true');
}

function applyScheme(next, { persist }) {
  scheme = next === 'touch' ? 'touch' : 'keyboard';
  if (persist) storageSet(STORAGE_KEY, scheme);
  if (scheme !== 'touch') releaseTouchHolds();
  if (scheme !== 'keyboard') {
    mouse.dragging = false;
    mouse.id = -1;
    cameraLook.yaw = 0;
    cameraLook.pitch = 0;
  }
  syncChrome();
}

function toggleScheme() {
  hintForced = false;
  applyScheme(scheme === 'touch' ? 'keyboard' : 'touch', { persist: true });
}

function installGestureGuards() {
  const blockMove = (e) => {
    const el = e.target;
    if (el && el.closest && el.closest('#panel, .pcard, #controlsHint')) return;
    e.preventDefault();
  };
  document.addEventListener('touchmove', blockMove, { passive: false });
  const blockGesture = (e) => e.preventDefault();
  document.addEventListener('gesturestart', blockGesture, { passive: false });
  document.addEventListener('gesturechange', blockGesture, { passive: false });
  document.addEventListener('gestureend', blockGesture, { passive: false });
  let lastTouchEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = performance.now();
    const interactive = e.target && e.target.closest && e.target.closest('button, select, a, input, label, #panel, .pcard');
    if (!interactive && now - lastTouchEnd < 300) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });
  window.addEventListener('wheel', (e) => {
    if (e.ctrlKey) e.preventDefault();
  }, { passive: false });
}

function bindHoldButton(button) {
  const code = button.dataset.key;
  const end = (e) => {
    if (button._pid == null) return;
    if (e && e.pointerId !== undefined && e.pointerId !== button._pid) return;
    button._pid = null;
    button.classList.remove('down');
    releaseKey(code);
  };
  button.addEventListener('pointerdown', (e) => {
    if (button._pid != null) return;
    e.preventDefault();
    button._pid = e.pointerId;
    button.classList.add('down');
    try { button.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    pressKey(code);
  });
  button.addEventListener('pointerup', end);
  button.addEventListener('pointercancel', end);
  button.addEventListener('lostpointercapture', end);
}

function bindStick(stick) {
  knob = document.getElementById('stickKnob');
  const move = (e) => {
    if (e.pointerId !== stickPtr.id) return;
    clampStick(e.clientX - stickPtr.cx, e.clientY - stickPtr.cy, stickPtr.radius, STICK);
    STICK.active = true;
    if (knob) knob.style.transform = `translate3d(${(STICK.x * stickPtr.radius).toFixed(2)}px,${(STICK.y * stickPtr.radius).toFixed(2)}px,0)`;
  };
  stick.addEventListener('pointerdown', (e) => {
    if (stickPtr.id !== -1) return;
    e.preventDefault();
    const rect = stick.getBoundingClientRect();
    stickPtr.id = e.pointerId;
    stickPtr.cx = rect.left + rect.width / 2;
    stickPtr.cy = rect.top + rect.height / 2;
    stickPtr.radius = knob ? (stick.clientWidth - knob.clientWidth) / 2 : rect.width * 0.34;
    try { stick.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    move(e);
  });
  stick.addEventListener('pointermove', move);
  const end = (e) => {
    if (e.pointerId !== stickPtr.id) return;
    resetStick();
  };
  stick.addEventListener('pointerup', end);
  stick.addEventListener('pointercancel', end);
  stick.addEventListener('lostpointercapture', end);
}

function bindMouseLook() {
  canvas = document.querySelector('canvas');
  if (!canvas) return;
  canvas.addEventListener('pointerdown', (e) => {
    if (scheme !== 'keyboard') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    mouse.id = e.pointerId;
    mouse.dragging = false;
    mouse.x = mouse.ox = e.clientX;
    mouse.y = mouse.oy = e.clientY;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== mouse.id || scheme !== 'keyboard') return;
    if (!mouse.dragging) {
      const dx = e.clientX - mouse.ox;
      const dy = e.clientY - mouse.oy;
      if (dx * dx + dy * dy < 16) return;
      mouse.dragging = true;
      document.documentElement.classList.add('looking');
    }
    const dx = e.clientX - mouse.x;
    const dy = e.clientY - mouse.y;
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    cameraLook.yaw = clamp(cameraLook.yaw - dx * LOOK_SPEED, -YAW_LIMIT, YAW_LIMIT);
    cameraLook.pitch = clamp(cameraLook.pitch + dy * LOOK_SPEED, -PITCH_LIMIT, PITCH_LIMIT);
  });
  const end = (e) => {
    if (e.pointerId !== mouse.id) return;
    mouse.id = -1;
    mouse.dragging = false;
    document.documentElement.classList.remove('looking');
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
}

export function initInput(onPress) {
  loadDismissed();
  let forced = null;
  try {
    const v = new URLSearchParams(location.search).get('controls');
    if (v === 'touch' || v === 'keyboard') forced = v;
  } catch {
    /* location unavailable */
  }
  applyScheme(resolveControlScheme(detectControlScheme(browserSignals()), storageGet(STORAGE_KEY), forced), { persist: false });

  addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (PREVENT.has(e.code)) e.preventDefault();
    if (!e.repeat) onPress(e.code);
  });
  addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });
  addEventListener('blur', () => {
    for (const code in keys) keys[code] = false;
    for (const code in heldCount) heldCount[code] = 0;
    releaseTouchHolds();
    mouse.dragging = false;
    mouse.id = -1;
    document.documentElement.classList.remove('looking');
  });

  installGestureGuards();
  document.querySelectorAll('#touchActions [data-key]').forEach(bindHoldButton);
  const stick = document.getElementById('stick');
  if (stick) bindStick(stick);
  bindMouseLook();

  document.getElementById('schemeToggle')?.addEventListener('click', toggleScheme);
  document.getElementById('controlsHintClose')?.addEventListener('click', () => {
    hintForced = false;
    dismissed.add(scheme);
    saveDismissed();
    syncChrome();
  });
  document.getElementById('controlsHintOpen')?.addEventListener('click', () => {
    hintForced = true;
    syncChrome();
  });
  document.getElementById('touch')?.addEventListener('contextmenu', (e) => e.preventDefault());
}
