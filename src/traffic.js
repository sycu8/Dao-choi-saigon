import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { nextRandom, paint, merge, RIVER } from './world.js';
import { onNightChange } from './sky.js';

export const traffic = [];
const TOTAL = 150;
const EDGE = 425;
const colors = ['#e8e8e2', '#d33b2c', '#f0c24b', '#2d4f7c', '#b9bec2', '#1f2326', '#3f7d4f', '#f2f2f2', '#7a1e2b'];

let carMesh, carLights, bikeMesh, bikeLights, active = TOTAL;

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
      phase: nextRandom() * 6,
      color: new THREE.Color(colors[Math.floor(nextRandom() * colors.length)]),
      index: 0,
    });
  }
  const cars = traffic.filter((v) => !v.bike), bikes = traffic.filter((v) => v.bike);
  cars.forEach((v, i) => (v.index = i));
  bikes.forEach((v, i) => (v.index = i));

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

export function updateTraffic(dt, t, slowFactor) {
  for (const v of traffic) {
    const mesh = v.bike ? bikeMesh : carMesh;
    if (v.index >= mesh.count) continue;
    v.along += v.dir * v.speed * dt * slowFactor;
    if (v.along > v.max) v.along = v.min;
    if (v.along < v.min) v.along = v.max;
    vehiclePosition(v, pos);
    if (v.bike) pos[v.axis === 0 ? 'x' : 'z'] += Math.sin(t * 1.4 + v.phase) * 0.3;
    const yaw = v.axis === 0 ? (v.dir > 0 ? Math.PI : 0) : (v.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
    q.setFromAxisAngle(yAxis, yaw);
    if (v.bike) q.multiply(roll.setFromAxisAngle(zAxis, Math.cos(t * 1.4 + v.phase) * 0.06));
    m4.compose(pos, q, one);
    mesh.setMatrixAt(v.index, m4);
    (v.bike ? bikeLights : carLights).setMatrixAt(v.index, m4);
  }
  for (const m of [carMesh, carLights, bikeMesh, bikeLights]) m.instanceMatrix.needsUpdate = true;
}
