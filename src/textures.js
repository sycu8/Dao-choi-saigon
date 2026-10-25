import * as THREE from 'three';

function canvas(size, h = size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = h;
  return [c, c.getContext('2d')];
}

function speckle(ctx, w, h, count, alpha, light = true) {
  for (let i = 0; i < count; i++) {
    const v = light ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${Math.random() * alpha})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

const allTextures = [];
export function setAnisotropy(n) {
  for (const t of allTextures) {
    if (t.anisotropy === n) continue;
    t.anisotropy = n;
    t.needsUpdate = true;
  }
}

function toTexture(c, { srgb = true, repeat = true, anisotropy = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  allTextures.push(t);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = anisotropy;
  return t;
}

// One 65 m road-grid cell: intersection in the middle, block corners at the edges.
export function roadTileTexture(cell = 65, size = 1024) {
  const [c, ctx] = canvas(size);
  const s = size / cell, mid = size / 2;
  const m = (meters) => meters * s;

  ctx.fillStyle = '#9d9a8f';
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, size, 9000, 0.08, false);

  ctx.fillStyle = '#bbb7ab';
  ctx.fillRect(mid - m(13.5), 0, m(27), size);
  ctx.fillRect(0, mid - m(13.5), size, m(27));
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = 1;
  for (let k = -13; k <= 13; k++) {
    ctx.beginPath();
    ctx.moveTo(mid + m(k), 0);
    ctx.lineTo(mid + m(k), size);
    ctx.moveTo(0, mid + m(k));
    ctx.lineTo(size, mid + m(k));
    ctx.stroke();
  }

  ctx.fillStyle = '#6f6c66';
  ctx.fillRect(mid - m(10.35), 0, m(20.7), size);
  ctx.fillRect(0, mid - m(10.35), size, m(20.7));
  ctx.fillStyle = '#383e45';
  ctx.fillRect(mid - m(10), 0, m(20), size);
  ctx.fillRect(0, mid - m(10), size, m(20));
  speckle(ctx, size, size, 26000, 0.07, true);
  speckle(ctx, size, size, 12000, 0.12, false);

  for (let rot = 0; rot < 2; rot++) {
    ctx.save();
    ctx.translate(mid, mid);
    ctx.rotate((rot * Math.PI) / 2);
    ctx.translate(-mid, -mid);
    for (const side of [-1, 1]) {
      const from = side > 0 ? mid + m(14.5) : 0;
      const to = side > 0 ? size : mid - m(14.5);
      ctx.fillStyle = '#e9c34f';
      ctx.fillRect(mid - m(0.4), from, m(0.18), to - from);
      ctx.fillRect(mid + m(0.22), from, m(0.18), to - from);
      ctx.fillStyle = '#e8e6de';
      ctx.fillRect(mid - m(9.4), from, m(0.18), to - from);
      ctx.fillRect(mid + m(9.22), from, m(0.18), to - from);
      for (let y = from; y < to; y += m(6)) {
        ctx.fillRect(mid - m(5.1), y, m(0.16), m(3));
        ctx.fillRect(mid + m(4.94), y, m(0.16), m(3));
      }
      const stopY = side > 0 ? mid + m(14.5) : mid - m(14.9);
      ctx.fillRect(side > 0 ? mid - m(9.4) : mid, stopY, m(9.4), m(0.4));
      for (let x = -9; x < 9; x += 1.1) {
        ctx.fillRect(mid + m(x), side > 0 ? mid + m(10.8) : mid - m(13.8), m(0.55), m(3));
      }
    }
    ctx.restore();
  }
  return toTexture(c);
}

// Facade atlas of CELLS x CELLS window bays; the building shader picks a random offset per instance.
export const FACADE_CELLS = 8;
export function facadeTextures(style = 'concrete', size = 512) {
  const [mapC, map] = canvas(size);
  const [emC, em] = canvas(size);
  const [rC, rough] = canvas(size);
  const cell = size / FACADE_CELLS;
  const glass = style === 'glass';

  map.fillStyle = glass ? '#9fb3c0' : '#e9e5dc';
  map.fillRect(0, 0, size, size);
  if (!glass) speckle(map, size, size, 4000, 0.07, false);
  em.fillStyle = '#000';
  em.fillRect(0, 0, size, size);
  rough.fillStyle = glass ? 'rgb(0,120,0)' : 'rgb(0,225,0)';
  rough.fillRect(0, 0, size, size);

  for (let row = 0; row < FACADE_CELLS; row++) {
    const floorLit = Math.random();
    for (let col = 0; col < FACADE_CELLS; col++) {
      const x = col * cell, y = row * cell;
      const [wx, wy, ww, wh] = glass ? [x + 2, y + 3, cell - 4, cell - 8] : [x + cell * 0.16, y + cell * 0.22, cell * 0.68, cell * 0.56];
      const g = map.createLinearGradient(wx, wy, wx + ww, wy + wh);
      g.addColorStop(0, glass ? '#3d5f78' : '#33485a');
      g.addColorStop(0.55, glass ? '#5f86a0' : '#24323f');
      g.addColorStop(1, glass ? '#2c4a60' : '#3c5468');
      map.fillStyle = g;
      map.fillRect(wx, wy, ww, wh);
      rough.fillStyle = 'rgb(0,18,0)';
      rough.fillRect(wx, wy, ww, wh);
      if (!glass) {
        map.fillStyle = 'rgba(0,0,0,0.18)';
        map.fillRect(x, y + cell - 4, cell, 4);
      }
      const lit = glass ? floorLit < 0.45 && Math.random() < 0.8 : Math.random() < 0.38;
      if (lit) {
        const warm = Math.random() < 0.7;
        const k = 0.55 + Math.random() * 0.45;
        em.fillStyle = warm ? `rgb(${255 * k | 0},${205 * k | 0},${140 * k | 0})` : `rgb(${200 * k | 0},${228 * k | 0},${255 * k | 0})`;
        em.fillRect(wx, wy, ww, wh);
      }
    }
  }
  return {
    map: toTexture(mapC),
    emissiveMap: toTexture(emC),
    roughnessMap: toTexture(rC, { srgb: false }),
  };
}

export function helipadTexture(size = 256) {
  const [c, ctx] = canvas(size);
  ctx.fillStyle = '#3d4247';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#f1f1ea';
  ctx.lineWidth = size * 0.04;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.36, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#f1f1ea';
  const u = size / 16;
  ctx.fillRect(5 * u, 4 * u, 1.6 * u, 8 * u);
  ctx.fillRect(9.4 * u, 4 * u, 1.6 * u, 8 * u);
  ctx.fillRect(5 * u, 7.2 * u, 6 * u, 1.6 * u);
  return toTexture(c, { repeat: false });
}

// Colonial facade bay (shutters + arched window) for City Hall.
export function colonialTexture(size = 128) {
  const [c, ctx] = canvas(size);
  ctx.fillStyle = '#f1d38c';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#fbf3df';
  ctx.fillRect(0, size * 0.9, size, size * 0.1);
  ctx.fillRect(size * 0.22, size * 0.2, size * 0.56, size * 0.62);
  ctx.fillStyle = '#4e6b55';
  ctx.beginPath();
  ctx.moveTo(size * 0.28, size * 0.78);
  ctx.lineTo(size * 0.28, size * 0.38);
  ctx.arc(size * 0.5, size * 0.38, size * 0.22, Math.PI, 0);
  ctx.lineTo(size * 0.72, size * 0.78);
  ctx.fill();
  return toTexture(c);
}

// Tileable water normals from a sum of integer-frequency waves.
export function waterNormalTexture(size = 256) {
  const [c, ctx] = canvas(size);
  const img = ctx.createImageData(size, size);
  const waves = [];
  for (let i = 0; i < 14; i++) waves.push([1 + Math.floor(Math.random() * 9), Math.floor(Math.random() * 9) - 4, Math.random() * 6.28, 0.6 / (1 + i * 0.35)]);
  const height = (x, y) => waves.reduce((h, [fx, fy, p, a]) => h + a * Math.sin(((fx * x + fy * y) / size) * Math.PI * 2 + p), 0);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = height(x + 1, y) - height(x - 1, y);
      const dy = height(x, y + 1) - height(x, y - 1);
      const n = new THREE.Vector3(-dx * 2.5, -dy * 2.5, 1).normalize();
      const o = (y * size + x) * 4;
      img.data[o] = (n.x * 0.5 + 0.5) * 255;
      img.data[o + 1] = (n.y * 0.5 + 0.5) * 255;
      img.data[o + 2] = (n.z * 0.5 + 0.5) * 255;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, { srgb: false });
}
