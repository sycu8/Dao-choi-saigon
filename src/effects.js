import * as THREE from 'three';

const RAIN_BOX = new THREE.Vector3(90, 60, 90);
const MAX_DROPS = 9000;

// GPU rain: every drop is an instanced quad animated and wrapped around the camera in the vertex shader,
// stretched along (fall velocity - car velocity) so it slants with speed.
export function createRain(scene) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const offsets = new Float32Array(MAX_DROPS * 4);
  for (let i = 0; i < MAX_DROPS; i++) {
    offsets[i * 4] = Math.random() * RAIN_BOX.x;
    offsets[i * 4 + 1] = Math.random() * RAIN_BOX.y;
    offsets[i * 4 + 2] = Math.random() * RAIN_BOX.z;
    offsets[i * 4 + 3] = Math.random();
  }
  geo.setAttribute('drop', new THREE.InstancedBufferAttribute(offsets, 4));
  geo.instanceCount = 0;

  const uniforms = {
    time: { value: 0 },
    camPos: { value: new THREE.Vector3() },
    carVel: { value: new THREE.Vector3() },
    box: { value: RAIN_BOX },
    color: { value: new THREE.Color('#c9dcee') },
    opacity: { value: 0.55 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `
      attribute vec4 drop;
      uniform float time; uniform vec3 camPos; uniform vec3 carVel; uniform vec3 box;
      varying float vAlpha;
      void main() {
        float speed = 26.0 + drop.w * 10.0;
        vec3 p = drop.xyz;
        p.y -= time * speed;
        vec3 origin = camPos - box * 0.5;
        vec3 w = origin + mod(p - origin, box);
        vec3 vel = vec3(1.5, -speed, 0.8) - carVel;
        vec3 dir = normalize(vel);
        float len = clamp(length(vel) * 0.045, 0.7, 3.2);
        vec4 vh = viewMatrix * vec4(w, 1.0);
        vec4 vt = viewMatrix * vec4(w - dir * len, 1.0);
        vec4 v = mix(vh, vt, position.y);
        vec2 d = vt.xy - vh.xy;
        vec2 side = length(d) > 1e-4 ? normalize(vec2(-d.y, d.x)) : vec2(1.0, 0.0);
        v.xy += side * position.x * 0.045;
        gl_Position = projectionMatrix * v;
        float dist = length(w - camPos);
        vAlpha = (1.0 - position.y) * (1.0 - smoothstep(8.0, 45.0, dist)) * step(0.0, w.y);
      }`,
    fragmentShader: `
      uniform vec3 color; uniform float opacity; varying float vAlpha;
      void main() { gl_FragColor = vec4(color, opacity * vAlpha);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  scene.add(mesh);

  let maxDrops = MAX_DROPS;
  return {
    setMaxDrops(n) {
      maxDrops = Math.min(MAX_DROPS, n);
    },
    // amount 0..1, light 0..1 (daylight + flashes)
    update(dt, camera, carVelocity, amount, light) {
      uniforms.time.value += dt;
      uniforms.camPos.value.copy(camera.position);
      uniforms.carVel.value.copy(carVelocity);
      uniforms.color.value.setRGB(0.79, 0.86, 0.93).multiplyScalar(0.6 + 0.6 * light);
      geo.instanceCount = Math.floor(maxDrops * amount);
      mesh.visible = geo.instanceCount > 0;
    },
  };
}

// Soft round point particles with per-particle size, alpha and colour (smoke, spray, sparks).
export class Particles {
  constructor(scene, max, { additive = false } = {}) {
    this.max = max;
    this.items = [];
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.col = new Float32Array(max * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      uniforms: { scale: { value: 400 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `
        attribute float size; attribute float alpha; attribute vec3 color;
        uniform float scale; varying float vAlpha; varying vec3 vColor;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; vAlpha = alpha; vColor = color; }`,
      fragmentShader: `
        varying float vAlpha; varying vec3 vColor;
        void main() { float d = length(gl_PointCoord - 0.5); float a = (1.0 - smoothstep(0.1, 0.5, d)) * vAlpha;
          if (a < 0.01) discard; gl_FragColor = vec4(vColor, a);
          #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(this.geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    scene.add(this.points);
  }

  spawn(p, v, { life = 1, size0 = 0.5, size1 = 2, alpha = 0.6, color = [1, 1, 1], gravity = 0, drag = 0.5 } = {}) {
    if (this.items.length >= this.max) this.items.shift();
    this.items.push({ p: p.clone(), v: v.clone(), age: 0, life, size0, size1, alpha, color, gravity, drag });
  }

  update(dt) {
    let n = 0;
    this.items = this.items.filter((it) => (it.age += dt) < it.life);
    for (const it of this.items) {
      it.v.y -= it.gravity * dt;
      it.v.multiplyScalar(Math.max(0, 1 - it.drag * dt));
      it.p.addScaledVector(it.v, dt);
      if (it.gravity && it.p.y < 0.05) it.age = it.life;
      const k = it.age / it.life;
      it.p.toArray(this.pos, n * 3);
      this.size[n] = it.size0 + (it.size1 - it.size0) * k;
      this.alpha[n] = it.alpha * (1 - k) * Math.min(1, it.age * 12);
      this.col.set(it.color, n * 3);
      n++;
    }
    this.geo.setDrawRange(0, n);
    for (const a of Object.values(this.geo.attributes)) a.needsUpdate = true;
  }
}

// Additive jet flames attached to the car's thruster positions.
export function createJets(carGroup) {
  const geo = new THREE.ConeGeometry(0.2, 1.6, 12, 1, true).rotateX(-Math.PI / 2).translate(0, 0, 0.8);
  const uniforms = { flicker: { value: 1 } };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: 'varying float vT; void main(){ vT = clamp(position.z / 1.6, 0.0, 1.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float flicker; varying float vT;
      void main(){ vec3 core = vec3(0.7, 0.9, 1.6) * 2.5; vec3 tail = vec3(1.6, 0.55, 0.15);
        vec3 c = mix(core, tail, smoothstep(0.0, 0.7, vT)); float a = (1.0 - vT) * flicker;
        gl_FragColor = vec4(c * a, a); }`,
  });
  const group = new THREE.Group();
  carGroup.add(group);
  let flames = [];
  return {
    attach(thrusters) {
      group.clear();
      flames = thrusters.map((p) => {
        const outer = new THREE.Mesh(geo, material);
        const inner = new THREE.Mesh(geo, material);
        inner.scale.set(0.5, 0.5, 0.7);
        outer.add(inner);
        outer.position.copy(p);
        group.add(outer);
        return outer;
      });
    },
    worldPositions(out = []) {
      flames.forEach((f, i) => (out[i] = f.getWorldPosition(out[i] || new THREE.Vector3())));
      out.length = flames.length;
      return out;
    },
    update(power, t) {
      group.visible = power > 0.02;
      uniforms.flicker.value = 0.75 + Math.sin(t * 60) * 0.12 + Math.random() * 0.13;
      for (const f of flames) f.scale.set(0.8 + power * 0.4, 0.8 + power * 0.4, 0.3 + power * (1.1 + Math.random() * 0.3));
    },
  };
}

export function createLightning(scene) {
  const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 5, 7), transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.renderOrder = 5;
  scene.add(mesh);
  let life = 0;

  function ribbon(points, width, side, out) {
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const w = width * (1 - i / points.length) + 1.2;
      const quad = [a.clone().addScaledVector(side, -w), a.clone().addScaledVector(side, w), b.clone().addScaledVector(side, w), b.clone().addScaledVector(side, -w)];
      for (const k of [0, 1, 2, 0, 2, 3]) out.push(quad[k].x, quad[k].y, quad[k].z);
    }
  }

  return {
    strike(camera) {
      const fwd = camera.getWorldDirection(new THREE.Vector3());
      const angle = Math.atan2(fwd.z, fwd.x) + (Math.random() - 0.5) * 1.6, dist = 180 + Math.random() * 350;
      const base = new THREE.Vector3(camera.position.x + Math.cos(angle) * dist, 0, camera.position.z + Math.sin(angle) * dist);
      const side = new THREE.Vector3().subVectors(base, camera.position).setY(0).normalize();
      side.set(-side.z, 0, side.x);
      const pts = [], verts = [];
      let p = base.clone().setY(420);
      while (p.y > 0) {
        pts.push(p.clone());
        p = p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 30, -18 - Math.random() * 22, (Math.random() - 0.5) * 30));
      }
      pts.push(p.setY(0));
      ribbon(pts, 6, side, verts);
      for (let b = 0; b < 3; b++) {
        const start = pts[1 + Math.floor(Math.random() * (pts.length - 3))];
        const branch = [start.clone()];
        let q = start.clone();
        for (let k = 0; k < 4; k++) branch.push((q = q.clone().add(new THREE.Vector3((Math.random() - 0.5) * 40, -15 - Math.random() * 15, (Math.random() - 0.5) * 40))));
        ribbon(branch, 2.5, side, verts);
      }
      mesh.geometry.dispose();
      mesh.geometry = new THREE.BufferGeometry();
      mesh.geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      life = 0.5;
      return dist;
    },
    // Returns current flash strength 0..1.
    update(dt) {
      life = Math.max(0, life - dt);
      const on = life > 0 && (life > 0.3 || (life > 0.12 && life < 0.22));
      mesh.visible = on;
      material.opacity = on ? 1 : 0;
      return life > 0 ? (on ? 1 : 0.35) : 0;
    },
  };
}

// Decaying camera shake; add() takes an impulse strength in metres.
export const shake = {
  amount: 0,
  offset: new THREE.Vector3(),
  add(v) {
    this.amount = Math.min(1.2, this.amount + v);
  },
  update(dt, continuous = 0, t = 0) {
    this.amount = Math.max(0, this.amount - dt * 1.8);
    const a = this.amount + continuous;
    this.offset.set(Math.sin(t * 47) * a * 0.3, Math.sin(t * 61 + 1) * a * 0.25, Math.sin(t * 53 + 2) * a * 0.3);
    return this.offset;
  },
};
