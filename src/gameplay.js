import * as THREE from 'three';
import { models } from './vehicles.js';
import { WORLD_LIMIT, buildings } from './world.js';
import { landmarkFootprints } from './landmarks.js';
import { traffic, vehiclePosition, isVehicleActive } from './traffic.js';
import { setFlyLabel, setToast } from './hud.js';

export const MAX_ALTITUDE = 280;
const PLAYER_RADIUS = 1.6;
const GRAVITY = 26;

export const player = {
  pos: new THREE.Vector3(0, 0, 40),
  vel: new THREE.Vector3(),
  heading: 0,
  yawRate: 0,
  speed: 0,
  altitude: 0,
  vy: 0,
  ground: 0,
  flying: false,
  carId: 0,
  roll: 0,
  pitch: 0,
  drift: 0,
  energy: 100,
};

export function toggleFly() {
  if (!player.flying && player.energy < 5) {
    setToast('🔋 Hết năng lượng! Tìm trạm sạc VinFast để bay tiếp.');
    return;
  }
  player.flying = !player.flying;
  if (player.flying) player.vy = Math.max(player.vy, 6);
  setFlyLabel(player.flying);
}

export function resetPlayer() {
  player.pos.set(0, 0, 40);
  player.vel.set(0, 0, 0);
  player.speed = player.altitude = player.vy = player.ground = player.heading = player.yawRate = 0;
  player.flying = false;
  setFlyLabel(false);
}

const solids = () => (solidCache ||= [...buildings, ...landmarkFootprints]);
let solidCache = null;

// Height of the roof under the player if they are above it, otherwise street level.
function groundHeight(x, z, altitude) {
  let g = 0;
  for (const b of solids()) {
    if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ && altitude >= b.height - 1.2) g = Math.max(g, b.height);
  }
  return g;
}

const fwd = new THREE.Vector3(), right = new THREE.Vector3(), n = new THREE.Vector3(), ai = new THREE.Vector3();

function bounce(normal, restitution) {
  const vn = player.vel.dot(normal);
  if (vn >= 0) return 0;
  player.vel.addScaledVector(normal, -vn * (1 + restitution));
  player.vel.multiplyScalar(0.8);
  return -vn;
}

// Circle-vs-AABB against buildings and landmarks, circle-vs-circle against AI traffic.
// Returns the strongest impact this frame as { strength, point } or null.
function resolveCollisions() {
  const p = player;
  let hit = null;
  const report = (strength, x, z, y) => {
    if (strength > 2.5 && (!hit || strength > hit.strength)) hit = { strength, point: new THREE.Vector3(x, y, z) };
  };
  for (const b of solids()) {
    if (p.altitude >= b.height - 0.3) continue;
    const cx = THREE.MathUtils.clamp(p.pos.x, b.minX, b.maxX), cz = THREE.MathUtils.clamp(p.pos.z, b.minZ, b.maxZ);
    let dx = p.pos.x - cx, dz = p.pos.z - cz;
    let d = Math.hypot(dx, dz);
    if (d >= PLAYER_RADIUS) continue;
    if (d < 1e-4) {
      const exits = [p.pos.x - b.minX, b.maxX - p.pos.x, p.pos.z - b.minZ, b.maxZ - p.pos.z];
      const k = exits.indexOf(Math.min(...exits));
      dx = k === 0 ? -1 : k === 1 ? 1 : 0;
      dz = k === 2 ? -1 : k === 3 ? 1 : 0;
      p.pos.x += dx * (exits[k] + PLAYER_RADIUS);
      p.pos.z += dz * (exits[k] + PLAYER_RADIUS);
      n.set(dx, 0, dz);
    } else {
      n.set(dx / d, 0, dz / d);
      p.pos.addScaledVector(n, PLAYER_RADIUS - d);
    }
    report(bounce(n, 0.25), cx, cz, Math.max(p.altitude, 0) + 0.8);
  }
  if (p.altitude < 2.5) {
    for (const v of traffic) {
      if (!isVehicleActive(v)) continue;
      vehiclePosition(v, ai);
      const r = PLAYER_RADIUS + (v.bike ? 0.8 : 1.9);
      const dx = p.pos.x - ai.x, dz = p.pos.z - ai.z, d = Math.hypot(dx, dz);
      if (d >= r || d < 1e-4) continue;
      n.set(dx / d, 0, dz / d);
      p.pos.addScaledVector(n, r - d);
      v.stun = 2.5;
      report(bounce(n, 0.4) + 2, ai.x, ai.z, 0.9);
    }
  }
  return hit;
}

export function updatePlayer(dt, input, { inFlood, wet }) {
  const p = player;
  const model = models[p.carId];
  const canBoost = input.boost && p.energy > 0;
  const max = model.max * (canBoost ? 1.6 : 1);

  fwd.set(-Math.sin(p.heading), 0, -Math.cos(p.heading));
  right.set(Math.cos(p.heading), 0, -Math.sin(p.heading));
  let vf = p.vel.dot(fwd), vl = p.vel.dot(right);

  const accel = input.accel ? (canBoost ? 32 : 23) : input.brake ? (vf > 0.5 ? -32 : -14) : -Math.sign(vf) * (p.flying ? 5 : 10);
  if (vf > max) vf = Math.max(max, vf - Math.max(6, (vf - max) * 2.5) * dt);
  else vf = Math.min(max, vf + accel * dt);
  if (accel < 0 && vf > max) vf += accel * dt;
  vf = Math.max(vf, -12);
  if (!input.accel && !input.brake && Math.abs(vf) < 0.4) vf = 0;
  if (inFlood) vf *= 1 - dt * 1.6;

  // Lateral grip: low grip lets the car slide (drift) and keeps flying floaty.
  const drifting = !p.flying && input.turn !== 0 && vf > 16 && (canBoost || input.brake);
  const grip = p.flying ? 1.4 : drifting ? 1.8 : 9 - wet * 4;
  vl *= Math.exp(-grip * dt);
  p.vel.copy(fwd).multiplyScalar(vf).addScaledVector(right, vl);
  p.speed = vf;
  p.drift = p.flying ? 0 : Math.min(1, Math.abs(vl) / 5);

  const steer = input.turn * (0.7 + Math.min(Math.abs(vf), 45) * 0.02) * Math.min(1, 0.3 + Math.abs(vf) / 6) * (vf < 0 ? -1 : 1) * (drifting ? 1.35 : 1);
  p.yawRate += (steer - p.yawRate) * Math.min(1, dt * (p.flying ? 2.5 : 7));
  p.heading += p.yawRate * dt;

  // Energy: flying and boost drain it; electric cars regenerate a little when braking.
  const drain = (p.flying ? 1.4 : 0) + (canBoost && Math.abs(vf) > 4 ? 5 : 0);
  const regen = !p.flying && model.electric && input.brake && vf > 3 ? 2 : 0;
  p.energy = THREE.MathUtils.clamp(p.energy + (regen - drain) * dt, 0, 100);
  if (p.flying && p.energy <= 0) {
    p.flying = false;
    setFlyLabel(false);
    setToast('🔋 Hết năng lượng! Xe đang hạ cánh khẩn cấp…');
  }

  p.pos.addScaledVector(p.vel, dt);
  p.pos.x = THREE.MathUtils.clamp(p.pos.x, -WORLD_LIMIT, WORLD_LIMIT);
  p.pos.z = THREE.MathUtils.clamp(p.pos.z, -WORLD_LIMIT, WORLD_LIMIT);

  p.ground = groundHeight(p.pos.x, p.pos.z, p.altitude);
  let landed = 0;
  if (p.flying) {
    const target = (input.up ? 18 : 0) - (input.down ? 18 : 0);
    p.vy += (target - p.vy) * Math.min(1, dt * 3);
    p.altitude += p.vy * dt;
    const floor = p.ground + 4;
    if (!input.up && !input.down && p.altitude < p.ground + 8) p.altitude += Math.min(p.ground + 8 - p.altitude, dt * 10);
    if (p.altitude < floor) {
      p.altitude = floor;
      p.vy = Math.max(p.vy, 0);
    }
    if (p.altitude > MAX_ALTITUDE) {
      p.altitude = MAX_ALTITUDE;
      p.vy = Math.min(p.vy, 0);
    }
  } else {
    p.vy = Math.max(p.vy - GRAVITY * dt, p.energy > 0 ? -16 : -12);
    p.altitude += p.vy * dt;
    if (p.altitude <= p.ground) {
      if (p.vy < -6) landed = -p.vy;
      p.altitude = p.ground;
      p.vy = 0;
    }
  }

  const hit = resolveCollisions();
  if (hit) p.speed = p.vel.dot(fwd);

  // Banking: roll into turns (stronger when flying), pitch with climb and acceleration.
  const speedFactor = Math.min(1, Math.abs(vf) / 30);
  const rollTarget = p.flying ? p.yawRate * 0.55 * (0.3 + speedFactor) : -p.yawRate * 0.05 * speedFactor - (p.drift * Math.sign(vl)) * 0.04;
  const pitchTarget = p.flying ? THREE.MathUtils.clamp(p.vy * 0.018 + (input.accel ? 0.05 : 0) - (input.brake ? 0.06 : 0), -0.35, 0.35) : (input.brake && vf > 2 ? -0.025 : input.accel ? 0.015 : 0);
  p.roll += (THREE.MathUtils.clamp(rollTarget, -0.6, 0.6) - p.roll) * Math.min(1, dt * 4);
  p.pitch += (pitchTarget - p.pitch) * Math.min(1, dt * 4);

  return { hit, landed };
}
