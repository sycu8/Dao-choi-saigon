import * as THREE from 'three';
import { box, mat, nextRandom } from './world.js';

const traffic = [];
const colors = ['#ef6d4d', '#f5f5e8', '#efc15b', '#365c81', '#d1d5d8'];

function makeVehicle(scene, x, z, axis, dir, bike) {
  const g = new THREE.Group();
  const body = mat(colors[Math.floor(nextRandom() * colors.length)]);
  box(bike ? 1.2 : 3, bike ? 1.2 : 1.8, bike ? 3 : 5, body, 0, bike ? 0.85 : 1.15, 0, g);
  if (!bike) box(2.5, 1.2, 2.6, mat('#a9c7d1'), 0, 2.2, -0.3, g);
  g.position.set(x, 0, z);
  g.rotation.y = axis === 0 ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  scene.add(g);
  traffic.push({ g, axis, dir, bike, speed: (bike ? 9 : 6) + nextRandom() * 8, phase: nextRandom() * 6 });
}

export function createTraffic(scene, roads) {
  for (let n = 0; n < 120; n++) {
    const axis = n % 2, dir = n % 4 < 2 ? 1 : -1;
    const p = roads[Math.floor(nextRandom() * roads.length)];
    const offset = dir * 4 + (nextRandom() - 0.5) * 2;
    const along = (nextRandom() - 0.5) * 850;
    makeVehicle(scene, axis === 0 ? p + offset : along, axis === 0 ? along : p + offset, axis, dir, n % 3 !== 0);
  }
}

export function updateTraffic(dt, t, slowFactor) {
  for (const v of traffic) {
    const g = v.g, p = v.axis === 0 ? 'z' : 'x';
    g.position[p] += v.dir * v.speed * dt * slowFactor;
    if (g.position[p] > 440) g.position[p] = -440;
    if (g.position[p] < -440) g.position[p] = 440;
    if (v.bike) g.position[v.axis === 0 ? 'x' : 'z'] += Math.sin(t * 1.4 + v.phase) * dt * 0.22;
  }
}
