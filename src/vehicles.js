import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const models = [
  { name: 'Tesla Roadster Rocket', color: '#c81e1e', w: 2.3, d: 4.9, bodyH: 0.62, clearance: 0.34, cabin: { h: 0.55, len: 0.36, z: 0.25 }, wheelR: 0.42, max: 44, style: 'roadster', electric: true },
  { name: 'Mercedes GLC 200', color: '#c9ced3', w: 2.35, d: 4.8, bodyH: 0.98, clearance: 0.46, cabin: { h: 0.82, len: 0.6, z: 0.2 }, wheelR: 0.46, max: 32, style: 'mercedes', electric: false },
  { name: 'VinFast VF8 Plus', color: '#2f6f9e', w: 2.4, d: 4.9, bodyH: 0.96, clearance: 0.46, cabin: { h: 0.8, len: 0.6, z: 0.22 }, wheelR: 0.47, max: 35, style: 'vinfast', electric: true },
];

const glass = new THREE.MeshStandardMaterial({ color: '#0c161d', metalness: 0.9, roughness: 0.05 });
const trim = new THREE.MeshStandardMaterial({ color: '#16191c', roughness: 0.55 });
const chrome = new THREE.MeshStandardMaterial({ color: '#e6e9eb', metalness: 1, roughness: 0.16 });
const tire = new THREE.MeshStandardMaterial({ color: '#141618', roughness: 0.85 });
export const headlightMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 2.7) });
export const taillightMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.06, 0.04) });
const thrusterGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.2, 3) });

function part(geo, material, x, y, z, parent) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

function buildModel(c, root) {
  const paint = new THREE.MeshPhysicalMaterial({ color: c.color, metalness: 0.5, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06 });
  const { w, d, bodyH, clearance } = c;
  const bodyY = clearance + bodyH / 2;
  const info = { wheels: [], headlights: [], taillights: [], thrusters: [] };

  part(new RoundedBoxGeometry(w, bodyH, d, 4, Math.min(0.32, bodyH * 0.45)), paint, 0, bodyY, 0, root);
  const cab = c.cabin, cabY = clearance + bodyH + cab.h / 2 - 0.08;
  part(new RoundedBoxGeometry(w * 0.82, cab.h, d * cab.len, 4, 0.24), glass, 0, cabY, cab.z, root);
  if (c.style !== 'roadster') part(new RoundedBoxGeometry(w * 0.78, 0.1, d * cab.len * 0.86, 2, 0.05), paint, 0, cabY + cab.h / 2 + 0.01, cab.z, root);
  part(new THREE.BoxGeometry(w * 1.01, 0.22, d * 0.98), trim, 0, clearance + 0.12, 0, root);

  const front = -d / 2, rear = d / 2, lampY = clearance + bodyH * 0.62;
  for (const s of [-1, 1]) {
    info.headlights.push(part(new THREE.BoxGeometry(w * 0.22, 0.13, 0.06), headlightMat, s * w * 0.32, lampY, front - 0.01, root).position);
    info.taillights.push(part(new THREE.BoxGeometry(w * 0.26, 0.12, 0.06), taillightMat, s * w * 0.3, lampY, rear + 0.01, root).position);
  }

  if (c.style === 'roadster') {
    part(new THREE.BoxGeometry(w * 0.9, 0.06, 0.5), trim, 0, clearance + bodyH + 0.42, rear - 0.35, root);
    for (const s of [-1, 1]) {
      part(new THREE.BoxGeometry(0.08, 0.36, 0.2), trim, s * w * 0.35, clearance + bodyH + 0.2, rear - 0.35, root);
      const thruster = part(new THREE.CylinderGeometry(0.2, 0.26, 0.9, 12).rotateX(Math.PI / 2), chrome, s * 0.45, clearance + 0.42, rear - 0.1, root);
      const nozzle = part(new THREE.CircleGeometry(0.19, 12), thrusterGlow, s * 0.45, clearance + 0.42, rear + 0.36, root);
      info.thrusters.push(nozzle.position);
      thruster.castShadow = false;
    }
  } else {
    for (const s of [-1, 1]) part(new THREE.BoxGeometry(0.06, 0.06, d * cab.len * 0.9), chrome, s * w * 0.34, cabY + cab.h / 2 + 0.1, cab.z, root);
    for (const s of [-1, 1]) info.thrusters.push(new THREE.Vector3(s * w * 0.3, clearance + 0.2, rear + 0.05));
  }
  if (c.style === 'mercedes') {
    part(new THREE.BoxGeometry(w * 0.42, bodyH * 0.38, 0.06), trim, 0, clearance + bodyH * 0.45, front - 0.01, root);
    for (let k = 0; k < 3; k++) part(new THREE.BoxGeometry(w * 0.42, 0.04, 0.07), chrome, 0, clearance + bodyH * (0.33 + k * 0.1), front - 0.02, root);
    const star = part(new THREE.TorusGeometry(0.13, 0.025, 6, 20), chrome, 0, clearance + bodyH * 0.45, front - 0.05, root);
    star.castShadow = false;
  }
  if (c.style === 'vinfast') {
    for (const s of [-1, 1]) {
      const bar = part(new THREE.BoxGeometry(w * 0.3, 0.05, 0.05), chrome, s * w * 0.13, clearance + bodyH * 0.5, front - 0.02, root);
      bar.rotation.z = s * 0.38;
    }
    part(new THREE.BoxGeometry(w * 0.86, 0.045, 0.05), headlightMat, 0, clearance + bodyH * 0.82, front - 0.02, root);
    part(new THREE.BoxGeometry(w * 0.9, 0.05, 0.05), taillightMat, 0, clearance + bodyH * 0.8, rear + 0.02, root);
  }

  const wr = c.wheelR;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * (w / 2 - 0.12), wr, sz * d * 0.32);
      const spin = new THREE.Group();
      part(new THREE.CylinderGeometry(wr, wr, 0.3, 18).rotateZ(Math.PI / 2), tire, 0, 0, 0, spin);
      part(new THREE.CylinderGeometry(wr * 0.62, wr * 0.62, 0.32, 10).rotateZ(Math.PI / 2), chrome, 0, 0, 0, spin);
      pivot.add(spin);
      root.add(pivot);
      info.wheels.push({ pivot, spin, front: sz < 0, radius: wr });
    }
  }
  return info;
}

export function createPlayerCar(scene) {
  const group = new THREE.Group();
  const model = new THREE.Group();
  group.add(model);
  scene.add(group);
  const car = { group, model, info: null, setModel };

  function setModel(id) {
    model.traverse((o) => {
      if (o.isMesh) o.geometry.dispose();
    });
    model.clear();
    car.info = buildModel(models[id], model);
  }

  setModel(0);
  return car;
}

export function animateWheels(car, speed, steer, dt) {
  for (const w of car.info.wheels) {
    w.spin.rotation.x -= (speed * dt) / w.radius;
    if (w.front) w.pivot.rotation.y = steer * 0.42;
  }
}
