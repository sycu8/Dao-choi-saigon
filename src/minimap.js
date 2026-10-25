import { buildings, roads, RIVER, ROAD_HALF, WORLD_LIMIT } from './world.js';
import { landmarkFootprints } from './landmarks.js';
import { STATIONS, MISSION_STARTS } from './missions.js';

const VIEW_METERS = 170;
let canvas, ctx, base, size = 0, frame = 0;

// Pre-rendered top-down city at 1 px per metre; the live view is a rotated crop of it.
function drawBase() {
  const extent = WORLD_LIMIT * 2 + 40;
  base = document.createElement('canvas');
  base.width = base.height = extent;
  const g = base.getContext('2d');
  const o = extent / 2;
  g.fillStyle = '#25343a';
  g.fillRect(0, 0, extent, extent);
  g.fillStyle = '#2f6f9a';
  g.fillRect(o + RIVER.west, 0, RIVER.east - RIVER.west, extent);
  g.fillStyle = '#56636b';
  for (const r of roads) {
    if (!(r > RIVER.west && r < RIVER.east)) g.fillRect(o + r - ROAD_HALF, 0, ROAD_HALF * 2, extent);
    g.fillRect(0, o + r - ROAD_HALF, o + RIVER.west, ROAD_HALF * 2);
    g.fillRect(o + RIVER.east, o + r - ROAD_HALF, extent, ROAD_HALF * 2);
    if (r === -130) g.fillRect(o + RIVER.west, o + r - ROAD_HALF, RIVER.east - RIVER.west, ROAD_HALF * 2);
  }
  g.fillStyle = '#7b8a92';
  for (const b of buildings) g.fillRect(o + b.minX, o + b.minZ, b.maxX - b.minX, b.maxZ - b.minZ);
  g.fillStyle = '#c9a85a';
  for (const f of landmarkFootprints) g.fillRect(o + f.minX, o + f.minZ, f.maxX - f.minX, f.maxZ - f.minZ);
}

export function createMinimap(el) {
  canvas = el;
  ctx = canvas.getContext('2d');
  drawBase();
}

function resizeCanvas() {
  const css = canvas.clientWidth;
  const px = Math.round(css * Math.min(devicePixelRatio, 2));
  if (px !== size) {
    size = px;
    canvas.width = canvas.height = px;
  }
}

export function updateMinimap(player, objective) {
  if (++frame % 2 || !canvas.offsetParent) return;
  resizeCanvas();
  const r = size / 2, s = size / (VIEW_METERS * 2);
  const h = player.heading, cos = Math.cos(h), sin = Math.sin(h);
  const toScreen = (x, z, clamp) => {
    const dx = (x - player.pos.x) * s, dz = (z - player.pos.z) * s;
    let rx = dx * cos - dz * sin, ry = dx * sin + dz * cos;
    const d = Math.hypot(rx, ry), lim = r - size * 0.06;
    if (clamp && d > lim) {
      rx *= lim / d;
      ry *= lim / d;
    }
    return [r + rx, r + ry, d <= lim];
  };

  ctx.save();
  ctx.clearRect(0, 0, size, size);
  ctx.beginPath();
  ctx.arc(r, r, r - 1, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(r, r);
  ctx.rotate(h);
  ctx.scale(s, s);
  ctx.drawImage(base, -base.width / 2 - player.pos.x, -base.height / 2 - player.pos.z);
  ctx.restore();

  const dot = (x, z, color, radius, clamp = false) => {
    const [sx, sy, inside] = toScreen(x, z, clamp);
    if (!inside && !clamp) return;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.fill();
  };
  for (const st of STATIONS) dot(st.x, st.z, '#35e07a', size * 0.03);
  if (!objective) for (const m of MISSION_STARTS) dot(m.x, m.z, m.color, size * 0.035);
  if (objective) {
    const [sx, sy] = toScreen(objective.pos.x, objective.pos.z, true);
    ctx.fillStyle = '#ffcc33';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = size * 0.012;
    ctx.beginPath();
    ctx.arc(sx, sy, size * 0.045, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#0b1a24';
  ctx.lineWidth = size * 0.012;
  ctx.beginPath();
  ctx.moveTo(r, r - size * 0.06);
  ctx.lineTo(r + size * 0.04, r + size * 0.04);
  ctx.lineTo(r, r + size * 0.015);
  ctx.lineTo(r - size * 0.04, r + size * 0.04);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = '#ffffff55';
  ctx.lineWidth = Math.max(1, size * 0.01);
  ctx.beginPath();
  ctx.arc(r, r, r - 1, 0, Math.PI * 2);
  ctx.stroke();
}

// Screen-space bearing (radians, 0 = straight ahead) and distance to a world point.
export function bearingTo(player, x, z) {
  const dx = x - player.pos.x, dz = z - player.pos.z;
  const h = player.heading;
  const rx = dx * Math.cos(h) - dz * Math.sin(h), ry = dx * Math.sin(h) + dz * Math.cos(h);
  return { angle: Math.atan2(rx, -ry), dist: Math.hypot(dx, dz) };
}
