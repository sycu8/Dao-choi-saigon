import * as THREE from 'three';
import { Particles, createJets, shake } from './effects.js';
import { splash } from './audio.js';

const v = new THREE.Vector3(), p = new THREE.Vector3(), side = new THREE.Vector3(), back = new THREE.Vector3();
const SMOKE = [0.72, 0.74, 0.78], VAPOR = [0.85, 0.9, 1], SPRAY = [0.78, 0.86, 0.92];

export function createCarFx(scene, car) {
  const smoke = new Particles(scene, 260);
  const trail = new THREE.Vector3();
  const spray = new Particles(scene, 320);
  const jets = createJets(car.tumble || car.group);
  const nozzles = [];
  let wasInFlood = false, wasFlying = false, lastAltitude = 0, share = 1, emitDebt = 0;

  return {
    smoke,
    spray,
    attach(info) {
      jets.attach(info.thrusters);
    },
    setScale(px) {
      smoke.material.uniforms.scale.value = px;
      spray.material.uniforms.scale.value = px;
    },
    setDensity(s) {
      share = s;
    },
    // Returns the continuous camera-shake amplitude for this frame.
    update(dt, t, { speed, heading, altitude, flying, boost, accel, inFlood, wet, maxSpeed, drift = 0 }) {
      const s = Math.min(1, Math.abs(speed) / maxSpeed);
      const boosting = boost && Math.abs(speed) > 4;
      const power = flying ? 0.45 + (boosting ? 0.55 : 0) + (accel ? 0.15 : 0) : boosting ? 0.85 : 0;
      jets.update(power, t);

      side.set(Math.cos(heading), 0, -Math.sin(heading));
      back.set(Math.sin(heading), 0, Math.cos(heading));

      emitDebt += dt * 60 * share;
      const emits = Math.floor(emitDebt);
      emitDebt -= emits;
      if (power > 0.02) {
        jets.worldPositions(nozzles);
        for (let e = 0; e < emits; e++) {
          for (const n of nozzles) {
            v.copy(back).multiplyScalar(4 + power * 6).add(p.set((Math.random() - 0.5) * 1.5, Math.random() * 1.2, (Math.random() - 0.5) * 1.5));
            trail.copy(n).addScaledVector(back, Math.abs(speed) * dt * (e / emits));
            smoke.spawn(trail, v, { life: flying ? 1.2 : 0.7, size0: 0.25, size1: flying ? 1.8 : 1.4, alpha: flying ? 0.22 : 0.22, color: flying ? VAPOR : SMOKE, drag: 1.2 });
          }
        }
      }

      const grounded = altitude < 0.5;
      if (grounded && drift > 0.35) {
        const n = Math.floor(drift * 3 * share + Math.random());
        for (let i = 0; i < n; i++) {
          const sx = Math.random() < 0.5 ? -1 : 1;
          p.copy(car.group.position).addScaledVector(side, sx * 1.0).addScaledVector(back, 1.4).setY(car.group.position.y + 0.3);
          v.set((Math.random() - 0.5) * 2, 0.6 + Math.random(), (Math.random() - 0.5) * 2);
          smoke.spawn(p, v, { life: 1.1, size0: 0.4, size1: 2.4, alpha: 0.25, color: SMOKE, drag: 1.5 });
        }
      }
      if (grounded && Math.abs(speed) > 3 && (inFlood || wet > 0.4)) {
        const rate = inFlood ? Math.min(6, 1 + Math.abs(speed) * 0.2) : wet * s * 1.5;
        const n = Math.floor(rate * share + Math.random());
        for (let i = 0; i < n; i++) {
          const sx = Math.random() < 0.5 ? -1 : 1;
          p.copy(car.group.position).addScaledVector(side, sx * 1.15).addScaledVector(back, 1.5 * Math.sign(speed)).setY(car.group.position.y + 0.25);
          v.copy(side).multiplyScalar(sx * (inFlood ? 3 + Math.random() * 4 : 1 + Math.random()))
            .addScaledVector(back, Math.abs(speed) * 0.25)
            .setY(inFlood ? 3 + Math.random() * 4 + s * 3 : 0.8 + Math.random());
          spray.spawn(p, v, { life: inFlood ? 0.9 : 0.5, size0: inFlood ? 0.25 : 0.15, size1: inFlood ? 0.9 : 0.5, alpha: inFlood ? 0.75 : 0.35, color: SPRAY, gravity: 14, drag: 0.6 });
        }
      }
      if (inFlood && !wasInFlood && Math.abs(speed) > 3) {
        splash(Math.min(1, Math.abs(speed) / 20));
        shake.add(0.15);
      }
      wasInFlood = inFlood;

      if (flying && !wasFlying) shake.add(0.25);
      if (!flying && lastAltitude > 1.5 && altitude <= 0.01) shake.add(0.3);
      if (altitude <= 0.01) lastAltitude = 0;
      else lastAltitude = Math.max(lastAltitude, altitude);
      wasFlying = flying;

      smoke.update(dt);
      spray.update(dt);
      return (boosting ? 0.05 * s : 0) + (flying ? 0.015 : 0);
    },
  };
}
