import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const HOURS_PER_SECOND = 0.1; // full day ≈ 4 minutes
const SHADOW_EXTENT = 80;

const fogDay = new THREE.Color('#b9cfdb');
const fogDusk = new THREE.Color('#d8a27c');
const fogNight = new THREE.Color('#0c1422');
const fogOvercast = new THREE.Color('#8e9aa3');
const sunWarm = new THREE.Color('#ffb070');
const sunWhite = new THREE.Color('#fff1dc');
const moonColor = new THREE.Color('#9fb6ff');
const flashColor = new THREE.Color('#dfe6ff');

const startHour = parseFloat(new URLSearchParams(location.search).get('hour'));

export const sky = {
  hour: Number.isFinite(startHour) ? startHour % 24 : 15.5,
  sunDir: new THREE.Vector3(),
  night: 0, // 0 = full day, 1 = full night
  daylight: 1,
  fogColor: new THREE.Color(),
};

const zenithDay = new THREE.Color('#4f8fd0');
const zenithNight = new THREE.Color('#03070f');
let lowShading = false;

const nightHooks = [];
export const onNightChange = (fn) => nightHooks.push(fn);

let scene, renderer, skyMesh, dome, stars, sun, hemi;
const tmp = new THREE.Color();

export function createSky(targetScene, targetRenderer) {
  scene = targetScene;
  renderer = targetRenderer;

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  pmrem.dispose();

  skyMesh = new Sky();
  skyMesh.scale.setScalar(1000);
  const u = skyMesh.material.uniforms;
  u.turbidity.value = 6;
  u.rayleigh.value = 1.4;
  u.mieCoefficient.value = 0.005;
  u.mieDirectionalG.value = 0.82;
  skyMesh.renderOrder = 1000; // after opaque geometry, so only visible sky pixels run the scattering shader
  scene.add(skyMesh);

  // Haze/overcast shell: blends the analytic sky into the fog colour at the horizon and greys it out in bad weather.
  dome = new THREE.Mesh(
    new THREE.SphereGeometry(900, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      uniforms: { color: { value: new THREE.Color() }, cloud: { value: 0 }, solid: { value: 0 }, zenith: { value: new THREE.Color() }, sunDir: { value: sky.sunDir } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 color; uniform vec3 zenith; uniform vec3 sunDir; uniform float cloud; uniform float solid; varying vec3 vDir;
        void main(){ float horizon = 1.0 - smoothstep(-0.02, 0.14, vDir.y);
          float alpha = clamp(max(cloud, horizon * 0.88), 0.0, 1.0);
          vec3 c = color;
          if (solid > 0.5) {
            // Cheap gradient sky for low quality instead of the scattering shader.
            vec3 top = mix(zenith, color, cloud);
            float sunGlow = pow(max(dot(vDir, normalize(sunDir)), 0.0), 64.0) * (1.0 - cloud);
            c = mix(top, color, alpha) + vec3(1.0, 0.85, 0.6) * sunGlow * 2.0;
            alpha = 1.0;
          }
          gl_FragColor = vec4(c, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    })
  );
  dome.renderOrder = -1;
  scene.add(dome);

  const starPos = [];
  for (let i = 0; i < 900; i++) {
    const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.08, Math.random() - 0.5).normalize().multiplyScalar(850);
    starPos.push(v.x, v.y, v.z);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#dfe8ff', size: 2.2, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false }));
  stars.renderOrder = -2;
  scene.add(stars);

  hemi = new THREE.HemisphereLight(0xdcefff, 0x5b6460, 1);
  scene.add(hemi);
  sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -SHADOW_EXTENT;
  sun.shadow.camera.right = sun.shadow.camera.top = SHADOW_EXTENT;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 700;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.06;
  scene.add(sun, sun.target);

  scene.fog = new THREE.Fog(fogDay, 120, 780);
  return { sun };
}

export function setShadows(enabled, mapSize) {
  renderer.shadowMap.enabled = enabled;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  sun.castShadow = enabled;
  if (enabled && sun.shadow.mapSize.x !== mapSize) {
    sun.shadow.mapSize.set(mapSize, mapSize);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
  }
  scene.traverse((o) => {
    if (o.material) [].concat(o.material).forEach((m) => (m.needsUpdate = true));
  });
}

export function setLowShading(on) {
  lowShading = on;
  skyMesh.visible = !on;
  dome.material.uniforms.solid.value = on ? 1 : 0;
  dome.material.transparent = !on;
  dome.material.needsUpdate = true;
}

// The Sky shader outputs unclamped HDR values that saturate in 8-bit mirror targets; reflections use the gradient dome instead.
export function setMirrorPass(on) {
  skyMesh.visible = !on && !lowShading;
  dome.material.uniforms.solid.value = on || lowShading ? 1 : 0;
}

export const skipTime = (hours = 6) => (sky.hour = (sky.hour + hours) % 24);
export const clockLabel = () => {
  const h = Math.floor(sky.hour), m = Math.floor((sky.hour - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

// weatherMix: { cloud: 0..1, fogFar }
export function updateSky(dt, camera, focus, weatherMix) {
  sky.hour = (sky.hour + dt * HOURS_PER_SECOND) % 24;
  const a = ((sky.hour - 6) / 24) * Math.PI * 2;
  sky.sunDir.set(Math.cos(a) * 0.85, Math.sin(a), 0.42).normalize();
  const sunY = sky.sunDir.y;
  const cloud = weatherMix.cloud;

  sky.daylight = THREE.MathUtils.smoothstep(sunY, -0.08, 0.3);
  const night = 1 - THREE.MathUtils.smoothstep(sunY, -0.12, 0.04);
  if (Math.abs(night - sky.night) > 0.002 || night === 0 || night === 1) {
    sky.night = night;
    nightHooks.forEach((fn) => fn(night));
  }

  skyMesh.position.copy(camera.position);
  dome.position.copy(camera.position);
  stars.position.copy(camera.position);
  skyMesh.material.uniforms.sunPosition.value.copy(sky.sunDir);
  skyMesh.material.uniforms.turbidity.value = 6 + cloud * 12;
  stars.material.opacity = night * (1 - cloud);
  stars.visible = stars.material.opacity > 0.02;

  const dusk = THREE.MathUtils.smoothstep(sunY, -0.1, 0.05) * (1 - THREE.MathUtils.smoothstep(sunY, 0.05, 0.3));
  const fog = sky.fogColor.copy(fogNight).lerp(fogDay, sky.daylight).lerp(fogDusk, dusk * 0.7);
  tmp.copy(fogOvercast).multiplyScalar(0.12 + 0.88 * sky.daylight);
  fog.lerp(tmp, cloud * 0.85);
  if (weatherMix.flash) fog.lerp(flashColor, weatherMix.flash * 0.45);
  scene.fog.color.copy(fog);
  scene.fog.far = weatherMix.fogFar;
  scene.fog.near = Math.min(120, weatherMix.fogFar * 0.15);
  dome.material.uniforms.color.value.copy(fog);
  dome.material.uniforms.cloud.value = cloud * 0.97;
  dome.material.uniforms.zenith.value.copy(zenithNight).lerp(zenithDay, sky.daylight);
  renderer.setClearColor(fog);

  const lightDir = sunY > -0.06 ? sky.sunDir : tmpDir.copy(sky.sunDir).negate();
  sun.position.copy(focus).addScaledVector(lightDir, 300);
  sun.target.position.copy(focus);
  if (sunY > -0.06) {
    sun.color.copy(sunWarm).lerp(sunWhite, THREE.MathUtils.smoothstep(sunY, 0.02, 0.35));
    sun.intensity = 3.8 * THREE.MathUtils.smoothstep(sunY, -0.06, 0.12) * (1 - cloud * 0.75);
  } else {
    sun.color.copy(moonColor);
    sun.intensity = 0.32 * THREE.MathUtils.smoothstep(-sunY, 0.06, 0.25) * (1 - cloud * 0.6);
  }
  hemi.intensity = (0.18 + 0.62 * sky.daylight) * (1 - cloud * 0.3) * (lowShading ? 1.7 : 1);
  hemi.color.copy(fog).lerp(tmp.set(0xdcefff), 0.5);
  hemi.intensity += (weatherMix.flash || 0) * 2.5;
  scene.environmentIntensity = (0.1 + 0.38 * sky.daylight) * (1 - cloud * 0.35);
  renderer.toneMappingExposure = 0.68 + night * 0.2;
}
const tmpDir = new THREE.Vector3();
