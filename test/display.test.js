import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HUD_STORAGE_KEY,
  IOS_HINT_STORAGE_KEY,
  elementFullscreenSupported,
  exitGameFullscreen,
  fullscreenGestureAction,
  isIosSafari,
  isLandscapeViewport,
  isStandaloneDisplay,
  lockLandscapeOrientation,
  nextHudMode,
  orientationEffects,
  requestGameFullscreen,
  resolveHudMode,
  shouldExitFullscreenOnPortrait,
  shouldShowIosInstallHint,
  unlockOrientation,
} from '../src/display.js';

const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.108 Mobile/15E148 Safari/604.1';
const DESKTOP_CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

test('hud mode defaults to minimal only for touch landscape', () => {
  assert.equal(HUD_STORAGE_KEY, 'xebay.hud');
  assert.equal(resolveHudMode(null, { touch: true, landscape: true }), 'minimal');
  assert.equal(resolveHudMode(null, { touch: true, landscape: false }), 'full');
  assert.equal(resolveHudMode(null, { touch: false, landscape: true }), 'full');
  assert.equal(resolveHudMode(undefined, {}), 'full');
});

test('a saved or forced hud mode wins over the landscape default', () => {
  assert.equal(resolveHudMode('full', { touch: true, landscape: true }), 'full');
  assert.equal(resolveHudMode('minimal', { touch: false, landscape: false }), 'minimal');
  assert.equal(resolveHudMode('full', { touch: true, landscape: true }, 'minimal'), 'minimal');
  assert.equal(resolveHudMode('minimal', { touch: true, landscape: true }, 'nope'), 'minimal');
  assert.equal(resolveHudMode('cinema', { touch: false, landscape: false }), 'full');
});

test('the eye toggle flips between minimal and full', () => {
  assert.equal(nextHudMode('full'), 'minimal');
  assert.equal(nextHudMode('minimal'), 'full');
  assert.equal(nextHudMode('other'), 'minimal');
});

test('landscape follows the orientation type, then the viewport', () => {
  assert.equal(isLandscapeViewport(844, 390), true);
  assert.equal(isLandscapeViewport(390, 844), false);
  assert.equal(isLandscapeViewport(390, 390), false);
  assert.equal(isLandscapeViewport(390, 844, 'landscape-primary'), true);
  assert.equal(isLandscapeViewport(844, 390, 'portrait-primary'), false);
});

test('iOS Safari is distinguished from other browsers', () => {
  assert.equal(isIosSafari(IPHONE_SAFARI), true);
  assert.equal(isIosSafari(IPHONE_CHROME), false);
  assert.equal(isIosSafari(DESKTOP_CHROME, { platform: 'MacIntel', maxTouchPoints: 0 }), false);
  assert.equal(isIosSafari(DESKTOP_CHROME, { platform: 'MacIntel', maxTouchPoints: 5 }), true);
  assert.equal(isIosSafari(''), false);
});

test('the home-screen hint is only for iOS Safari touch landscape', () => {
  assert.equal(IOS_HINT_STORAGE_KEY, 'xebay.iosHint');
  const base = { iosSafari: true, touch: true, landscape: true, standalone: false, dismissed: false };
  assert.equal(shouldShowIosInstallHint(base), true);
  assert.equal(shouldShowIosInstallHint({ ...base, iosSafari: false }), false);
  assert.equal(shouldShowIosInstallHint({ ...base, touch: false }), false);
  assert.equal(shouldShowIosInstallHint({ ...base, landscape: false }), false);
  assert.equal(shouldShowIosInstallHint({ ...base, standalone: true }), false);
  assert.equal(shouldShowIosInstallHint({ ...base, dismissed: true }), false);
  assert.equal(isStandaloneDisplay({ navigatorStandalone: true }), true);
  assert.equal(isStandaloneDisplay({ displayMode: 'minimal-ui' }), true);
  assert.equal(isStandaloneDisplay({ displayMode: 'browser' }), false);
});

test('fullscreen is requested on the first landscape touch and left in portrait', () => {
  const ready = { touch: true, landscape: true, fullscreen: false, userExited: false, supported: true };
  assert.equal(fullscreenGestureAction(ready), 'enter');
  assert.equal(fullscreenGestureAction({ ...ready, supported: false }), 'unsupported');
  assert.equal(fullscreenGestureAction({ ...ready, userExited: true }), 'none');
  assert.equal(fullscreenGestureAction({ ...ready, fullscreen: true }), 'none');
  assert.equal(fullscreenGestureAction({ ...ready, landscape: false }), 'none');
  assert.equal(fullscreenGestureAction({ ...ready, touch: false }), 'none');
  assert.equal(shouldExitFullscreenOnPortrait({ landscape: false, fullscreen: true }), true);
  assert.equal(shouldExitFullscreenOnPortrait({ landscape: true, fullscreen: true }), false);
  assert.equal(elementFullscreenSupported({ fullscreenEnabled: true }), true);
  assert.equal(elementFullscreenSupported({ webkitFullscreenEnabled: 1 }), true);
  assert.equal(elementFullscreenSupported({}), false);
  assert.equal(elementFullscreenSupported(null), false);
});

test('turning back to portrait exits fullscreen and arms the next landscape gesture', () => {
  assert.deepEqual(orientationEffects({ wasLandscape: true, landscape: false, fullscreen: true, userExited: true }), {
    enteredPortrait: true,
    enteredLandscape: false,
    exitFullscreen: true,
    clearUserExit: true,
    armGesture: true,
  });
  assert.deepEqual(orientationEffects({ wasLandscape: false, landscape: true, fullscreen: false, userExited: false }), {
    enteredPortrait: false,
    enteredLandscape: true,
    exitFullscreen: false,
    clearUserExit: false,
    armGesture: true,
  });
  assert.deepEqual(orientationEffects({ wasLandscape: false, landscape: true, fullscreen: false, userExited: true }), {
    enteredPortrait: false,
    enteredLandscape: true,
    exitFullscreen: false,
    clearUserExit: false,
    armGesture: false,
  });
  assert.equal(orientationEffects({ wasLandscape: true, landscape: true, fullscreen: true, userExited: false }).exitFullscreen, false);
});

test('fullscreen and orientation calls fail silently', async () => {
  let locked = null;
  const doc = {
    fullscreenEnabled: true,
    fullscreenElement: null,
    documentElement: {
      requestFullscreen() {
        doc.fullscreenElement = doc.documentElement;
        return Promise.reject(new Error('gesture required'));
      },
    },
    exitFullscreen() {
      throw new Error('should not exit');
    },
  };
  assert.equal(await requestGameFullscreen(doc), false);
  assert.equal(await exitGameFullscreen({ fullscreenElement: null }), false);
  assert.equal(await exitGameFullscreen({
    fullscreenElement: {},
    exitFullscreen() {
      return Promise.reject(new Error('blocked'));
    },
  }), false);
  assert.equal(await requestGameFullscreen({ documentElement: {} }), false);
  assert.equal(await lockLandscapeOrientation({}), false);
  assert.equal(await lockLandscapeOrientation({
    orientation: {
      lock(value) {
        locked = value;
        return Promise.reject(new Error('denied'));
      },
    },
  }), false);
  assert.equal(locked, 'landscape');
  let unlocked = false;
  assert.equal(await unlockOrientation({ orientation: { unlock() { unlocked = true; } } }), true);
  assert.equal(unlocked, true);
  assert.equal(await unlockOrientation({}), false);
  assert.equal(await exitGameFullscreen({
    webkitFullscreenElement: {},
    webkitExitFullscreen() {
      return Promise.resolve();
    },
  }), true);
});
