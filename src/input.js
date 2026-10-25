export const keys = {};

const PREVENT = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

export function initInput(onPress) {
  addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (PREVENT.includes(e.code)) e.preventDefault();
    if (!e.repeat) onPress(e.code);
  });
  addEventListener('keyup', (e) => (keys[e.code] = false));

  document.querySelectorAll('[data-key]').forEach((button) => {
    const k = button.dataset.key;
    button.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      keys[k] = true;
      button.setPointerCapture(e.pointerId);
    });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(event, () => (keys[k] = false));
  });
}

export const axis = () => ({
  accel: !!(keys.KeyW || keys.ArrowUp),
  brake: !!(keys.KeyS || keys.ArrowDown),
  turn: (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0),
  boost: !!keys.ShiftLeft,
  up: !!keys.KeyE,
  down: !!keys.KeyQ,
});
