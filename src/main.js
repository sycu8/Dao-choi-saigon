import * as THREE from 'three';
import { buildWorld, roads, placeName } from './world.js';
import { createPlayerCar } from './vehicles.js';
import { createTraffic, updateTraffic } from './traffic.js';
import { createWeather, updateWeather, nextWeather, isInFlood, isStorm } from './weather.js';
import { player, toggleFly, resetPlayer, updatePlayer } from './gameplay.js';
import { updateHud, bindButtons } from './hud.js';
import { initInput, axis } from './input.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color('#9ec9e1');
scene.fog = new THREE.Fog('#9ec9e1', 150, 780);
const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 1500);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
document.body.prepend(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xe7f4ff, 0x596b78, 2.4));
const sun = new THREE.DirectionalLight(0xffefcf, 2.2);
sun.position.set(80, 160, 100);
scene.add(sun);

buildWorld(scene);
createTraffic(scene, roads);
const car = createPlayerCar(scene);
createWeather(scene, roads);

let camMode = 0;
const cycleCamera = () => (camMode = (camMode + 1) % 3);

initInput((code) => {
  if (code === 'Space') toggleFly();
  if (code === 'KeyC') cycleCamera();
  if (code === 'KeyR') nextWeather();
});
bindButtons({
  onFly: toggleFly,
  onWeather: nextWeather,
  onCamera: cycleCamera,
  onCar: (id) => {
    player.carId = id;
    car.setModel(id);
  },
  onReset: resetPlayer,
});

const clock = new THREE.Clock();
const camTarget = new THREE.Vector3(), desired = new THREE.Vector3();

function updateCamera(dt) {
  const { pos, heading, altitude } = player;
  if (camMode === 0) desired.set(Math.sin(heading) * 14, 7 + altitude, Math.cos(heading) * 14);
  else if (camMode === 1) desired.set(Math.sin(heading) * 0.5, 2 + altitude, -Math.cos(heading) * 0.5);
  else desired.set(0, 65 + altitude, 30);
  desired.x += pos.x;
  desired.z += pos.z;
  camera.position.lerp(desired, Math.min(1, dt * 5));
  camTarget.set(pos.x, altitude + 1, pos.z);
  if (camMode === 1) camTarget.add(new THREE.Vector3(-Math.sin(heading) * 30, 0, -Math.cos(heading) * 30));
  camera.lookAt(camTarget);
}

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.045), t = clock.elapsedTime;
  const input = axis();

  updatePlayer(dt, input, isInFlood(player.pos, player.altitude));
  car.group.position.set(player.pos.x, player.altitude, player.pos.z);
  car.group.rotation.set(player.flying ? Math.sin(t * 2) * 0.025 : 0, player.heading, input.turn * -0.05);
  updateTraffic(dt, t, isStorm() ? 0.6 : 1);
  updateCamera(dt);
  updateWeather(dt, player.pos.x, player.altitude, player.pos.z);

  updateHud({
    speed: player.speed,
    altitude: player.altitude,
    place: placeName(player.pos),
    trafficLabel: isStorm() ? 'Ùn tắc / Ngập' : Math.sin(t * 0.04) > 0 ? 'Đông xe' : 'Bình thường',
  });
  renderer.render(scene, camera);
}
loop();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
