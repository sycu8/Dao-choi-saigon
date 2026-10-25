import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const merge = (list) => mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)));
import { roadTileTexture, facadeTextures, waterNormalTexture, FACADE_CELLS } from './textures.js';
import { onNightChange, sky, setMirrorPass } from './sky.js';
import { buildLandmarks, landmarkFootprints } from './landmarks.js';

export const WORLD_LIMIT = 415;
export const ROAD_SPACING = 65;
export const ROAD_HALF = 10;
export const RIVER = { west: 185, east: 355, level: -1.2 };
export const roads = [];
for (let i = -6; i <= 6; i++) roads.push(i * ROAD_SPACING);

// Axis-aligned footprints of everything solid: { minX, maxX, minZ, maxZ, height }
export const buildings = [];
export const lampPositions = [];

let seed = 0;
export const rng = (n) => {
  const v = Math.sin(n * 127.1 + 13) * 43758.5453;
  return v - Math.floor(v);
};
export const nextRandom = () => rng(++seed);

const materialCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!materialCache.has(key)) materialCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...opts }));
  return materialCache.get(key);
}

export function box(w, h, d, material, x, y, z, group) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

export const isOverRiver = (x) => x > RIVER.west && x < RIVER.east;

let water, simpleWater, scene;

export function buildWorld(targetScene) {
  scene = targetScene;
  // Grass frame around the city only, so it is never overdrawn by the road planes.
  const grass = mat('#6f8a6c', { roughness: 1 });
  for (const [x0, x1, z0, z1] of [[-2000, 2000, -2000, -430], [-2000, 2000, 430, 2000], [-2000, -430, -430, 430], [430, 2000, -430, 430]]) {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2), grass);
    g.position.set((x0 + x1) / 2, -0.05, (z0 + z1) / 2);
    g.receiveShadow = true;
    scene.add(g);
  }

  const roadMat = new THREE.MeshStandardMaterial({ map: roadTileTexture(ROAD_SPACING), roughness: 0.92 });
  addRoadPlane(roadMat, -430, RIVER.west - 5);
  addRoadPlane(roadMat, RIVER.east + 5, 430);
  buildRiver();
  buildBuildings();
  buildStreetProps();
  buildLandmarks(scene);
  return { roadMaterial: roadMat };
}

function addRoadPlane(material, minX, maxX) {
  const w = maxX - minX, d = 860;
  const geo = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2);
  geo.translate(minX + w / 2, 0, 0);
  const p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / ROAD_SPACING + 0.5, -p.getZ(i) / ROAD_SPACING + 0.5);
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  scene.add(mesh);
}

function buildRiver() {
  const width = RIVER.east - RIVER.west, cx = (RIVER.east + RIVER.west) / 2;
  const geo = new THREE.PlaneGeometry(width + 20, 1400).rotateX(-Math.PI / 2);
  simpleWater = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#2a6074', roughness: 0.08, metalness: 0.1 }));
  simpleWater.position.set(cx, RIVER.level, 0);
  scene.add(simpleWater);

  for (const x of [RIVER.west - 2.5, RIVER.east + 2.5]) {
    box(5, 2.6, 860, mat('#8d8a80', { roughness: 0.95 }), x, -1.25, 0, scene);
    const railX = x + (x < cx ? -2.2 : 2.2), railMat = mat('#5d646a', { roughness: 0.5, metalness: 0.6 });
    // Gap in the railing where the Ba Son bridge (z = -130) lands.
    for (const [z0, z1] of [[-430, -142], [-118, 430]]) box(0.6, 1.1, z1 - z0, railMat, railX, 0.55, (z0 + z1) / 2, scene);
  }
}

export function setWaterQuality(t) {
  if (t.water && !water) {
    const geo = new THREE.PlaneGeometry(RIVER.east - RIVER.west + 20, 1400).rotateX(-Math.PI / 2);
    water = new Water(geo, {
      textureWidth: t.waterRes,
      textureHeight: t.waterRes,
      waterNormals: waterNormalTexture(),
      sunDirection: sky.sunDir.clone(),
      sunColor: 0xfff1dc,
      waterColor: 0x1f4a4f,
      distortionScale: 1.6,
      fog: true,
    });
    water.material.fragmentShader = water.material.fragmentShader.replace('vec3( 0.1 ) + reflectionSample * 0.9', 'vec3( 0.03 ) + reflectionSample * 0.5');
    water.material.uniforms.size.value = 5;
    const mirror = water.onBeforeRender;
    water.onBeforeRender = (...args) => {
      setMirrorPass(true);
      mirror.apply(water, args);
      setMirrorPass(false);
    };
    water.position.copy(simpleWater.position);
    water.position.y += 0.01;
    scene.add(water);
  }
  if (water) water.visible = t.water;
  simpleWater.visible = !t.water;
}

export function updateWorld(dt) {
  if (water?.visible) {
    const u = water.material.uniforms;
    u.time.value += dt * 0.6;
    u.sunDirection.value.copy(sky.sunDir);
    u.sunColor.value.setScalar(sky.daylight * 0.6 + 0.04);
  }
}

function lotFree(minX, maxX, minZ, maxZ) {
  if (maxX > RIVER.west - 10 && minX < RIVER.east + 10) return false;
  return !landmarkFootprints.some((f) => maxX > f.minX && minX < f.maxX && maxZ > f.minZ && minZ < f.maxZ);
}

function facadeMaterial(style) {
  const tex = facadeTextures(style);
  const glass = style === 'glass';
  const m = new THREE.MeshStandardMaterial({
    ...tex,
    emissive: 0xffffff,
    emissiveIntensity: 0,
    roughness: 1,
    metalness: glass ? 0.35 : 0,
  });
  const floor = glass ? 3.4 : 3.6, bay = glass ? 3 : 3.8;
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
      {
        vec3 s = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        float h = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
        vec2 wuv = abs(normal.x) > 0.5 ? vec2(position.z * s.z, position.y * s.y) : vec2(position.x * s.x, position.y * s.y);
        wuv = wuv / vec2(${bay.toFixed(2)} * ${FACADE_CELLS}.0, ${floor.toFixed(2)} * ${FACADE_CELLS}.0) + floor(vec2(h, fract(h * 13.7)) * ${FACADE_CELLS}.0) / ${FACADE_CELLS}.0;
        if (abs(normal.y) > 0.5) wuv = vec2(0.003);
        vMapUv = wuv; vEmissiveMapUv = wuv;
        #ifdef USE_ROUGHNESSMAP
        vRoughnessMapUv = wuv;
        #endif
      }`
    );
  };
  m.customProgramCacheKey = () => 'facade-' + style;
  onNightChange((n) => (m.emissiveIntensity = n * (glass ? 0.8 : 0.95)));
  return m;
}

function buildBuildings() {
  const lots = [];
  for (let i = -6; i < 6; i++) {
    for (let j = -6; j < 6; j++) {
      const cx = i * ROAD_SPACING + 32.5, cz = j * ROAD_SPACING + 32.5;
      for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const r = nextRandom();
        if (r < 0.12) continue;
        const w = 11 + nextRandom() * 7, d = 11 + nextRandom() * 7;
        const x = cx + ox * (18.6 - w / 2), z = cz + oz * (18.6 - d / 2);
        const footprint = { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 };
        if (!lotFree(footprint.minX - 2, footprint.maxX + 2, footprint.minZ - 2, footprint.maxZ + 2)) continue;
        let h = 10 + nextRandom() * 38 + (nextRandom() < 0.12 ? 40 : 0);
        const dist = Math.hypot(x + 60, z + 120);
        if (dist < 150) h *= 1.25;
        if (Math.abs(x) < 45 && z > -130 && z < 10) h *= 0.55;
        lots.push({ x, z, w, d, h, ...footprint });
      }
    }
  }

  const unit = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const styles = { concrete: [], glass: [] };
  for (const lot of lots) styles[lot.h > 42 && nextRandom() < 0.7 ? 'glass' : 'concrete'].push(lot);
  const tints = { concrete: ['#f4ead8', '#e8d9c4', '#d9e2e5', '#f1d2bd', '#e3e7d6', '#cfd5da', '#f6e2b9'], glass: ['#c4dbe8', '#b8cfd8', '#d2e0ea', '#a9c3cf'] };
  const m4 = new THREE.Matrix4(), color = new THREE.Color();

  for (const style of Object.keys(styles)) {
    const list = styles[style];
    const mesh = new THREE.InstancedMesh(unit, facadeMaterial(style), list.length);
    list.forEach((b, i) => {
      m4.makeScale(b.w, b.h, b.d).setPosition(b.x, 0, b.z);
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, color.set(tints[style][Math.floor(nextRandom() * tints[style].length)]));
    });
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
  }

  const roofGeo = merge([
    new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
  ]);
  const roofs = new THREE.InstancedMesh(roofGeo, mat('#59656c', { roughness: 0.9 }), lots.length);
  const propGeo = merge([
    new THREE.BoxGeometry(2.2, 1.4, 1.6).translate(-1.6, 0.7, 0.8),
    new THREE.BoxGeometry(1.4, 1.1, 1.4).translate(1.8, 0.55, -1.2),
    new THREE.CylinderGeometry(0.9, 0.9, 2.2, 10).translate(0.6, 1.6, 1.6),
    new THREE.CylinderGeometry(0.08, 0.08, 1.2, 4).translate(0.6, 0.4, 1.6),
  ]);
  const props = new THREE.InstancedMesh(propGeo, mat('#9aa3a6', { roughness: 0.6, metalness: 0.4 }), lots.length);
  lots.forEach((b, i) => {
    m4.makeScale(b.w + 0.6, 0.9, b.d + 0.6).setPosition(b.x, b.h, b.z);
    roofs.setMatrixAt(i, m4);
    m4.makeRotationY(Math.floor(nextRandom() * 4) * Math.PI / 2).setPosition(b.x + (nextRandom() - 0.5) * (b.w - 6), b.h + 0.9, b.z + (nextRandom() - 0.5) * (b.d - 6));
    props.setMatrixAt(i, m4);
    buildings.push({ minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ, height: b.h + 0.9, roofX: b.x, roofZ: b.z });
  });
  roofs.castShadow = roofs.receiveShadow = props.castShadow = true;
  scene.add(roofs, props);
}

let trees, lampPoles, lampHeads;

function buildStreetProps() {
  const treeSpots = [], lampSpots = [];
  for (const p of roads) {
    for (let along = -420; along <= 420; along += 13) {
      const local = ((along % ROAD_SPACING) + ROAD_SPACING) % ROAD_SPACING;
      if (local < 16 || local > ROAD_SPACING - 16) continue;
      for (const side of [-1, 1]) {
        for (const axis of [0, 1]) {
          const x = axis === 0 ? p + side * 12.2 : along, z = axis === 0 ? along : p + side * 12.2;
          if (x > RIVER.west - 8 && x < RIVER.east + 8) continue;
          if (Math.abs(x) > 425 || Math.abs(z) > 425) continue;
          if (!lotFree(x - 1, x + 1, z - 1, z + 1)) continue;
          const isLamp = Math.round(along / 13) % 3 === 0;
          if (isLamp) lampSpots.push({ x, z, rot: axis === 0 ? (side > 0 ? -Math.PI / 2 : Math.PI / 2) : (side > 0 ? Math.PI : 0) });
          else treeSpots.push({ x, z });
        }
      }
    }
  }
  for (let i = treeSpots.length - 1; i > 0; i--) {
    const j = Math.floor(nextRandom() * (i + 1));
    [treeSpots[i], treeSpots[j]] = [treeSpots[j], treeSpots[i]];
  }

  const trunk = new THREE.CylinderGeometry(0.22, 0.32, 3.2, 6).translate(0, 1.6, 0);
  const crown = new THREE.IcosahedronGeometry(2.3, 0).scale(1, 0.85, 1).translate(0, 4.4, 0);
  const crown2 = new THREE.IcosahedronGeometry(1.6, 0).translate(0.9, 5.6, 0.4);
  paint(trunk, '#6b4c35');
  paint(crown, '#ffffff');
  paint(crown2, '#e8f2df');
  trees = new THREE.InstancedMesh(merge([trunk, crown, crown2]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }), treeSpots.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), color = new THREE.Color();
  const greens = ['#4f8a3c', '#5c9a45', '#3f7a3a', '#6aa04c', '#467f33'];
  treeSpots.forEach((t, i) => {
    q.setFromAxisAngle(v.set(0, 1, 0), nextRandom() * Math.PI * 2);
    s.setScalar(0.8 + nextRandom() * 0.5);
    m4.compose(v.set(t.x, 0, t.z), q, s);
    trees.setMatrixAt(i, m4);
    trees.setColorAt(i, color.set(greens[i % greens.length]));
  });
  trees.castShadow = trees.receiveShadow = true;
  scene.add(trees);

  const pole = merge([
    new THREE.CylinderGeometry(0.12, 0.16, 7, 6).translate(0, 3.5, 0),
    new THREE.BoxGeometry(0.12, 0.12, 2.4).translate(0, 6.9, 1.1),
  ]);
  lampPoles = new THREE.InstancedMesh(pole, mat('#4b5358', { roughness: 0.5, metalness: 0.7 }), lampSpots.length);
  const headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 0.6, 0.55) });
  lampHeads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.18, 1).translate(0, 6.78, 2.1), headMat, lampSpots.length);
  lampSpots.forEach((l, i) => {
    m4.makeRotationY(l.rot).setPosition(l.x, 0, l.z);
    lampPoles.setMatrixAt(i, m4);
    lampHeads.setMatrixAt(i, m4);
    lampPositions.push(new THREE.Vector3(l.x + Math.sin(l.rot) * 2.1, 6.6, l.z + Math.cos(l.rot) * 2.1));
  });
  lampPoles.castShadow = true;
  scene.add(lampPoles, lampHeads);
  onNightChange((n) => headMat.color.setRGB(0.6 + n * 3.4, 0.6 + n * 2.9, 0.55 + n * 1.8));
}

export function setPropDensity(t) {
  trees.count = Math.floor(trees.instanceMatrix.count * t.treeShare);
}

function paint(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(arr, i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}
export { paint };

export function placeName(pos) {
  if (Math.abs(pos.x + 97.5) < 60 && Math.abs(pos.z + 97.5) < 60) return '📍 Bitexco · Quận 1';
  if (Math.abs(pos.x - 97.5) < 60 && Math.abs(pos.z + 292.5) < 60) return '📍 Landmark 81 · Bình Thạnh';
  if (Math.abs(pos.x) < 30 && pos.z < 10 && pos.z > -170) return '📍 Phố đi bộ Nguyễn Huệ · Quận 1';
  if (Math.abs(pos.z + 130) < 16 && pos.x > RIVER.west - 20 && pos.x < RIVER.east + 20) return '📍 Cầu Ba Son';
  if (pos.x > RIVER.west - 10 && pos.x < RIVER.east) return '📍 Sông Sài Gòn';
  if (pos.x >= RIVER.east) return '📍 Thủ Thiêm · TP. Thủ Đức';
  return '📍 Trung tâm TP.HCM';
}
