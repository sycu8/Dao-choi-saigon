import * as THREE from 'three';

export const WORLD_LIMIT = 415;
export const ROAD_SPACING = 65;
export const roads = [];

let seed = 0;
export const rng = (n) => {
  const v = Math.sin(n * 127.1 + 13) * 43758.5453;
  return v - Math.floor(v);
};
export const nextRandom = () => rng(++seed);

export const mat = (color) => new THREE.MeshLambertMaterial({ color });

export function box(w, h, d, material, x, y, z, group) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
}

const buildingColors = ['#c6b8a5', '#e0d9c9', '#a6bec4', '#e2b7a0', '#c6d3d7', '#9da8af', '#f0d7b2'];

export function buildWorld(scene) {
  const ground = mat('#8da991'), road = mat('#404c57'), sidewalk = mat('#b5b8ae'), water = mat('#398bb0'), stripe = mat('#e6ddbf');
  box(1800, 1, 1800, ground, 0, -0.6, 0, scene);
  box(175, 0.15, 1800, water, 270, -0.1, 0, scene);
  box(14, 0.35, 1800, sidewalk, 174, 0, 0, scene);

  for (let i = -6; i <= 6; i++) {
    const p = i * ROAD_SPACING;
    roads.push(p);
    box(20, 0.08, 1150, road, p, 0.04, 0, scene);
    box(1150, 0.08, 20, road, 0, 0.045, p, scene);
    for (let j = -8; j <= 8; j++) {
      box(0.7, 0.09, 8, stripe, p, 0.1, j * 32, scene);
      box(8, 0.09, 0.7, stripe, j * 32, 0.1, p, scene);
    }
  }

  for (let i = -6; i < 6; i++) {
    for (let j = -6; j < 6; j++) {
      const cx = i * ROAD_SPACING + 32.5, cz = j * ROAD_SPACING + 32.5;
      if (cx > 170 && cx < 360) continue;
      const count = 2 + Math.floor(nextRandom() * 3);
      for (let k = 0; k < count; k++) {
        const x = cx + (nextRandom() - 0.5) * 34, z = cz + (nextRandom() - 0.5) * 34;
        let h = 10 + nextRandom() * 47;
        if (Math.abs(x) < 40 && Math.abs(z) < 40) h *= 0.6;
        const b = box(11 + nextRandom() * 10, h, 12 + nextRandom() * 12, mat(buildingColors[Math.floor(nextRandom() * buildingColors.length)]), x, h / 2, z, scene);
        box(b.geometry.parameters.width + 0.5, 1, b.geometry.parameters.depth + 0.5, mat('#566b75'), x, h + 0.5, z, scene);
      }
    }
  }

  buildLandmarks(scene);
}

// Distinctive landmarks are stylized approximations, not surveyed 3D meshes.
function buildLandmarks(scene) {
  const bitexco = new THREE.Group();
  scene.add(bitexco);
  bitexco.position.set(-110, 0, -115);
  box(26, 95, 25, mat('#7bb3c6'), 0, 47.5, 0, bitexco);
  box(23, 30, 22, mat('#a4d5de'), 0, 110, 0, bitexco);
  box(41, 3, 23, mat('#bccbd3'), 14, 95, 0, bitexco);
  box(4, 20, 4, mat('#d7e3e6'), 0, 134, 0, bitexco);

  const landmark81 = new THREE.Group();
  scene.add(landmark81);
  landmark81.position.set(110, 0, -305);
  for (let k = 0; k < 3; k++) box(19, 100 + k * 34, 19, mat('#8eb5c3'), (k - 1) * 15, 50 + k * 17, 0, landmark81);
  box(17, 50, 17, mat('#aacdd9'), 0, 174, 0, landmark81);
  box(2, 24, 2, mat('#eef2ef'), 0, 211, 0, landmark81);

  // Nguyen Hue pedestrian plaza and City Hall-inspired facade.
  box(35, 0.12, 105, mat('#c7c5b8'), 0, 0.14, -55, scene);
  box(55, 16, 18, mat('#f0e1b9'), 0, 8, -115, scene);
  box(11, 24, 8, mat('#e5d4a8'), 0, 12, -115, scene);
  box(5, 4, 4, mat('#a88557'), 0, 26, -115, scene);

  // Ba Son-inspired bridge over the river.
  box(190, 1.5, 17, mat('#bcc6cd'), 260, 6, -140, scene);
  for (let x = 185; x < 355; x += 35) box(3, 13, 3, mat('#a4b4bb'), x, 0, -140, scene);
}

export function placeName(pos) {
  if (Math.abs(pos.x + 110) < 70 && Math.abs(pos.z + 115) < 70) return '📍 Bitexco · Quận 1';
  if (Math.abs(pos.x - 110) < 70 && Math.abs(pos.z + 305) < 70) return '📍 Landmark 81 · Bình Thạnh';
  if (pos.x > 180) return '📍 Sông Sài Gòn / Thủ Thiêm';
  return '📍 Trung tâm TP.HCM';
}
