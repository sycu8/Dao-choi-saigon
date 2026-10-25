// Landscape fullscreen and the minimal HUD. Decisions are pure so tests can run
// without a browser; initDisplay wires the Fullscreen API and the eye toggle.

import { onHudModeChange } from './input.js';

export const HUD_STORAGE_KEY = 'xebay.hud';
export const IOS_HINT_STORAGE_KEY = 'xebay.iosHint';

export function resolveHudMode(saved, { touch = false, landscape = false } = {}, forced = null) {
  if (forced === 'minimal' || forced === 'full') return forced;
  if (saved === 'minimal' || saved === 'full') return saved;
  return touch && landscape ? 'minimal' : 'full';
}

export function nextHudMode(current) {
  return current === 'minimal' ? 'full' : 'minimal';
}

export function isLandscapeViewport(width, height, orientationType = '') {
  const type = String(orientationType || '');
  if (type.startsWith('landscape')) return true;
  if (type.startsWith('portrait')) return false;
  return Number(width) > Number(height);
}

export function isIosSafari(ua, { maxTouchPoints = 0, platform = '' } = {}) {
  const text = String(ua || '');
  const classic = /iPad|iPhone|iPod/.test(text);
  const iPadOs = platform === 'MacIntel' && maxTouchPoints > 1;
  if (!classic && !iPadOs) return false;
  if (/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|OPT\//.test(text)) return false;
  return /WebKit/i.test(text);
}

export function isStandaloneDisplay({ navigatorStandalone = false, displayMode = '' } = {}) {
  return navigatorStandalone === true
    || displayMode === 'standalone'
    || displayMode === 'fullscreen'
    || displayMode === 'minimal-ui';
}

export function shouldShowIosInstallHint({ iosSafari, touch, landscape, standalone, dismissed } = {}) {
  return !!(iosSafari && touch && landscape && !standalone && !dismissed);
}

export function elementFullscreenSupported(doc) {
  if (!doc) return false;
  return !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled);
}

export function fullscreenGestureAction({ touch, landscape, fullscreen, userExited, supported } = {}) {
  if (!touch || !landscape || fullscreen || userExited) return 'none';
  return supported ? 'enter' : 'unsupported';
}

export function shouldExitFullscreenOnPortrait({ landscape, fullscreen } = {}) {
  return !!fullscreen && !landscape;
}

export function orientationEffects({ wasLandscape, landscape, fullscreen, userExited } = {}) {
  const enteredPortrait = !!wasLandscape && !landscape;
  const enteredLandscape = !wasLandscape && !!landscape;
  return {
    enteredPortrait,
    enteredLandscape,
    exitFullscreen: enteredPortrait && !!fullscreen,
    clearUserExit: enteredPortrait,
    armGesture: enteredPortrait || (enteredLandscape && !userExited),
  };
}

export async function requestGameFullscreen(doc) {
  const el = doc?.documentElement;
  if (!el) return false;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (typeof req !== 'function') return false;
  try {
    await req.call(el);
    return true;
  } catch {
    return false;
  }
}

export async function exitGameFullscreen(doc) {
  if (!doc) return false;
  const active = doc.fullscreenElement || doc.webkitFullscreenElement;
  if (!active) return false;
  const exit = doc.exitFullscreen || doc.webkitExitFullscreen;
  if (typeof exit !== 'function') return false;
  try {
    await exit.call(doc);
    return true;
  } catch {
    return false;
  }
}

export async function lockLandscapeOrientation(screenObj) {
  try {
    const lock = screenObj?.orientation?.lock;
    if (typeof lock !== 'function') return false;
    await lock.call(screenObj.orientation, 'landscape');
    return true;
  } catch {
    return false;
  }
}

export async function unlockOrientation(screenObj) {
  try {
    const unlock = screenObj?.orientation?.unlock;
    if (typeof unlock !== 'function') return false;
    unlock.call(screenObj.orientation);
    return true;
  } catch {
    return false;
  }
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

let pinned = false;
let userExited = false;
let gestureArmed = true;
let exitReason = '';
let wasLandscape = false;

function readForcedHud() {
  try {
    const value = new URLSearchParams(location.search).get('hud');
    if (value === 'minimal' || value === 'full') return value;
  } catch {
    /* location unavailable */
  }
  return null;
}

function readLandscape() {
  let type = '';
  try {
    type = screen.orientation?.type || '';
  } catch {
    /* orientation unavailable */
  }
  return isLandscapeViewport(innerWidth, innerHeight, type);
}

function controlContext() {
  return {
    touch: document.documentElement.dataset.controls === 'touch',
    landscape: readLandscape(),
  };
}

function updateHudToggle(mode) {
  const button = document.getElementById('hudToggle');
  if (!button) return;
  const minimal = mode === 'minimal';
  button.classList.toggle('is-minimal', minimal);
  button.setAttribute('aria-pressed', minimal ? 'true' : 'false');
  button.setAttribute('aria-label', minimal ? 'Hiện đầy đủ giao diện' : 'Thu gọn giao diện');
}

function setHudMode(mode, { persist }) {
  const root = document.documentElement;
  root.dataset.hud = mode === 'minimal' ? 'minimal' : 'full';
  if (persist) {
    pinned = true;
    storageSet(HUD_STORAGE_KEY, root.dataset.hud);
  }
  updateHudToggle(root.dataset.hud);
  onHudModeChange();
}

function syncHudToContext() {
  if (pinned) {
    updateHudToggle(document.documentElement.dataset.hud === 'minimal' ? 'minimal' : 'full');
    return;
  }
  const mode = resolveHudMode(null, controlContext(), null);
  if (document.documentElement.dataset.hud === mode) {
    updateHudToggle(mode);
    return;
  }
  setHudMode(mode, { persist: false });
}

function fullscreenActive() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

function syncFullscreenFlag() {
  const on = fullscreenActive();
  document.documentElement.dataset.fullscreen = on ? '1' : '0';
  const button = document.getElementById('fullscreenToggle');
  if (!button) return;
  button.setAttribute('aria-pressed', on ? 'true' : 'false');
  button.setAttribute('aria-label', on ? 'Thoát toàn màn hình' : 'Toàn màn hình');
}

function displayMode() {
  try {
    if (matchMedia('(display-mode: fullscreen)').matches) return 'fullscreen';
    if (matchMedia('(display-mode: standalone)').matches) return 'standalone';
    if (matchMedia('(display-mode: minimal-ui)').matches) return 'minimal-ui';
  } catch {
    /* matchMedia missing */
  }
  return '';
}

function syncIosHint() {
  const { touch, landscape } = controlContext();
  const show = shouldShowIosInstallHint({
    iosSafari: isIosSafari(navigator.userAgent || '', {
      maxTouchPoints: navigator.maxTouchPoints || 0,
      platform: navigator.platform || '',
    }),
    touch,
    landscape,
    standalone: isStandaloneDisplay({
      navigatorStandalone: navigator.standalone === true,
      displayMode: displayMode(),
    }),
    dismissed: storageGet(IOS_HINT_STORAGE_KEY) === 'dismissed',
  });
  const el = document.getElementById('iosHint');
  if (el) {
    el.classList.toggle('on', show);
    el.setAttribute('aria-hidden', show ? 'false' : 'true');
  }
  document.documentElement.dataset.iosHint = show ? 'on' : 'off';
}

function coarsePointer() {
  try {
    return !!matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

async function enterLandscapeFullscreen() {
  const ok = await requestGameFullscreen(document);
  await lockLandscapeOrientation(screen);
  if (!ok) syncIosHint();
  return ok;
}

function onPointerDown(event) {
  const target = event.target;
  if (target && target.closest && target.closest('#fullscreenToggle')) return;
  const touchLike = event.pointerType === 'touch' || coarsePointer();
  if (!touchLike || !gestureArmed) return;
  const { touch, landscape } = controlContext();
  const action = fullscreenGestureAction({
    touch,
    landscape,
    fullscreen: fullscreenActive(),
    userExited,
    supported: elementFullscreenSupported(document),
  });
  if (action === 'none') return;
  gestureArmed = false;
  if (action === 'enter') enterLandscapeFullscreen();
  else syncIosHint();
}

function onFullscreenEvent() {
  const on = fullscreenActive();
  syncFullscreenFlag();
  if (!on && exitReason === '') userExited = true;
  if (!on) exitReason = '';
}

function onOrientation() {
  const landscape = readLandscape();
  const effects = orientationEffects({
    wasLandscape,
    landscape,
    fullscreen: fullscreenActive(),
    userExited,
  });
  wasLandscape = landscape;
  if (effects.clearUserExit) userExited = false;
  if (effects.armGesture) gestureArmed = true;
  if (effects.exitFullscreen) {
    exitReason = 'portrait';
    exitGameFullscreen(document).then(() => unlockOrientation(screen));
  } else if (effects.enteredPortrait) {
    unlockOrientation(screen);
  }
  syncHudToContext();
  syncIosHint();
}

export function initDisplay() {
  const forced = readForcedHud();
  const saved = storageGet(HUD_STORAGE_KEY);
  if (forced || saved === 'minimal' || saved === 'full') pinned = true;
  const initial = resolveHudMode(saved, controlContext(), forced);
  document.documentElement.dataset.hud = initial;
  updateHudToggle(initial);
  onHudModeChange();
  wasLandscape = readLandscape();
  syncFullscreenFlag();
  syncIosHint();

  document.getElementById('hudToggle')?.addEventListener('click', () => {
    setHudMode(nextHudMode(document.documentElement.dataset.hud), { persist: true });
  });

  document.getElementById('fullscreenToggle')?.addEventListener('click', () => {
    if (fullscreenActive()) {
      exitReason = 'user';
      userExited = true;
      gestureArmed = false;
      exitGameFullscreen(document).then(() => unlockOrientation(screen));
      return;
    }
    userExited = false;
    gestureArmed = false;
    enterLandscapeFullscreen();
  });

  document.getElementById('iosHintClose')?.addEventListener('click', () => {
    storageSet(IOS_HINT_STORAGE_KEY, 'dismissed');
    syncIosHint();
  });

  window.addEventListener('pointerdown', onPointerDown, { capture: true });
  window.addEventListener('resize', onOrientation);
  window.addEventListener('orientationchange', onOrientation);
  try {
    screen.orientation?.addEventListener?.('change', onOrientation);
  } catch {
    /* orientation events unavailable */
  }
  try {
    matchMedia('(orientation: landscape)').addEventListener('change', onOrientation);
  } catch {
    /* matchMedia missing */
  }
  document.addEventListener('fullscreenchange', onFullscreenEvent);
  document.addEventListener('webkitfullscreenchange', onFullscreenEvent);
  document.documentElement.addEventListener('xebay-controls', () => {
    syncHudToContext();
    syncIosHint();
  });
}
