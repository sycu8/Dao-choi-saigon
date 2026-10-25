// Bounding-box overlap used by the landscape HUD test. A box fully inside
// another is a parent (the control bar around its buttons, the stat around
// its readouts) and is not an overlap.
export function intersectionArea(a, b) {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  if (w <= 0.5 || h <= 0.5) return 0;
  return w * h;
}

export function containsBox(outer, inner) {
  const inside = outer.left <= inner.left + 1 && outer.top <= inner.top + 1
    && outer.right >= inner.right - 1 && outer.bottom >= inner.bottom - 1;
  if (!inside) return false;
  const outerArea = Math.max(0, outer.right - outer.left) * Math.max(0, outer.bottom - outer.top);
  const innerArea = Math.max(0, inner.right - inner.left) * Math.max(0, inner.bottom - inner.top);
  return outerArea > innerArea + 1;
}

export function findOverlaps(boxes) {
  const problems = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (containsBox(a, b) || containsBox(b, a)) continue;
      const area = intersectionArea(a, b);
      if (area > 0) problems.push({ a: a.name, b: b.name, area: Math.round(area) });
    }
  }
  return problems;
}
