import * as THREE from 'three';
import { RIVER } from './world.js';
import { createRain, createLightning, shake } from './effects.js';
import { thunder } from './audio.js';
import { setToast, setWeatherLabel } from './hud.js';

export const weatherList = [
  { name: '☀️ Nắng', cloud: 0, fog: 780, rain: 0, flood: 0 },
  { name: '🌧️ Mưa rào', cloud: 0.62, fog: 430, rain: 0.45, flood: 0.25 },
  { name: '⛈️ Mưa lớn · Ngập cục bộ', cloud: 0.92, fog: 260, rain: 1, flood: 1 },
  { name: '🌤️ Nhiều mây', cloud: 0.42, fog: 640, rain: 0, flood: 0 },
];

const TRANSITION_SECONDS = 5;

export const weather = {
  index: 0,
  timer: 0,
  mix: { cloud: 0, fogFar: 780, rain: 0, flood: 0, wet: 0, flash: 0 },
};
const floods = [];
let rain, lightning, roadMaterial, floodMat, lightningTimer = 6;
const dryRoad = new THREE.Color('#ffffff'), wetRoad = new THREE.Color('#9da3a8');

export function createWeather(scene, roads, roadMat) {
  roadMaterial = roadMat;
  rain = createRain(scene);
  lightning = createLightning(scene);
  floodMat = new THREE.MeshStandardMaterial({ color: '#3f5d68', roughness: 0.03, metalness: 0.3, transparent: true, opacity: 0, depthWrite: false });
  for (let i = 0; i < 13; i++) {
    const p = roads[(i * 5 + 3) % roads.length];
    if (p > RIVER.west - 12 && p < RIVER.east + 12) continue;
    const f = new THREE.Mesh(new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2), floodMat);
    f.position.set(p, 0.05, (i - 6) * 65);
    f.receiveShadow = true;
    f.renderOrder = 1;
    scene.add(f);
    floods.push(f);
  }
  const start = parseInt(new URLSearchParams(location.search).get('weather'), 10);
  setWeather(weatherList[start] ? start : 0, true);
  if (weatherList[start]) weather.mix.wet = weatherList[start].rain ? 1 : 0;
}

export const forceLightning = () => (lightningTimer = 0);
export const setRainQuality = (t) => rain.setMaxDrops(t.rainDrops);

export function setWeather(n, instant = false) {
  weather.index = n;
  const w = weatherList[n];
  if (instant) Object.assign(weather.mix, { cloud: w.cloud, fogFar: w.fog, rain: w.rain, flood: w.flood });
  setWeatherLabel(w.name);
  setToast(w.flood > 0.5 ? '⚠️ Ngập đường! Giảm tốc hoặc cất cánh để vượt qua.' : w.rain ? '🌧️ Trời bắt đầu mưa, đường trơn!' : 'Khám phá Sài Gòn theo cách của bạn!');
}

export const nextWeather = () => setWeather((weather.index + 1) % weatherList.length);
export const current = () => weatherList[weather.index];
export const isStorm = () => weather.mix.rain > 0.75;

export function isInFlood(pos, altitude) {
  if (weather.mix.flood < 0.3 || altitude >= 1) return false;
  const s = 0.4 + 0.6 * weather.mix.flood;
  return floods.some((f) => Math.abs(pos.x - f.position.x) < 9.5 * s && Math.abs(pos.z - f.position.z) < 22 * s);
}

export function updateWeather(dt, camera, carVelocity, daylight) {
  weather.timer += dt;
  if (weather.timer > 75) {
    weather.timer = 0;
    setWeather(Math.floor(Math.random() * weatherList.length));
  }
  const w = weatherList[weather.index], m = weather.mix;
  const k = 1 - Math.exp(-dt / (TRANSITION_SECONDS / 3));
  m.cloud += (w.cloud - m.cloud) * k;
  m.fogFar += (w.fog - m.fogFar) * k;
  m.rain += (w.rain - m.rain) * k;
  m.flood += (w.flood - m.flood) * k * 0.5;
  m.wet = THREE.MathUtils.clamp(m.wet + (m.rain > 0.08 ? dt * 0.12 * m.rain : -dt * 0.025), 0, 1);

  roadMaterial.roughness = THREE.MathUtils.lerp(0.92, 0.28, m.wet);
  roadMaterial.color.copy(dryRoad).lerp(wetRoad, m.wet);
  floodMat.opacity = 0.85 * Math.min(1, m.flood * 1.4);
  const s = 0.4 + 0.6 * m.flood;
  for (const f of floods) {
    f.visible = m.flood > 0.02;
    f.scale.set(9.5 * s, 1, 22 * s);
  }

  if (m.rain > 0.75) {
    lightningTimer -= dt;
    if (lightningTimer <= 0) {
      lightningTimer = 5 + Math.random() * 9;
      const dist = lightning.strike(camera);
      thunder(dist);
      shake.add(dist < 300 ? 0.35 : 0.12);
    }
  }
  m.flash = lightning.update(dt);
  rain.update(dt, camera, carVelocity, m.rain, Math.max(daylight, m.flash));
}
