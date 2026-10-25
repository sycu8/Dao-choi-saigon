import * as THREE from 'three';

// Readable port of the Lead scooter from the Oct 20 "Xe Bay Sài Gòn 2.0" build.
// The body profile is extruded, yawed so the nose points down -Z, then a rider,
// handlebar and two wheels are added. Outfits alternate each time it is selected.

const BODY_PROFILE = [
  [-0.5, 0.24], [-0.66, 0.42], [-0.71, 0.72], [-0.65, 1], [-0.55, 1.02],
  [-0.5, 0.74], [-0.46, 0.36], [0.1, 0.36], [0.2, 0.62], [0.84, 0.7],
  [0.93, 0.56], [0.82, 0.36], [0.5, 0.25],
];

const OUTFITS = [
  {
    name: 'Áo hoa hồng · váy hoa vàng',
    jacket: { base: '#f06c9b', motif: 'floral', ink: '#fff4f8', accent: '#ffd23f' },
    skirt: { base: '#f5c531', motif: 'floral', ink: '#fff7d6', accent: '#e8582d' },
    mask: 0x3b82d6,
    scooter: 0xefe6cf,
  },
  {
    name: 'Áo chấm bi vàng · váy chấm bi tím',
    jacket: { base: '#f7d038', motif: 'dots', ink: '#ffffff', accent: '#ffffff' },
    skirt: { base: '#8e4fc4', motif: 'dots', ink: '#f3e9ff', accent: '#f3e9ff' },
    mask: 0x6fa8dc,
    scooter: 0xf6f6f2,
  },
];

const UP = new THREE.Vector3(0, 1, 0);
const LIMB_DIR = new THREE.Vector3();

function std(list, params) {
  const material = new THREE.MeshStandardMaterial(params);
  list.push(material);
  return material;
}

function add(parent, geometry, material, x, y, z) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function clothTexture(pattern, seed) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = pattern.base;
  ctx.fillRect(0, 0, 128, 128);
  let n = seed;
  const rand = () => (n = (n * 16807) % 2147483647) / 2147483647;
  if (pattern.motif === 'dots') {
    ctx.fillStyle = pattern.ink;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        ctx.beginPath();
        ctx.arc(col * 16 + (row % 2) * 8 + 4, row * 16 + 8, 3.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else {
    for (let i = 0; i < 26; i++) {
      const x = rand() * 128;
      const y = rand() * 128;
      const radius = 4 + rand() * 5;
      ctx.fillStyle = pattern.ink;
      for (let petal = 0; petal < 5; petal++) {
        const angle = (petal / 5) * Math.PI * 2 + i;
        ctx.beginPath();
        ctx.arc(x + Math.cos(angle) * radius * 0.7, y + Math.sin(angle) * radius * 0.7, radius * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = pattern.accent;
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  return texture;
}

function limb(from, to, radius, material, parent) {
  const length = Math.max(0.01, from.distanceTo(to) - radius * 2);
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 3, 6), material);
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  LIMB_DIR.subVectors(to, from).normalize();
  mesh.quaternion.setFromUnitVectors(UP, LIMB_DIR);
  parent.add(mesh);
  return mesh;
}

export function buildScooter(root, spec, outfitIndex, shared) {
  const outfit = OUTFITS[outfitIndex % OUTFITS.length];
  const materials = [];
  const paint = std(materials, { color: outfit.scooter, roughness: 0.35, metalness: 0.1 });
  const seat = std(materials, { color: 0x3a2a22, roughness: 0.7 });
  const metal = std(materials, { color: 0x5b6066, roughness: 0.6, metalness: 0.3 });
  const jacketMap = clothTexture(outfit.jacket, 11);
  const skirtMap = clothTexture(outfit.skirt, 29);
  const jacket = std(materials, { color: 0xffffff, map: jacketMap, roughness: 0.85, flatShading: true });
  const skirt = std(materials, { color: 0xffffff, map: skirtMap, roughness: 0.9, flatShading: true, side: THREE.DoubleSide });
  const hat = std(materials, { color: 0xf7f7f4, roughness: 0.3, flatShading: true });
  const hair = std(materials, { color: 0x101114, roughness: 0.15, metalness: 0.6 });
  const mask = std(materials, { color: outfit.mask, roughness: 0.8, flatShading: true });
  const skin = std(materials, { color: 0xe0b393, roughness: 0.7, flatShading: true });
  const shoe = std(materials, { color: 0x2b2b2e, roughness: 0.8 });
  const board = std(materials, { color: 0x2c2d30, roughness: 0.9 });
  const glow = new THREE.MeshBasicMaterial({ color: 0x9fd7ff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  materials.push(glow);

  const shape = new THREE.Shape();
  BODY_PROFILE.forEach(([x, y], index) => (index === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
  shape.closePath();
  const bodyGeo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.4,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.035,
    bevelSegments: 2,
    curveSegments: 4,
  });
  bodyGeo.translate(0, 0, -0.2);
  bodyGeo.rotateY(-Math.PI / 2);
  root.add(new THREE.Mesh(bodyGeo, paint));

  add(root, new THREE.BoxGeometry(0.42, 0.02, 0.5), board, 0, 0.42, -0.18);
  add(root, new THREE.BoxGeometry(0.36, 0.12, 0.68), seat, 0, 0.78, 0.52);
  add(root, new THREE.BoxGeometry(0.3, 0.03, 0.18), metal, 0, 0.84, 0.93);
  const tail = add(root, new THREE.BoxGeometry(0.22, 0.07, 0.05), shared.taillight, 0, 0.62, 0.97);
  const plate = add(root, new THREE.BoxGeometry(0.2, 0.12, 0.02), std(materials, { color: 0xf0f0ea, roughness: 0.5 }), 0, 0.44, 0.92);
  plate.rotation.x = -0.25;

  const wheelRadius = spec.wheelRadius;
  const wheelbase = spec.wheelbase;
  const fender = add(
    root,
    new THREE.CylinderGeometry(wheelRadius + 0.05, wheelRadius + 0.05, 0.16, 12, 1, true, -Math.PI * 0.15, Math.PI * 0.75),
    paint,
    0,
    wheelRadius,
    -wheelbase / 2,
  );
  fender.rotation.z = Math.PI / 2;

  const steer = new THREE.Group();
  steer.position.set(0, 1, -0.6);
  root.add(steer);
  const fork = add(steer, new THREE.CylinderGeometry(0.03, 0.03, 0.85, 8), metal, 0, -0.38, -0.02);
  fork.rotation.x = 0.3;
  add(steer, new THREE.BoxGeometry(0.58, 0.15, 0.24), paint, 0, 0.1, 0.02);
  const lamp = add(steer, new THREE.BoxGeometry(0.26, 0.08, 0.04), shared.headlight, 0, 0.1, -0.11);
  const trim = std(materials, { color: 0x15181b, roughness: 0.55, metalness: 0.3 });
  for (const side of [-1, 1]) {
    const grip = add(steer, new THREE.CylinderGeometry(0.024, 0.024, 0.13, 8), trim, side * 0.35, 0.1, 0.06);
    grip.rotation.z = Math.PI / 2;
    const stalk = add(steer, new THREE.CylinderGeometry(0.008, 0.008, 0.26, 4), metal, side * 0.24, 0.27, 0.02);
    stalk.rotation.z = -side * 0.25;
    add(steer, new THREE.CircleGeometry(0.055, 10), metal, side * 0.28, 0.41, 0.03);
    const mirrorBack = add(steer, new THREE.CircleGeometry(0.06, 10), trim, side * 0.28, 0.41, 0.025);
    mirrorBack.rotation.y = Math.PI;
  }

  const wheels = [];
  for (const front of [true, false]) {
    const pivot = new THREE.Group();
    pivot.position.set(0, wheelRadius, (front ? -1 : 1) * wheelbase / 2);
    const spin = new THREE.Group();
    spin.add(new THREE.Mesh(new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.11, 16).rotateZ(Math.PI / 2), shared.tyre));
    spin.add(new THREE.Mesh(new THREE.CylinderGeometry(wheelRadius * 0.6, wheelRadius * 0.6, 0.12, 8).rotateZ(Math.PI / 2), metal));
    const hub = new THREE.Mesh(new THREE.TorusGeometry(wheelRadius * 0.85, 0.035, 8, 22).rotateY(Math.PI / 2), glow);
    pivot.add(spin, hub);
    root.add(pivot);
    wheels.push({ pivot, spin, front, radius: wheelRadius });
  }

  const rider = new THREE.Group();
  root.add(rider);
  const dress = add(rider, new THREE.CylinderGeometry(0.16, 0.3, 0.66, 9, 1, true), skirt, 0, 0.72, 0.12);
  dress.rotation.x = 0.62;
  add(rider, new THREE.BoxGeometry(0.36, 0.14, 0.42), skirt, 0, 0.9, 0.3);
  for (const side of [-1, 1]) add(rider, new THREE.BoxGeometry(0.09, 0.05, 0.2), shoe, side * 0.1, 0.46, -0.24);
  const torso = add(rider, new THREE.CapsuleGeometry(0.16, 0.3, 3, 8), jacket, 0, 1.2, 0.36);
  torso.rotation.x = -0.18;
  torso.scale.set(1.05, 1, 0.82);
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Vector3(side * 0.19, 1.38, 0.3);
    const elbow = new THREE.Vector3(side * 0.27, 1.17, 0.02);
    const hand = new THREE.Vector3(side * 0.33, 1.11, -0.52);
    limb(shoulder, elbow, 0.055, jacket, rider);
    limb(elbow, hand, 0.05, jacket, rider);
  }

  const head = new THREE.Group();
  head.position.set(0, 1.62, 0.28);
  rider.add(head);
  const skull = add(head, new THREE.SphereGeometry(0.135, 9, 7), jacket, 0, -0.02, 0.03);
  skull.scale.set(1, 1.05, 1.05);
  add(head, new THREE.SphereGeometry(0.1, 8, 6), skin, 0, 0, -0.05);
  const visor = add(head, new THREE.SphereGeometry(0.104, 8, 5, Math.PI * 0.1, Math.PI * 0.8, Math.PI * 0.52, Math.PI * 0.32), mask, 0, 0, -0.05);
  visor.rotation.y = Math.PI;
  add(head, new THREE.BoxGeometry(0.2, 0.05, 0.03), hair, 0, 0.02, -0.145);
  add(head, new THREE.SphereGeometry(0.15, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), hat, 0, 0.03, 0);
  const brim = add(head, new THREE.CylinderGeometry(0.16, 0.16, 0.012, 10, 1, false, Math.PI * 0.65, Math.PI * 0.7), hat, 0, 0.04, -0.02);
  brim.rotation.x = -0.15;
  const ponytail = add(head, new THREE.TorusGeometry(0.105, 0.008, 4, 12, Math.PI), shoe, 0, 0, -0.02);
  ponytail.rotation.set(0, Math.PI / 2, Math.PI);

  const underglow = new THREE.Mesh(new THREE.PlaneGeometry(spec.width * 1.2, spec.length * 1.05), glow);
  underglow.rotation.x = -Math.PI / 2;
  underglow.position.y = 0.05;
  underglow.visible = false;
  root.add(underglow);

  root.traverse((obj) => {
    if (!obj.isMesh || obj.material.transparent) return;
    obj.castShadow = true;
    obj.receiveShadow = true;
  });

  return {
    wheels,
    steer,
    head,
    eye: new THREE.Vector3(0, 1.66, 0.12),
    headlights: [lamp.position],
    taillights: [tail.position],
    thrusters: [new THREE.Vector3(-0.12, 0.36, wheelbase / 2 + 0.08), new THREE.Vector3(0.12, 0.36, wheelbase / 2 + 0.08)],
    underglow,
    materials,
    outfit: outfit.name,
  };
}

export function scooterOutfitCount() {
  return OUTFITS.length;
}
