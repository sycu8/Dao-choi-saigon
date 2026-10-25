import * as THREE from 'three';
import { RIVER } from './world.js';
import { createRain } from './effects.js';
import { setToast, setWeatherLabel } from './hud.js';

export const weatherList = [
  { name: '☀️ Nắng', cloud: 0, fog: 780, rain: 0, flood: 0 },
  { name: '🌧️ Mưa rào', cloud: 0.62, fog: 470, rain: 180, flood: 0.1 },
  { name: '⛈️ Mưa lớn · Ngập cục bộ', cloud: 0.92, fog: 330, rain: 380, flood: 1 },
  { name: '🌤️ Nhiều mây', cloud: 0.42, fog: 640, rain: 0, flood: 0 },
];

export const weather = { index: 0, timer: 0, mix: { cloud: 0, fogFar: 780, rain: 0, flood: 0 } };
const floods = [];
let rain;

export function createWeather(scene, roads) {
  rain = createRain(scene);
  const floodMat = new THREE.MeshStandardMaterial({ color: '#4b6f7c', roughness: 0.04, metalness: 0.2, transparent: true, opacity: 0.82 });
  for (let i = 0; i < 13; i++) {
    const p = roads[(i * 5 + 3) % roads.length];
    if (p > RIVER.west - 12 && p < RIVER.east + 12) continue;
    const f = new THREE.Mesh(new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2), floodMat);
    f.scale.set(9.5, 1, 22);
    f.position.set(p, 0.05, (i - 6) * 65);
    f.receiveShadow = true;
    scene.add(f);
    floods.push(f);
  }
  setWeather(0);
}

export function setWeather(n) {
  weather.index = n;
  const w = weatherList[n];
  Object.assign(weather.mix, { cloud: w.cloud, fogFar: w.fog, rain: w.rain, flood: w.flood });
  rain.setAmount(w.rain);
  floods.forEach((f) => (f.visible = w.flood > 0));
  setWeatherLabel(w.name);
  setToast(w.flood ? '⚠️ Ngập đường! Giảm tốc hoặc cất cánh để vượt qua.' : 'Khám phá Sài Gòn theo cách của bạn!');
}

export const nextWeather = () => setWeather((weather.index + 1) % weatherList.length);
export const current = () => weatherList[weather.index];
export const isStorm = () => weather.index === 2;

export function isInFlood(pos, altitude) {
  if (!current().flood || altitude >= 1) return false;
  return floods.some((f) => Math.abs(pos.x - f.position.x) < 9.5 && Math.abs(pos.z - f.position.z) < 22);
}

export function updateWeather(dt, x, y, z) {
  weather.timer += dt;
  if (weather.timer > 75) {
    weather.timer = 0;
    setWeather(Math.floor(Math.random() * weatherList.length));
  }
  rain.update(dt, x, y, z);
}
