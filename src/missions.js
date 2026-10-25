import * as THREE from 'three';
import { LANDMARKS, landmarkFootprints } from './landmarks.js';
import { buildings, roads, RIVER, rng } from './world.js';
import { onNightChange } from './sky.js';
import { chime } from './audio.js';
import { setToast } from './hud.js';

const SAVE_KEY = 'xebay.save';
export const save = loadSave();

function loadSave() {
  const base = { money: 0, score: 0, bestRace: 0, deliveries: 0, passengers: 0, found: [] };
  try {
    return { ...base, ...JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') };
  } catch {
    return base;
  }
}
const persist = () => {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {}
};

export const formatMoney = (v) => Math.round(v).toLocaleString('vi-VN') + 'đ';

export const STATIONS = [
  { x: 76.5, z: 32.5 },
  { x: -118.5, z: -227.5 },
  { x: 141.5, z: -292.5 },
  { x: -32.5, z: 141.5 },
  { x: 32.5, z: -248.5 },
  { x: 401.5, z: -32.5 },
];

export const MISSION_STARTS = [
  { type: 'delivery', x: 0, z: 8, label: 'GIAO HÀNG', color: '#ffb340' },
  { type: 'passenger', x: 65, z: 40, label: 'CHỞ KHÁCH', color: '#4fd1ff' },
  { type: 'race', x: -65, z: 40, label: 'ĐUA CHECKPOINT', color: '#ff5fa2' },
];

export const LANTERN_COUNT = 12;
const PASSENGERS = ['chị Lan', 'anh Tuấn', 'cô Mai', 'chú Hùng', 'bạn Vy', 'ông Sáu', 'anh Khoa', 'chị Hạnh'];
const PARCELS = ['bánh mì', 'trà sữa', 'hoa tươi', 'tài liệu gấp', 'điện thoại mới', 'cà phê sữa đá'];
const RACE_ROUTE = [
  { ...LANDMARKS.nguyenHue, alt: null },
  { x: 0, z: -158, alt: 42, name: 'Trên nóc UBND Thành phố' },
  { x: LANDMARKS.bitexco.x, z: LANDMARKS.bitexco.z, alt: 168, name: 'Sân đỗ trực thăng Bitexco' },
  { x: LANDMARKS.landmark81.x, z: LANDMARKS.landmark81.z, alt: 252, name: 'Đỉnh Landmark 81' },
  { x: LANDMARKS.baSon.x, z: LANDMARKS.baSon.z, alt: 24, name: 'Cầu Ba Son' },
];
const RACE_TIME = 170;
// Stylized street names for the 13 north-south (x) and east-west (z) grid roads.
const X_STREETS = ['Cách Mạng Tháng 8', 'Nguyễn Thị Minh Khai', 'Nam Kỳ Khởi Nghĩa', 'Pasteur', 'Hai Bà Trưng', 'Đồng Khởi', 'Nguyễn Huệ', 'Hồ Tùng Mậu', 'Calmette', 'Ký Con', 'Mai Chí Thọ', 'Trần Não', 'Lương Định Của'];
const Z_STREETS = ['Điện Biên Phủ', 'Võ Thị Sáu', 'Lý Tự Trọng', 'Lê Thánh Tôn', 'Nguyễn Du', 'Lê Duẩn', 'Lê Lợi', 'Hàm Nghi', 'Nguyễn Công Trứ', 'Võ Văn Kiệt', 'Tôn Đức Thắng', 'Trần Hưng Đạo', 'Nguyễn Trãi'];
const streetName = (axis, road) => 'đường ' + (axis === 0 ? X_STREETS : Z_STREETS)[Math.round(road / 65) + 6];

export const missions = {
  active: null,
  objective: null,
  charging: false,
};

let scene, objectiveMarker, startMarkers = [], lanterns = [], cooldownType = null, typeCycle = 0;

function beamMaterial(color, opacity) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
}

function labelSprite(text, color) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(8,26,43,0.85)';
  g.beginPath();
  g.roundRect(8, 16, 496, 96, 48);
  g.fill();
  g.strokeStyle = color;
  g.lineWidth = 6;
  g.stroke();
  g.fillStyle = '#fff';
  g.font = 'bold 54px system-ui, Arial';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, fog: false }));
  sprite.scale.set(12, 3, 1);
  return sprite;
}

function createBeam(color, height = 160, radius = 3.2) {
  const group = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 20, 1, true).translate(0, height / 2, 0), beamMaterial(color, 0.22));
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius + 0.6, radius + 1.6, 32).rotateX(-Math.PI / 2).translate(0, 0.12, 0), beamMaterial(color, 0.8));
  beam.renderOrder = ring.renderOrder = 4;
  group.add(beam, ring);
  group.userData = { beam, ring };
  return group;
}

function createObjectiveMarker() {
  const group = createBeam('#ffcc33', 400, 4);
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(9, 0.7, 8, 40), beamMaterial('#ffd84d', 0.95));
  hoop.renderOrder = 4;
  group.add(hoop);
  group.userData.hoop = hoop;
  group.visible = false;
  scene.add(group);
  return group;
}

function createStation(s) {
  const group = new THREE.Group();
  group.position.set(s.x, 0, s.z);
  const pad = new THREE.Mesh(new THREE.RingGeometry(5.2, 6, 40).rotateX(-Math.PI / 2).translate(0, 0.06, 0), beamMaterial('#35e07a', 0.75));
  const kiosk = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.3, 0.7).translate(0, 1.15, 0), new THREE.MeshStandardMaterial({ color: '#f2f5f4', roughness: 0.4 }));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.9).translate(0, 1.55, 0.36), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 1.6, 0.6) }));
  const back = screen.clone();
  back.rotation.y = Math.PI;
  const sign = labelSprite('⚡ VinFast', '#35e07a');
  sign.position.set(0, 4.2, 0);
  sign.scale.set(7, 1.75, 1);
  kiosk.castShadow = true;
  group.add(pad, kiosk, screen, back, sign);
  scene.add(group);
}

function createLanterns() {
  const candidates = buildings
    .map((b, i) => ({ b, h: rng(i * 7.31 + 3) }))
    .filter(({ b }) => b.height > 18 && b.height < 90 && Math.hypot(b.roofX, b.roofZ - 40) > 60)
    .sort((a, b) => a.h - b.h)
    .slice(0, LANTERN_COUNT);
  const bodyMat = new THREE.MeshStandardMaterial({ color: '#d4261c', emissive: '#ff3b1f', emissiveIntensity: 0.5, roughness: 0.5 });
  const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.6, 0.4) });
  onNightChange((n) => (bodyMat.emissiveIntensity = 0.5 + n * 1.6));
  const body = new THREE.SphereGeometry(0.9, 12, 8).scale(1, 1.25, 1);
  const cap = new THREE.CylinderGeometry(0.45, 0.45, 0.3, 10);
  candidates.forEach(({ b }, i) => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(body, bodyMat);
    const top = new THREE.Mesh(cap, glowMat);
    top.position.y = 1.2;
    const bottom = top.clone();
    bottom.position.y = -1.2;
    g.add(m, top, bottom);
    g.position.set(b.roofX, b.height + 2.2, b.roofZ);
    g.visible = !save.found.includes(i);
    scene.add(g);
    lanterns.push({ group: g, roof: b.height, index: i });
  });
}

export function createMissions(targetScene) {
  scene = targetScene;
  objectiveMarker = createObjectiveMarker();
  for (const s of MISSION_STARTS) {
    const m = createBeam(s.color, 60, 3);
    m.position.set(s.x, 0, s.z);
    const label = labelSprite(s.label, s.color);
    label.position.y = 7;
    m.add(label);
    scene.add(m);
    startMarkers.push({ ...s, group: m });
  }
  STATIONS.forEach(createStation);
  createLanterns();
}

function blocked(x, z) {
  if (x > RIVER.west - 14 && x < RIVER.east + 14) return true;
  return landmarkFootprints.some((f) => x > f.minX - 4 && x < f.maxX + 4 && z > f.minZ - 4 && z < f.maxZ + 4);
}

// A random kerbside point on the road grid between minDist and maxDist from `from`.
function randomStreetPoint(from, minDist, maxDist) {
  const usable = roads.filter((r) => Math.abs(r) <= 325);
  for (let tries = 0; tries < 200; tries++) {
    const road = usable[Math.floor(Math.random() * usable.length)];
    let along = (Math.random() - 0.5) * 650;
    const local = ((along % 65) + 65) % 65;
    if (local < 14 || local > 51) along += 32.5 - local;
    const side = Math.random() < 0.5 ? -4.5 : 4.5;
    const axis = Math.random() < 0.5 ? 0 : 1;
    const x = axis === 0 ? road + side : along, z = axis === 0 ? along : road + side;
    const d = Math.hypot(x - from.x, z - from.z);
    if (d < minDist || d > maxDist || blocked(x, z)) continue;
    const point = new THREE.Vector3(x, 0, z);
    point.name = streetName(axis, road);
    return point;
  }
  const fallback = new THREE.Vector3(0, 0, -20);
  fallback.name = 'phố đi bộ Nguyễn Huệ';
  return fallback;
}

const legTime = (from, to) => Math.round(from.distanceTo(to) / 15 + 22);

export function startMission(type, player) {
  if (missions.active) return;
  const from = player.pos.clone();
  if (type === 'delivery') {
    const to = randomStreetPoint(from, 180, 420);
    const parcel = PARCELS[Math.floor(Math.random() * PARCELS.length)];
    missions.active = {
      type, title: '📦 Giao hàng',
      legs: [{ pos: to, alt: null, radius: 7, text: `Giao ${parcel} tới ${to.name}` }],
      leg: 0, time: legTime(from, to), elapsed: 0, reward: 30000 + Math.round(from.distanceTo(to) / 10) * 1000,
    };
  } else if (type === 'passenger') {
    const pick = randomStreetPoint(from, 60, 170);
    const drop = randomStreetPoint(pick, 220, 450);
    const who = PASSENGERS[Math.floor(Math.random() * PASSENGERS.length)];
    missions.active = {
      type, title: '🚕 Chở khách',
      legs: [
        { pos: pick, alt: null, radius: 7, text: `Đón ${who} ở ${pick.name}` },
        { pos: drop, alt: null, radius: 7, text: `Đưa ${who} tới ${drop.name}` },
      ],
      leg: 0, time: legTime(from, pick), elapsed: 0, reward: 40000 + Math.round(pick.distanceTo(drop) / 10) * 1000, who,
    };
  } else {
    missions.active = {
      type, title: '🏁 Đua checkpoint',
      legs: RACE_ROUTE.map((c) => ({ pos: new THREE.Vector3(c.x, 0, c.z), alt: c.alt, radius: c.alt ? 13 : 9, text: c.name })),
      leg: 0, time: RACE_TIME, elapsed: 0, reward: 150000,
    };
  }
  cooldownType = type;
  chime(true);
  setToast(`${missions.active.title}: ${missions.active.legs[0].text}`);
  showObjective();
}

export function startNextMission(player) {
  if (missions.active) return;
  startMission(MISSION_STARTS[typeCycle++ % MISSION_STARTS.length].type, player);
}

export function cancelMission() {
  if (!missions.active) return;
  missions.active = null;
  showObjective();
  setToast('Đã hủy nhiệm vụ.');
}

function showObjective() {
  const m = missions.active;
  const leg = m && m.legs[m.leg];
  missions.objective = leg || null;
  objectiveMarker.visible = !!leg;
  if (!leg) return;
  objectiveMarker.position.set(leg.pos.x, 0, leg.pos.z);
  const { hoop, ring, beam } = objectiveMarker.userData;
  hoop.visible = leg.alt !== null;
  ring.visible = leg.alt === null;
  beam.material.color.set(m.type === 'race' ? '#ff5fa2' : '#ffcc33');
  if (leg.alt !== null) {
    hoop.position.y = leg.alt;
    const next = m.legs[m.leg + 1];
    hoop.rotation.set(0, next ? Math.atan2(next.pos.x - leg.pos.x, next.pos.z - leg.pos.z) : 0, 0);
  }
}

function finish(success) {
  const m = missions.active;
  missions.active = null;
  showObjective();
  chime(success);
  if (!success) {
    setToast('⏱ Hết giờ! Nhiệm vụ thất bại — thử lại nhé.');
    return;
  }
  const bonus = Math.round(Math.max(0, m.time) * 1000);
  const reward = m.reward + bonus;
  save.money += reward;
  save.score += Math.round(reward / 1000) + 50;
  let extra = '';
  if (m.type === 'delivery') save.deliveries++;
  if (m.type === 'passenger') save.passengers++;
  if (m.type === 'race' && (!save.bestRace || m.elapsed < save.bestRace)) {
    save.bestRace = m.elapsed;
    extra = ' · 🏆 Kỷ lục mới!';
  }
  persist();
  setToast(`✅ Hoàn thành! +${formatMoney(reward)}${extra}`);
}

const reached = (leg, player) => Math.hypot(player.pos.x - leg.pos.x, player.pos.z - leg.pos.z) < leg.radius && (leg.alt === null ? player.altitude - player.ground < 10 : Math.abs(player.altitude - leg.alt) < 14);

export function updateMissions(dt, t, player) {
  const m = missions.active;
  if (m) {
    m.time -= dt;
    m.elapsed += dt;
    const leg = m.legs[m.leg];
    if (reached(leg, player)) {
      m.leg++;
      if (m.leg >= m.legs.length) finish(true);
      else {
        chime(true);
        const nextLeg = m.legs[m.leg];
        if (m.type === 'passenger') {
          m.time += legTime(leg.pos, nextLeg.pos);
          setToast(`🙋 ${m.who} đã lên xe! ${nextLeg.text}`);
        } else setToast(`🏁 Checkpoint ${m.leg}/${m.legs.length} · Tiếp: ${nextLeg.text}`);
        showObjective();
      }
    } else if (m.time <= 0) finish(false);
  }

  if (objectiveMarker.visible) {
    const { ring, hoop } = objectiveMarker.userData;
    ring.rotation.y = t;
    hoop.material.opacity = 0.75 + Math.sin(t * 6) * 0.2;
  }

  for (const s of startMarkers) {
    const d = Math.hypot(player.pos.x - s.x, player.pos.z - s.z);
    s.group.visible = !m;
    if (cooldownType === s.type && d > 14) cooldownType = null;
    if (!m && cooldownType !== s.type && d < 5 && player.altitude - player.ground < 6) startMission(s.type, player);
  }

  for (const l of lanterns) {
    if (!l.group.visible) continue;
    l.group.rotation.y = t * 1.2;
    l.group.position.y = l.roof + 2.2 + Math.sin(t * 2 + l.index) * 0.3;
    if (Math.hypot(player.pos.x - l.group.position.x, player.pos.z - l.group.position.z) < 5 && Math.abs(player.altitude - l.roof) < 9) {
      l.group.visible = false;
      save.found.push(l.index);
      save.money += 50000;
      save.score += 100;
      persist();
      chime(true);
      setToast(`🏮 Tìm thấy đèn lồng bí ẩn ${save.found.length}/${LANTERN_COUNT}! +${formatMoney(50000)}`);
    }
  }

  missions.charging = false;
  if (player.altitude - player.ground < 1 && Math.abs(player.speed) < 4) {
    for (const s of STATIONS) {
      if (Math.hypot(player.pos.x - s.x, player.pos.z - s.z) < 7) {
        missions.charging = player.energy < 100;
        player.energy = Math.min(100, player.energy + dt * 22);
      }
    }
  }
}
