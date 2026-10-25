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
import { startAudio, updateAudio, toggleMute, onMuteChange, distantHorn } from './audio.js';
import { player, toggleFly, resetPlayer, updatePlayer } from './gameplay.js';
import { updateHud, bindButtons, setFps, setQualityLabel, setMuteLabel } from './hud.js';
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
  resize();
}
onQualityChange(applyQuality);
applyQuality(tier());

let camMode = 0;
const cycleCamera = () => (camMode = (camMode + 1) % 3);

addEventListener('pointerdown', startAudio, { capture: true });
initInput((code) => {
  startAudio();
  if (code === 'Space') toggleFly();
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
  onReset: resetPlayer,
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

let frames = 0, fpsTime = 0, adaptTime = 0, adaptFrames = 0, honkTimer = 4;
function loop() {
  requestAnimationFrame(loop);
  const raw = clock.getDelta();
  const dt = Math.min(raw, 0.045), t = clock.elapsedTime;
  const input = axis();
  const model = models[player.carId];

  const inFlood = isInFlood(player.pos, player.altitude);
  updatePlayer(dt, input, inFlood);
  carVelocity.set(-Math.sin(player.heading) * player.speed, 0, -Math.cos(player.heading) * player.speed);
  car.group.position.set(player.pos.x, player.altitude, player.pos.z);
  car.group.rotation.set(player.flying ? Math.sin(t * 2) * 0.025 : 0, player.heading, input.turn * -0.05);
  animateWheels(car, player.speed, input.turn, dt);
  updateTraffic(dt, t, isStorm() ? 0.6 : 1);

  const continuousShake = carFx.update(dt, t, {
    speed: player.speed, heading: player.heading, altitude: player.altitude, flying: player.flying,
    boost: input.boost, accel: input.accel, inFlood, wet: weather.mix.wet, maxSpeed: model.max * 1.6,
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

  updateHud({
    speed: player.speed,
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
window.__game = { scene, renderer, camera, THREE, player, weather, forceLightning, get renderScale() { return renderScale; } };

addEventListener('resize', resize);
