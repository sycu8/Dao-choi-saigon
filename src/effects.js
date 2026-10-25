import * as THREE from 'three';

const RAIN_DROPS = 380;
const RAIN_HEIGHT = 65;

export function createRain(scene) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(RAIN_DROPS * 6);
  for (let i = 0; i < RAIN_DROPS; i++) {
    positions[i * 6] = (Math.random() - 0.5) * 130;
    positions[i * 6 + 1] = Math.random() * RAIN_HEIGHT;
    positions[i * 6 + 2] = (Math.random() - 0.5) * 130;
    positions[i * 6 + 3] = positions[i * 6];
    positions[i * 6 + 4] = positions[i * 6 + 1] - 2;
    positions[i * 6 + 5] = positions[i * 6 + 2];
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mesh = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: '#c4e4ff', transparent: true, opacity: 0.45 }));
  scene.add(mesh);

  return {
    mesh,
    setAmount(drops) {
      mesh.visible = drops > 0;
      geometry.setDrawRange(0, drops * 2);
    },
    update(dt, x, y, z) {
      mesh.position.set(x, y, z);
      if (!mesh.visible) return;
      const a = geometry.attributes.position;
      for (let i = 0; i < RAIN_DROPS; i++) {
        let top = a.getY(i * 2) - dt * 36;
        if (top < 0) top = RAIN_HEIGHT;
        a.setY(i * 2, top);
        a.setY(i * 2 + 1, top - 2);
      }
      a.needsUpdate = true;
    },
  };
}
