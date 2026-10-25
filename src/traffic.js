import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { nextRandom, paint, merge, RIVER, ROAD_SPACING, ROAD_HALF } from './world.js';
import { onNightChange } from './sky.js';

export const traffic = [];
const TOTAL = 150;
const EDGE = 425;
const colors = ['#e8e8e2', '#d33b2c', '#f0c24b', '#2d4f7c', '#b9bec2', '#1f2326', '#3f7d4f', '#f2f2f2', '#7a1e2b'];

let carMesh, carLights, bikeMesh, bikeLights, signalPoles, signalHeads;
const VISIBLE_SIGNALS = 48;
const signals = [];
const lanes = new Map();
const SIGNAL_CYCLE = 20, SIGNAL_GREEN = 8, SIGNAL_AMBER = 2;

function carGeometry() {
  return merge([
    paint(new RoundedBoxGeometry(2.1, 0.8, 4.4, 2, 0.25).translate(0, 0.75, 0), '#ffffff'),
    paint(new RoundedBoxGeometry(1.8, 0.65, 2.3, 2, 0.2).translate(0, 1.42, 0.25), '#26343d'),
    paint(new THREE.BoxGeometry(2.14, 0.22, 4.3).translate(0, 0.42, 0), '#2a2c2e'),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => paint(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 10).rotateZ(Math.PI / 2).translate(sx * 0.95, 0.36, sz * 1.4), '#141414'))),
  ]);
}

function bikeGeometry() {
  return merge([
    paint(new THREE.BoxGeometry(0.42, 0.5, 1.6).translate(0, 0.62, 0), '#ffffff'),
    paint(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 10).rotateZ(Math.PI / 2).translate(0, 0.3, -0.62), '#151515'),
    paint(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 10).rotateZ(Math.PI / 2).translate(0, 0.3, 0.62), '#151515'),
    paint(new THREE.BoxGeometry(0.46, 0.62, 0.32).translate(0, 1.2, 0.15), '#e9e4da'),
    paint(new THREE.SphereGeometry(0.2, 8, 6).translate(0, 1.66, 0.1), '#f2f2f2'),
  ]);
}

function lightGeometry(halfWidth, front, rear, y, size) {
  return merge([
    ...(halfWidth ? [-1, 1] : [0]).flatMap((s) => [
      paint(new THREE.BoxGeometry(size, 0.12, 0.05).translate(s * halfWidth, y, front), '#fff6dc'),
      paint(new THREE.BoxGeometry(size, 0.12, 0.05).translate(s * halfWidth, y, rear), '#ff2a14'),
    ]),
  ]);
}

function lightMaterial() {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true });
  onNightChange((n) => m.color.setScalar(0.55 + n * 2.6));
  return m;
}

function laneSegments(roads) {
  const segments = [];
  for (const p of roads) {
    const inRiver = p > RIVER.west - 12 && p < RIVER.east + 12;
    if (!inRiver && p !== 0) segments.push({ axis: 0, p, min: -EDGE, max: EDGE });
    if (p === -130) segments.push({ axis: 1, p, min: -EDGE, max: EDGE });
    else segments.push({ axis: 1, p, min: -EDGE, max: RIVER.west - 12 }, { axis: 1, p, min: RIVER.east + 12, max: EDGE });
  }
  return segments;
}

export function createTraffic(scene, roads) {
  const segments = laneSegments(roads);
  const totalLength = segments.reduce((s, g) => s + g.max - g.min, 0);
  for (let n = 0; n < TOTAL; n++) {
    let r = nextRandom() * totalLength, seg = segments[0];
    for (const s of segments) {
      if (r < s.max - s.min) {
        seg = s;
        break;
      }
      r -= s.max - s.min;
    }
    const bike = nextRandom() < 0.6;
    const dir = nextRandom() < 0.5 ? 1 : -1;
    const lane = bike ? 7.4 + (nextRandom() - 0.5) * 2 : nextRandom() < 0.7 ? 2.6 : 7.4;
    traffic.push({
      axis: seg.axis, p: seg.p, dir, lane, bike,
      min: seg.min, max: seg.max,
      along: seg.min + r,
      speed: (bike ? 8 : 7) + nextRandom() * 7,
      cur: 0,
      stun: 0,
      phase: nextRandom() * 6,
      color: new THREE.Color(colors[Math.floor(nextRandom() * colors.length)]),
      index: 0,
    });
  }
  const cars = traffic.filter((v) => !v.bike), bikes = traffic.filter((v) => v.bike);
  cars.forEach((v, i) => (v.index = i));
  bikes.forEach((v, i) => (v.index = i));
  for (const v of traffic) {
    v.cur = v.speed;
    const key = `${v.axis}|${v.p}|${v.dir}|${v.lane > 5 ? 1 : 0}`;
    if (!lanes.has(key)) lanes.set(key, []);
    lanes.get(key).push(v);
  }
  createSignals(scene, roads);

  const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.3 });
  carMesh = new THREE.InstancedMesh(carGeometry(), bodyMat, cars.length);
  carLights = new THREE.InstancedMesh(lightGeometry(0.7, -2.21, 2.21, 0.82, 0.4), lightMaterial(), cars.length);
  bikeMesh = new THREE.InstancedMesh(bikeGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), bikes.length);
  bikeLights = new THREE.InstancedMesh(lightGeometry(0, -0.82, 0.82, 0.8, 0.18), lightMaterial(), bikes.length);
  cars.forEach((v) => carMesh.setColorAt(v.index, v.color));
  bikes.forEach((v) => bikeMesh.setColorAt(v.index, v.color));
  for (const m of [carMesh, carLights, bikeMesh, bikeLights]) {
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(m);
  }
  carMesh.castShadow = bikeMesh.castShadow = true;
  carMesh.receiveShadow = true;
}

// Signal phase for an intersection: 'g', 'y' or 'r' for traffic moving along the given axis (0 = along z).
function signalState(xRoad, zRoad, axis, t) {
  const offset = (((xRoad + zRoad) / ROAD_SPACING) * 3.7) % SIGNAL_CYCLE;
  const phase = (((t + offset) % SIGNAL_CYCLE) + SIGNAL_CYCLE) % SIGNAL_CYCLE;
  const local = axis === 0 ? phase : (phase + SIGNAL_CYCLE / 2) % SIGNAL_CYCLE;
  return local < SIGNAL_GREEN ? 'g' : local < SIGNAL_GREEN + SIGNAL_AMBER ? 'y' : 'r';
}

function createSignals(scene, roads) {
  for (const x of roads) {
    if (x > RIVER.west - 12 && x < RIVER.east + 12) continue;
    for (const z of roads) {
      if (Math.abs(x) > 330 || Math.abs(z) > 330) continue;
      // Two heads per intersection, each on the far-right corner for one direction of each axis.
      signals.push({ x, z, axis: 0, px: x + ROAD_HALF + 0.8, pz: z - ROAD_HALF - 0.8, rot: 0 });
      signals.push({ x, z, axis: 1, px: x - ROAD_HALF - 0.8, pz: z - ROAD_HALF - 0.8, rot: -Math.PI / 2 });
    }
  }
  const pole = merge([
    paint(new THREE.CylinderGeometry(0.1, 0.13, 4.6, 6).translate(0, 2.3, 0), '#3b4246'),
    paint(new THREE.BoxGeometry(0.55, 1.5, 0.45).translate(0, 4.4, 0), '#1c2124'),
  ]);
  signalPoles = new THREE.InstancedMesh(pole, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.5 }), VISIBLE_SIGNALS);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  onNightChange((n) => lampMat.color.setScalar(1 + n * 1.5));
  signalHeads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 0.4, 0.08).translate(0, 4.4, 0.26), lampMat, VISIBLE_SIGNALS * 2);
  signalHeads.setColorAt(0, OFF);
  signalPoles.count = signalHeads.count = 0;
  signalPoles.frustumCulled = signalHeads.frustumCulled = false;
  signalPoles.castShadow = true;
  scene.add(signalPoles, signalHeads);
}

const OFF = new THREE.Color(0.1, 0.1, 0.1);
const SIGNAL_COLORS = { g: new THREE.Color(0.1, 2.2, 0.6), y: new THREE.Color(2.4, 1.5, 0.1), r: new THREE.Color(2.6, 0.12, 0.08) };
let signalTimer = 0;
const sm4 = new THREE.Matrix4();
// Only the signals nearest the focus point are drawn; far ones are too small to matter.
function updateSignals(dt, t, focus) {
  if ((signalTimer -= dt) > 0) return;
  signalTimer = 0.25;
  for (const s of signals) s.d = (s.px - focus.x) ** 2 + (s.pz - focus.z) ** 2;
  const near = signals.slice().sort((a, b) => a.d - b.d).slice(0, VISIBLE_SIGNALS);
  near.forEach((s, i) => {
    sm4.makeRotationY(s.rot).setPosition(s.px, 0, s.pz);
    signalPoles.setMatrixAt(i, sm4);
    signalHeads.setMatrixAt(i * 2, sm4);
    sm4.makeRotationY(s.rot + Math.PI).setPosition(s.px, 0, s.pz);
    signalHeads.setMatrixAt(i * 2 + 1, sm4);
    const c = SIGNAL_COLORS[signalState(s.x, s.z, s.axis, t)];
    signalHeads.setColorAt(i * 2, c);
    signalHeads.setColorAt(i * 2 + 1, c);
  });
  signalPoles.count = near.length;
  signalHeads.count = near.length * 2;
  signalPoles.instanceMatrix.needsUpdate = signalHeads.instanceMatrix.needsUpdate = signalHeads.instanceColor.needsUpdate = true;
}

export const isVehicleActive = (v) => v.index < (v.bike ? bikeMesh : carMesh).count;

export function setTrafficDensity(t) {
  carMesh.count = carLights.count = Math.floor(carMesh.instanceMatrix.count * t.trafficShare);
  bikeMesh.count = bikeLights.count = Math.floor(bikeMesh.instanceMatrix.count * t.trafficShare);
}

const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), yAxis = new THREE.Vector3(0, 1, 0), roll = new THREE.Quaternion(), zAxis = new THREE.Vector3(0, 0, 1);

export function vehiclePosition(v, out) {
  const offset = v.lane * v.dir;
  // Right-hand traffic: the lane sits to the right of the travel direction.
  if (v.axis === 0) return out.set(v.p - offset, 0, v.along);
  return out.set(v.along, 0, v.p + offset);
}

const playerPos = new THREE.Vector3();

// Target speed limited by the red light ahead, the vehicle in front and the player's car.
function targetSpeed(v, ahead, t, slowFactor, playerOnRoad) {
  let target = v.speed * slowFactor;
  const crossing = v.dir > 0 ? Math.ceil((v.along + 0.01) / ROAD_SPACING) * ROAD_SPACING : Math.floor((v.along - 0.01) / ROAD_SPACING) * ROAD_SPACING;
  const stopLine = crossing - v.dir * (ROAD_HALF + 1.5);
  const toLine = (stopLine - v.along) * v.dir;
  if (toLine > 0 && toLine < 14 + v.cur && Math.abs(crossing) <= 330 && !(v.axis === 1 && crossing > RIVER.west - 12 && crossing < RIVER.east + 12)) {
    const state = v.axis === 0 ? signalState(v.p, crossing, 0, t) : signalState(crossing, v.p, 1, t);
    if (state === 'r' || (state === 'y' && toLine > 4)) target = Math.min(target, Math.max(0, (toLine - 0.8) * 0.9));
  }
  const gapNeeded = v.bike ? 2.6 : 5.5;
  if (ahead) {
    const gap = (ahead.along - v.along) * v.dir - (ahead.bike ? 1 : 2.3) - (v.bike ? 1 : 2.3);
    if (gap < 18) target = Math.min(target, Math.max(0, (gap - gapNeeded) * 0.8));
  }
  if (playerOnRoad) {
    vehiclePosition(v, pos);
    const dx = playerPos.x - pos.x, dz = playerPos.z - pos.z;
    const along = v.axis === 0 ? dz * v.dir : dx * v.dir, lateral = v.axis === 0 ? dx : dz;
    if (along > 0 && along < 16 && Math.abs(lateral) < 2.6) target = Math.min(target, Math.max(0, (along - 6) * 0.8));
  }
  return target;
}

export function updateTraffic(dt, t, slowFactor, player) {
  updateSignals(dt, t, player ? player.pos : playerPos);
  const playerOnRoad = player && player.altitude < 2.5;
  if (playerOnRoad) playerPos.copy(player.pos);
  for (const list of lanes.values()) {
    list.sort((a, b) => (a.along - b.along) * a.dir);
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      if (!isVehicleActive(v)) continue;
      let ahead = null;
      for (let j = i + 1; j < list.length; j++) if (isVehicleActive(list[j])) { ahead = list[j]; break; }
      const target = v.stun > 0 ? 0 : targetSpeed(v, ahead, t, slowFactor, playerOnRoad);
      v.stun = Math.max(0, v.stun - dt);
      v.cur += THREE.MathUtils.clamp(target - v.cur, -14 * dt, 5 * dt);
      v.along += v.dir * v.cur * dt;
      if (v.along > v.max) v.along = v.min;
      if (v.along < v.min) v.along = v.max;
    }
  }
  for (const v of traffic) {
    const mesh = v.bike ? bikeMesh : carMesh;
    if (v.index >= mesh.count) continue;
    vehiclePosition(v, pos);
    if (v.bike) pos[v.axis === 0 ? 'x' : 'z'] += Math.sin(t * 1.4 + v.phase) * 0.3 * Math.min(1, v.cur / 4);
    const yaw = v.axis === 0 ? (v.dir > 0 ? Math.PI : 0) : (v.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
    q.setFromAxisAngle(yAxis, yaw);
    if (v.bike) q.multiply(roll.setFromAxisAngle(zAxis, Math.cos(t * 1.4 + v.phase) * 0.06 * Math.min(1, v.cur / 4)));
    m4.compose(pos, q, one);
    mesh.setMatrixAt(v.index, m4);
    (v.bike ? bikeLights : carLights).setMatrixAt(v.index, m4);
  }
  for (const m of [carMesh, carLights, bikeMesh, bikeLights]) m.instanceMatrix.needsUpdate = true;
}

// Picks a nearby AI vehicle to honk; returns stereo pan and volume relative to the listener, or null.
export function pickHonk(listener, heading) {
  const nearby = traffic.filter((v) => isVehicleActive(v) && vehiclePosition(v, pos).distanceTo(listener) < 70);
  if (!nearby.length) return null;
  const v = nearby[Math.floor(Math.random() * nearby.length)];
  vehiclePosition(v, pos).sub(listener);
  const dist = pos.length();
  const right = Math.cos(heading) * pos.x - Math.sin(heading) * pos.z;
  return { pan: Math.max(-1, Math.min(1, right / Math.max(dist, 1))), volume: 1 - dist / 80 };
}
