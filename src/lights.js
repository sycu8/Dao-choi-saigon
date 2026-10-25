import * as THREE from 'three';
import { lampPositions, buildings, nextRandom, ROAD_SPACING } from './world.js';

const tmp = new THREE.Vector3();

function radialTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner);
  g.addColorStop(0.45, outer);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

const SIGNS = [
  ['PHỞ', '#ff4d6d'], ['CÀ PHÊ', '#ffd166'], ['KARAOKE', '#c77dff'], ['BÁNH MÌ', '#ff9f1c'],
  ['KHÁCH SẠN', '#4cc9f0'], ['BIA SÀI GÒN', '#06d6a0'], ['NHÀ THUỐC', '#80ffdb'], ['CƠM TẤM', '#f72585'],
];

function signTexture(text, color) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0b0d12';
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, 496, 112);
  ctx.font = 'bold 72px system-ui, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.fillStyle = color;
  ctx.fillText(text, 256, 68, 470);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.55;
  ctx.fillText(text, 256, 68, 470);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createNightLights(scene, carGroup) {
  // Light pools: one additive decal under every street lamp.
  const poolMat = new THREE.MeshBasicMaterial({ map: radialTexture('rgba(255,214,150,1)', 'rgba(255,170,90,0.35)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, fog: true });
  const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(15, 15).rotateX(-Math.PI / 2), poolMat, lampPositions.length);
  const m4 = new THREE.Matrix4();
  lampPositions.forEach((p, i) => pools.setMatrixAt(i, m4.makeTranslation(p.x, 0.04, p.z)));
  pools.renderOrder = 1;
  scene.add(pools);

  // Neon signs on building facades that face a road.
  const signGroups = SIGNS.map(([text, color]) => ({ tex: signTexture(text, color), geos: [] }));
  for (const b of buildings) {
    if (b.height > 60 || nextRandom() > 0.32) continue;
    const w = 4.5 + nextRandom() * 2, h = w / 4, y = 4.5 + nextRandom() * 5;
    const faces = [
      ['x', b.minX - 0.15, -Math.PI / 2], ['x', b.maxX + 0.15, Math.PI / 2],
      ['z', b.minZ - 0.15, Math.PI], ['z', b.maxZ + 0.15, 0],
    ];
    const [axis, coord, rot] = faces[Math.floor(nextRandom() * 4)];
    const local = ((coord % ROAD_SPACING) + ROAD_SPACING) % ROAD_SPACING;
    if (local > 20 && local < ROAD_SPACING - 20) continue;
    const g = new THREE.PlaneGeometry(w, h).rotateY(rot);
    if (axis === 'x') g.translate(coord, y, (b.minZ + b.maxZ) / 2);
    else g.translate((b.minX + b.maxX) / 2, y, coord);
    signGroups[Math.floor(nextRandom() * SIGNS.length)].geos.push(g);
  }
  const signMats = [];
  for (const s of signGroups) {
    if (!s.geos.length) continue;
    const merged = new THREE.BufferGeometry();
    const pos = [], uv = [];
    for (const g of s.geos) {
      const ng = g.toNonIndexed();
      pos.push(...ng.attributes.position.array);
      uv.push(...ng.attributes.uv.array);
    }
    merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    merged.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const m = new THREE.MeshBasicMaterial({ map: s.tex });
    signMats.push(m);
    scene.add(new THREE.Mesh(merged, m));
  }

  // Headlights (spot) and a tail glow (point) that follow the player car.
  const heads = [-0.7, 0.7].map((x) => {
    const s = new THREE.SpotLight(0xfff2d8, 0, 90, 0.42, 0.45, 1.3);
    s.position.set(x, 0.9, -2.3);
    s.target.position.set(x * 2, 0, -30);
    carGroup.add(s, s.target);
    return s;
  });
  const tail = new THREE.PointLight(0xff2a14, 0, 9, 1.6);
  tail.position.set(0, 0.9, 3);
  carGroup.add(tail);

  // A small pool of real point lights hops to the street lamps closest to the player.
  const streetLights = [];
  for (let i = 0; i < 6; i++) {
    const l = new THREE.PointLight(0xffc887, 0, 28, 1.5);
    scene.add(l);
    streetLights.push(l);
  }
  let activeStreetLights = 0, headCount = 2, timer = 0, level = 0, wetness = 0;

  return {
    configure(t) {
      activeStreetLights = t.streetLights;
      headCount = t.headlights;
      heads.forEach((h, i) => (h.visible = i < headCount));
      tail.visible = t.headlights > 1;
      streetLights.forEach((l, i) => (l.visible = i < activeStreetLights));
    },
    update(dt, focus, night, wet, cloud) {
      level = Math.max(night, THREE.MathUtils.smoothstep(cloud, 0.7, 0.95) * 0.6);
      wetness = wet;
      const solo = headCount === 1;
      heads.forEach((h, i) => {
        h.intensity = level * (solo ? 900 : 480);
        if (solo) h.position.x = h.target.position.x = 0;
        else h.position.x = i ? 0.7 : -0.7;
      });
      tail.intensity = level * 6;
      poolMat.opacity = night * (0.32 + wetness * 0.3);
      pools.visible = night > 0.02;
      for (const m of signMats) m.color.setScalar(0.35 + night * 1.9);

      timer -= dt;
      if (timer <= 0 && activeStreetLights > 0) {
        timer = 0.4;
        const nearest = lampPositions.map((p) => [p, p.distanceToSquared(tmp.set(focus.x, 6, focus.z))]).sort((a, b) => a[1] - b[1]);
        streetLights.forEach((l, i) => i < nearest.length && l.position.copy(nearest[i][0]));
      }
      streetLights.forEach((l) => (l.intensity = night * 22));
    },
  };
}
