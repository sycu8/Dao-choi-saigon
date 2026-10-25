import * as THREE from 'three';
import { models } from './vehicles.js';
import { WORLD_LIMIT } from './world.js';
import { setFlyLabel } from './hud.js';

export const player = {
  pos: new THREE.Vector3(0, 0, 40),
  heading: 0,
  speed: 0,
  altitude: 0,
  flying: false,
  carId: 0,
};

export function toggleFly() {
  player.flying = !player.flying;
  setFlyLabel(player.flying);
}

export function resetPlayer() {
  player.pos.set(0, 0, 40);
  player.speed = 0;
  player.altitude = 0;
  player.heading = 0;
  player.flying = false;
  setFlyLabel(false);
}

export function updatePlayer(dt, input, inFlood) {
  const p = player;
  const max = models[p.carId].max * (input.boost ? 1.6 : 1);
  p.speed += (input.accel ? 23 : input.brake ? -32 : -Math.sign(p.speed) * 10) * dt;
  p.speed = THREE.MathUtils.clamp(p.speed, -12, max);
  if (!input.accel && !input.brake && Math.abs(p.speed) < 0.4) p.speed = 0;
  if (inFlood) p.speed *= 1 - dt * 1.6;
  p.heading += input.turn * dt * (0.7 + Math.abs(p.speed) * 0.02) * (p.speed < 0 ? -1 : 1);

  if (p.flying) {
    p.altitude += ((input.up ? 18 : 0) - (input.down ? 18 : 0)) * dt;
    if (!input.up && !input.down) p.altitude = Math.max(p.altitude, 8);
    p.altitude = THREE.MathUtils.clamp(p.altitude, 4, 190);
  } else {
    p.altitude = Math.max(0, p.altitude - dt * 17);
  }

  p.pos.x -= Math.sin(p.heading) * p.speed * dt;
  p.pos.z -= Math.cos(p.heading) * p.speed * dt;
  p.pos.x = THREE.MathUtils.clamp(p.pos.x, -WORLD_LIMIT, WORLD_LIMIT);
  p.pos.z = THREE.MathUtils.clamp(p.pos.z, -WORLD_LIMIT, WORLD_LIMIT);
}
