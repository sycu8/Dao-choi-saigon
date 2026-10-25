import * as THREE from 'three';
import { facadeTextures, helipadTexture, colonialTexture } from './textures.js';
import { onNightChange } from './sky.js';

// Stylized approximations of real landmarks, not surveyed meshes.
export const LANDMARKS = {
  bitexco: { x: -97.5, z: -97.5, name: 'Bitexco' },
  landmark81: { x: 97.5, z: -292.5, name: 'Landmark 81' },
  cityHall: { x: 0, z: -158, name: 'UBND Thành phố' },
  baSon: { x: 270, z: -130, name: 'Cầu Ba Son' },
  nguyenHue: { x: 0, z: -60, name: 'Phố đi bộ Nguyễn Huệ' },
};

export const landmarkFootprints = [
  { minX: -114, maxX: -81, minZ: -114, maxZ: -81, height: 150 },
  { minX: 83, maxX: 112, minZ: -307, maxZ: -278, height: 235 },
  { minX: -29, maxX: 29, minZ: -168, maxZ: -147, height: 30 },
];

function glassMaterial(tint, repeatX, repeatY) {
  const tex = facadeTextures('glass');
  for (const t of Object.values(tex)) t.repeat.set(repeatX, repeatY);
  const m = new THREE.MeshStandardMaterial({ ...tex, color: tint, metalness: 0.45, roughness: 1, emissive: 0xffffff, emissiveIntensity: 0 });
  onNightChange((n) => (m.emissiveIntensity = n * 0.4));
  return m;
}

function glowMaterial(r, g, b, nightBoost = 4) {
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b) });
  onNightChange((n) => m.color.setRGB(r * (0.7 + n * nightBoost), g * (0.7 + n * nightBoost), b * (0.7 + n * nightBoost)));
  return m;
}

function shadowed(mesh) {
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

function bitexco() {
  const g = new THREE.Group();
  const profile = [[0, 0], [14, 0], [15.5, 25], [15, 60], [13, 95], [10.5, 120], [7, 136], [3, 142], [0, 143]].map(([r, y]) => new THREE.Vector2(r, y));
  const tower = shadowed(new THREE.Mesh(new THREE.LatheGeometry(profile, 32), glassMaterial('#9cc6dc', 16, 18)));
  tower.scale.z = 0.72;
  g.add(tower);

  const pad = new THREE.Group();
  pad.position.set(19, 96, 0);
  const deck = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(10.5, 9, 1.6, 32), new THREE.MeshStandardMaterial({ color: '#c8cfd4', metalness: 0.5, roughness: 0.4 })));
  const top = new THREE.Mesh(new THREE.CircleGeometry(9.6, 32).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: helipadTexture(), roughness: 0.8 }));
  top.position.y = 0.82;
  const under = shadowed(new THREE.Mesh(new THREE.ConeGeometry(9, 9, 32, 1, true).rotateX(Math.PI), new THREE.MeshStandardMaterial({ color: '#aab6bd', metalness: 0.6, roughness: 0.35, side: THREE.DoubleSide })));
  under.position.y = -5.3;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(10.2, 0.18, 6, 48).rotateX(Math.PI / 2), glowMaterial(0.3, 1, 0.5, 5));
  ring.position.y = 0.9;
  pad.add(deck, top, under, ring);
  g.add(pad);

  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.6, 18, 8), new THREE.MeshStandardMaterial({ color: '#dfe6ea', metalness: 0.8, roughness: 0.3 }));
  spire.position.y = 151;
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), glowMaterial(1.5, 0.15, 0.1, 3));
  beacon.position.y = 160.5;
  g.add(spire, beacon);
  return g;
}

function landmark81() {
  const g = new THREE.Group();
  const heights = [[150, 176, 160], [192, 222, 200], [142, 168, 184]];
  const mat = glassMaterial('#b4cfdd', 1.2, 22);
  const led = glowMaterial(0.4, 0.6, 1, 1.2);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const h = heights[i][j], x = (i - 1) * 9.2, z = (j - 1) * 9.2;
      const prism = shadowed(new THREE.Mesh(new THREE.BoxGeometry(9, h, 9), mat));
      prism.position.set(x, h / 2, z);
      const cap = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(3.6, 6.3, 6, 4, 1).rotateY(Math.PI / 4), mat));
      cap.position.set(x, h + 3, z);
      g.add(prism, cap);
      if (i !== 1 || j !== 1) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.3, h * 0.92, 0.3), led);
        strip.position.set(x + Math.sign(x || 1) * 4.6, h * 0.46, z + Math.sign(z || 1) * 4.6);
        g.add(strip);
      }
    }
  }
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 1.8, 14, 8), new THREE.MeshStandardMaterial({ color: '#e7eef2', metalness: 0.8, roughness: 0.25 }));
  crown.position.y = 235;
  g.add(crown);
  return g;
}

function cityHall() {
  const g = new THREE.Group();
  const facade = colonialTexture();
  const wall = (w, h, d, x, y, z, bays, floors) => {
    const t = facade.clone();
    t.repeat.set(bays, floors);
    t.needsUpdate = true;
    const m = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 })));
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  const roofMat = new THREE.MeshStandardMaterial({ color: '#a8432f', roughness: 0.7 });
  const roof = (w, d, h, x, y, z) => {
    const r = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.5, Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4), roofMat));
    r.scale.set(w, h, d);
    r.position.set(x, y + h / 2, z);
    g.add(r);
  };
  wall(56, 13, 16, 0, 6.5, 0, 14, 2);
  roof(56, 16, 4, 0, 13, 0);
  for (const x of [-24, 24]) {
    wall(10, 15, 19, x, 7.5, 0.8, 2, 2);
    roof(10.5, 19.5, 4.5, x, 15, 0.8);
  }
  wall(11, 26, 11, 0, 13, 1.5, 2, 4);
  roof(11.5, 11.5, 7, 0, 26, 1.5);
  const clock = new THREE.Mesh(new THREE.CircleGeometry(2, 24), glowMaterial(1, 0.95, 0.8, 1.5));
  clock.position.set(0, 21, 7.05);
  g.add(clock);
  const statue = shadowed(new THREE.Mesh(new THREE.BoxGeometry(3, 3.2, 3), new THREE.MeshStandardMaterial({ color: '#c9c3b5', roughness: 0.6 })));
  statue.position.set(0, 1.6, 13);
  const figure = shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(0.6, 1.6, 4, 8), new THREE.MeshStandardMaterial({ color: '#7d6a4a', metalness: 0.7, roughness: 0.35 })));
  figure.position.set(0, 4.5, 13);
  g.add(statue, figure);
  return g;
}

function nguyenHuePlaza() {
  const g = new THREE.Group();
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(27, 112).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#d8d2c2', roughness: 0.7 }));
  plaza.position.set(0, 0.03, -73);
  plaza.receiveShadow = true;
  g.add(plaza);
  const lightMat = glowMaterial(1, 0.85, 0.6, 3);
  for (let z = -120; z <= -24; z += 16) {
    const fountain = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.8, 0.6, 20), new THREE.MeshStandardMaterial({ color: '#b9b4a6', roughness: 0.5 }));
    fountain.position.set(0, 0.3, z);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(2.3, 20).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#3f8fb0', roughness: 0.05, metalness: 0.2 }));
    pool.position.set(0, 0.62, z);
    g.add(fountain, pool);
    for (const x of [-11, 11]) {
      const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1, 6), lightMat);
      bollard.position.set(x, 0.5, z + 8);
      g.add(bollard);
    }
  }
  return g;
}

function baSonBridge(riverWest, riverEast) {
  const g = new THREE.Group();
  const length = riverEast - riverWest + 14, cx = (riverWest + riverEast) / 2;
  const deck = shadowed(new THREE.Mesh(new THREE.BoxGeometry(length, 1.4, 21), new THREE.MeshStandardMaterial({ color: '#3a4047', roughness: 0.9 })));
  deck.position.set(cx, -0.68, 0);
  g.add(deck);
  const steel = new THREE.MeshStandardMaterial({ color: '#d9dee2', metalness: 0.6, roughness: 0.35 });
  for (const side of [-1, 1]) {
    const rail = shadowed(new THREE.Mesh(new THREE.BoxGeometry(length, 1, 0.5), steel));
    rail.position.set(cx, 0.5, side * 10.4);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(length, 0.02, 0.18), new THREE.MeshBasicMaterial({ color: '#e8e6de' }));
    stripe.position.set(cx, 0.02, side * 9.2);
    g.add(rail, stripe);
  }
  const center = new THREE.Mesh(new THREE.BoxGeometry(length, 0.02, 0.4), new THREE.MeshBasicMaterial({ color: '#e9c34f' }));
  center.position.set(cx, 0.02, 0);
  g.add(center);

  const pylonX = riverEast - 30, pylonH = 72;
  const pylon = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.6, pylonH, 8), steel));
  pylon.position.set(pylonX + 6, pylonH / 2 - 2, -14);
  pylon.rotation.z = 0.12;
  const base = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(3.4, 4, 4, 12), new THREE.MeshStandardMaterial({ color: '#9b9a92', roughness: 0.9 })));
  base.position.set(pylonX + 1.6, -2.5, -14);
  g.add(pylon, base);
  const top = new THREE.Vector3(pylonX + 1.6, pylonH - 4, -14);
  const pts = [];
  for (let k = 0; k < 14; k++) {
    for (const side of [-1, 1]) {
      pts.push(top.x, top.y - k * 1.2, top.z, pylonX - 12 - k * 9, 0.8, side * 10.1);
    }
  }
  const cableGeo = new THREE.BufferGeometry();
  cableGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.add(new THREE.LineSegments(cableGeo, new THREE.LineBasicMaterial({ color: '#eef1f3' })));
  const navLights = glowMaterial(1.4, 1.2, 0.8, 3);
  for (let x = riverWest; x <= riverEast; x += 17) {
    for (const side of [-1, 1]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), navLights);
      l.position.set(x, 1.15, side * 10.4);
      g.add(l);
    }
  }
  return g;
}

export function buildLandmarks(scene, river = { west: 185, east: 355 }) {
  const place = (obj, { x, z }) => {
    obj.position.set(x, 0, z);
    scene.add(obj);
    return obj;
  };
  place(bitexco(), LANDMARKS.bitexco);
  place(landmark81(), LANDMARKS.landmark81);
  place(cityHall(), LANDMARKS.cityHall);
  scene.add(nguyenHuePlaza());
  const bridge = baSonBridge(river.west, river.east);
  bridge.position.z = LANDMARKS.baSon.z;
  scene.add(bridge);
}
