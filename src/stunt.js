// Barrel-roll stunt recovered from the 2.0 build (Xe Bay Sài Gòn, Oct 20).
// A roll takes 1.05s and only starts while flying at least 4m above the surface.

export const STUNT_TIME = 1.05;
export const STUNT_MIN_ALT = 4;

export function stuntGate({ canStunt, flying, clearance, busy }) {
  if (!canStunt) return 'vehicle';
  if (busy) return 'busy';
  if (!flying || clearance < STUNT_MIN_ALT) return 'air';
  return 'ok';
}

// Smoothstep 0→1 over the stunt, one full turn. Positive dir rolls right.
export function stuntRollAt(elapsed, dir) {
  const i = Math.min(1, Math.max(0, elapsed / STUNT_TIME));
  const s = i * i * (3 - 2 * i);
  return dir * Math.PI * 2 * s;
}

export function stuntFinished(elapsed) {
  return elapsed >= STUNT_TIME;
}
