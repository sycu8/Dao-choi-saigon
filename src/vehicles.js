import * as THREE from 'three';
import { box, mat } from './world.js';

export const models = [
  { name: 'Tesla Roadster Rocket', color: '#dc3d35', w: 2.5, h: 1.15, d: 5.1, max: 44 },
  { name: 'Mercedes GLC 200', color: '#c7cbd0', w: 2.9, h: 2.1, d: 5, max: 32 },
  { name: 'VinFast VF8 Plus', color: '#397aa5', w: 2.95, h: 2, d: 5.1, max: 35 },
];

export function createPlayerCar(scene) {
  const group = new THREE.Group();
  const model = new THREE.Group();
  group.add(model);
  scene.add(group);

  function setModel(id) {
    model.clear();
    const c = models[id];
    box(c.w, 0.85, c.d, mat(c.color), 0, 0.95, 0, model);
    box(c.w * 0.82, c.h * 0.7, c.d * 0.5, mat('#273d4c'), 0, 1.45 + c.h * 0.2, -0.3, model);
    for (const x of [-1, 1]) {
      for (const z of [-1, 1]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.3, 10), mat('#171c20'));
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x * c.w * 0.52, 0.55, z * c.d * 0.34);
        model.add(wheel);
      }
    }
    for (const x of [-1, 1]) {
      box(0.5, 0.25, 0.1, mat('#fff4ce'), x * c.w * 0.33, 1.02, -c.d * 0.51, model);
      box(0.5, 0.25, 0.1, mat('#fa4b42'), x * c.w * 0.33, 1.02, c.d * 0.51, model);
    }
  }

  setModel(0);
  return { group, setModel };
}
