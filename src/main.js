import * as THREE from 'three';
import { buildWorld, roads, placeName, updateWorld, setWaterQuality, setPropDensity } from './world.js';
import { createPlayerCar, animateWheels, headlightMat, taillightMat, models } from './vehicles.js';
import { createTraffic, updateTraffic, setTrafficDensity, pickHonk } from './traffic.js';
import { createWeather, updateWeather, nextWeather, isInFlood, isStorm, weather, setRainQuality, forceLightning } from './weather.js';
import { createSky, updateSky, setShadows, setLowShading, skipTime, clockLabel, onNightChange, sky } from './sky.js';
import { applyShading, syncTwins } from './materials.js';
import { setAnisotropy } from './textures.js';
import { createPostFX } from './postfx.js';
import { createNightLights } from './lights.js';
import { createCarFx } from './carfx.js';
import { shake } from './effects.js';
import { startAudio, updateAudio, toggleMute, onMuteChange, distantHorn, thump } from './audio.js';
import { player, toggleFly, resetPlayer, updatePlayer } from './gameplay.js';
import { createMissions, updateMissions, startNextMission, cancelMission, missions, save, formatMoney, LANTERN_COUNT } from './missions.js';
import { createMinimap, updateMinimap, bearingTo } from './minimap.js';
import { updateHud, bindButtons, setFps, setQualityLabel, setMuteLabel, setToast, setPaused, setQualityButtons, updateMissionHud, updateProgress, setStats } from './hud.js';
import { initInput, axis, keys } from './input.js';
import { settings, tier, setQuality, onQualityChange } from './settings.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.3, 2000);
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.prepend(renderer.domElement);

createSky(scene, renderer);
const { roadMaterial } = buildWorld(scene);
createTraffic(scene, roads);
const car = createPlayerCar(scene);
createWeather(scene, roads, roadMaterial);
const nightLights = createNightLights(scene, car.group);
const carFx = createCarFx(scene, car);
carFx.attach(car.info);
const postfx = createPostFX(renderer, scene, camera);
createMissions(scene);
createMinimap(document.getElementById('minimap'));
car.group.rotation.order = 'YXZ';

onNightChange((n) => {
  headlightMat.color.setRGB(1.6 + n * 3, 1.6 + n * 3, 1.5 + n * 2.6);
  taillightMat.color.setRGB(0.9 + n * 2, 0.04, 0.03);
  postfx.setNight(n);
});

// Dynamic resolution: drop the render scale while FPS stays low, recover when there is headroom.
let renderScale = 1;
function adaptResolution(fps) {
  const next = fps < 50 ? Math.max(0.6, renderScale - 0.1) : fps > 58 ? Math.min(1, renderScale + 0.05) : renderScale;
  if (Math.abs(next - renderScale) > 0.001) {
    renderScale = next;
    resize();
  }
}

function resize() {
  const pr = Math.min(devicePixelRatio, tier().pixelRatio) * renderScale;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(pr);
  renderer.setSize(innerWidth, innerHeight);
  postfx.setSize(innerWidth, innerHeight, pr);
  carFx.setScale((innerHeight * pr) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))));
}

function applyQuality(t) {
  nightLights.configure(t);
  applyShading(scene, settings.quality === 'low');
  setLowShading(settings.quality === 'low');
  setShadows(t.shadows, t.shadowSize);
  setAnisotropy(t.anisotropy);
  setWaterQuality(t);
  setPropDensity(t);
  setTrafficDensity(t);
  setRainQuality(t);
  carFx.setDensity(t.particles);
  postfx.configure(t);
  setQualityLabel(settings.quality);
  setQualityButtons(settings.quality);
  resize();
}
onQualityChange(applyQuality);
applyQuality(tier());

let camMode = 0;
const cycleCamera = () => (camMode = (camMode + 1) % 3);

let paused = false;
function togglePause() {
  paused = !paused;
  setPaused(paused);
  if (paused) {
    setStats([
      ['💰 Tiền', formatMoney(save.money)],
      ['⭐ Điểm', save.score],
      ['📦 Đơn đã giao', save.deliveries],
      ['🚕 Khách đã chở', save.passengers],
      ['🏁 Kỷ lục đua', save.bestRace ? save.bestRace.toFixed(1) + ' s' : '—'],
      ['🏮 Đèn lồng bí ẩn', `${save.found.length}/${LANTERN_COUNT}`],
    ]);
  }
}

addEventListener('pointerdown', startAudio, { capture: true });
initInput((code) => {
  startAudio();
  if (code === 'Escape' || code === 'KeyP') togglePause();
  if (paused) return;
  if (code === 'Space') toggleFly();
  if (code === 'KeyN') startNextMission(player);
  if (code === 'KeyC') cycleCamera();
  if (code === 'KeyR') nextWeather();
  if (code === 'KeyT') skipTime();
  if (code === 'KeyM') toggleMute();
});
onMuteChange(setMuteLabel);
bindButtons({
  onFly: toggleFly,
  onWeather: nextWeather,
  onCamera: cycleCamera,
  onTime: () => skipTime(),
  onQuality: setQuality,
  onMute: toggleMute,
  onCar: (id) => {
    player.carId = id;
    car.setModel(id);
    carFx.attach(car.info);
    applyShading(car.group);
  },
  onReset: () => {
    resetPlayer();
    if (paused) togglePause();
  },
  onMission: () => startNextMission(player),
  onPause: togglePause,
  onCancel: () => {
    cancelMission();
    if (paused) togglePause();
  },
});

const clock = new THREE.Clock();
const camTarget = new THREE.Vector3(), desired = new THREE.Vector3(), look = new THREE.Vector3(), carVelocity = new THREE.Vector3();

function updateCamera(dt, shakeOffset) {
  const { pos, heading, altitude } = player;
  if (camMode === 0) desired.set(Math.sin(heading) * 13, 5.5 + altitude, Math.cos(heading) * 13);
  else if (camMode === 1) desired.set(Math.sin(heading) * 0.4, 1.7 + altitude, Math.cos(heading) * 0.4);
  else desired.set(0, 65 + altitude, 30);
  desired.x += pos.x;
  desired.z += pos.z;
  camera.position.lerp(desired, camMode === 1 ? 1 : Math.min(1, dt * (5 + Math.abs(player.speed) * 0.12)));
  camTarget.set(pos.x, altitude + 1.4, pos.z);
  if (camMode === 1) camTarget.add(look.set(-Math.sin(heading) * 30, 0, -Math.cos(heading) * 30));
  camera.lookAt(camTarget);
  camera.position.add(shakeOffset);
}

const NO_INPUT = { accel: false, brake: false, turn: 0, boost: false, up: false, down: false };
let frames = 0, fpsTime = 0, adaptTime = 0, adaptFrames = 0, honkTimer = 4, simTime = 0, wasCharging = false;
function loop() {
  requestAnimationFrame(loop);
  const raw = clock.getDelta();
  if (paused) {
    postfx.render();
    return;
  }
  const dt = Math.min(raw, 0.045);
  const t = (simTime += dt);
  const input = player.energy > 0 ? axis() : { ...axis(), boost: false };
  const model = models[player.carId];

  const inFlood = isInFlood(player.pos, player.altitude);
  const { hit, landed } = updatePlayer(dt, input, { inFlood, wet: weather.mix.wet });
  if (hit) {
    const k = Math.min(1, hit.strength / 18);
    thump(0.3 + k);
    shake.add(0.15 + k * 0.6);
    for (let i = 0; i < 6 + k * 18; i++) {
      carFx.spray.spawn(hit.point, carVelocity.set((Math.random() - 0.5) * 9, 2 + Math.random() * 5, (Math.random() - 0.5) * 9), { life: 0.45, size0: 0.18, size1: 0.05, alpha: 1, color: [3, 1.6, 0.4], gravity: 16, drag: 0.4 });
    }
    if (hit.strength > 10) setToast('💥 Va chạm! Lái cẩn thận nhé.');
  }
  if (landed > 9) thump(Math.min(1, landed / 20));
  carVelocity.copy(player.vel);
  car.group.position.set(player.pos.x, player.altitude, player.pos.z);
  car.group.rotation.set(player.pitch + (player.flying ? Math.sin(t * 2) * 0.02 : 0), player.heading, player.roll);
  animateWheels(car, player.speed, input.turn, dt);
  updateTraffic(dt, t, isStorm() ? 0.6 : 1, player);
  updateMissions(dt, t, player);
  if (missions.charging && !wasCharging) setToast('⚡ Đang sạc tại trạm VinFast…');
  if (!missions.charging && wasCharging) setToast(player.energy >= 99.5 ? '🔋 Đã sạc đầy!' : 'Ngừng sạc.');
  wasCharging = missions.charging;

  const continuousShake = carFx.update(dt, t, {
    speed: player.speed, heading: player.heading, altitude: player.altitude - player.ground, flying: player.flying,
    boost: input.boost, accel: input.accel, inFlood, wet: weather.mix.wet, maxSpeed: model.max * 1.6, drift: player.drift,
  });
  updateCamera(dt, shake.update(dt, continuousShake, t));
  updateWeather(dt, camera, carVelocity, sky.daylight);
  updateSky(dt, camera, car.group.position, weather.mix);
  nightLights.update(dt, car.group.position, sky.night, weather.mix.wet, weather.mix.cloud);
  updateWorld(dt);
  syncTwins();

  updateAudio({
    speed: player.speed, maxSpeed: model.max * 1.6, throttle: input.accel ? 1 : 0, electric: model.electric,
    flying: player.flying, boost: input.boost && Math.abs(player.speed) > 4, rainAmount: weather.mix.rain, horn: !!keys.KeyH,
  });
  honkTimer -= dt;
  if (honkTimer <= 0) {
    honkTimer = 2.5 + Math.random() * 5;
    const h = pickHonk(car.group.position, player.heading);
    if (h) distantHorn(h.pan, h.volume);
  }

  const objective = missions.objective;
  updateMissionHud(missions.active, objective, objective && bearingTo(player, objective.pos.x, objective.pos.z), player.altitude);
  updateMinimap(player, objective);
  updateProgress({ energy: player.energy, money: formatMoney(save.money), score: save.score });
  updateHud({
    speed: player.vel.length(),
    altitude: player.altitude,
    place: placeName(player.pos),
    clock: clockLabel(),
    trafficLabel: isStorm() ? 'Ùn tắc / Ngập' : Math.sin(t * 0.04) > 0 ? 'Đông xe' : 'Bình thường',
  });
  postfx.render();

  frames++;
  fpsTime += raw;
  adaptFrames++;
  adaptTime += raw;
  if (adaptTime >= 2) {
    adaptResolution(adaptFrames / adaptTime);
    adaptFrames = adaptTime = 0;
  }
  if (fpsTime >= 0.5) {
    window.__fps = frames / fpsTime;
    setFps(window.__fps);
    frames = 0;
    fpsTime = 0;
  }
}
loop();
window.__game = { scene, renderer, camera, THREE, player, weather, forceLightning, missions, save, startNextMission: () => startNextMission(player), get renderScale() { return renderScale; } };

addEventListener('resize', resize);
