import * as THREE from 'three';
import { box } from './world.js';
import { createRain } from './effects.js';
import { setToast, setWeatherLabel } from './hud.js';

export const weatherList = [
  { name: '☀️ Nắng', sky: '#9ec9e1', fog: 780, rain: 0, flood: 0 },
  { name: '🌧️ Mưa rào', sky: '#8d9ea9', fog: 470, rain: 180, flood: 0.1 },
  { name: '⛈️ Mưa lớn · Ngập cục bộ', sky: '#627a88', fog: 330, rain: 380, flood: 1 },
  { name: '🌤️ Nhiều mây', sky: '#b4c3c9', fog: 640, rain: 0, flood: 0 },
];

export const weather = { index: 0, timer: 0 };
const floods = [];
let scene, rain;

export function createWeather(targetScene, roads) {
  scene = targetScene;
  rain = createRain(scene);
  for (let i = 0; i < 13; i++) {
    const p = roads[(i * 5 + 3) % roads.length];
    floods.push(box(20, 0.06, 45, new THREE.MeshLambertMaterial({ color: '#3d90b4', transparent: true, opacity: 0.58 }), p, 0.16, (i - 6) * 65, scene));
  }
  setWeather(0);
}

export function setWeather(n) {
  weather.index = n;
  const w = weatherList[n];
  scene.background.set(w.sky);
  scene.fog.color.set(w.sky);
  scene.fog.far = w.fog;
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
  return floods.some((f) => Math.abs(pos.x - f.position.x) < 12 && Math.abs(pos.z - f.position.z) < 25);
}

export function updateWeather(dt, x, y, z) {
  weather.timer += dt;
  if (weather.timer > 75) {
    weather.timer = 0;
    setWeather(Math.floor(Math.random() * weatherList.length));
  }
  rain.update(dt, x, y, z);
}
