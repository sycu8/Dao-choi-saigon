import * as THREE from 'three';

// Low quality swaps every PBR material for a Lambert twin: far cheaper per pixel on weak GPUs.
const twins = new Map();
let lambert = false;

function twinOf(std) {
  let t = twins.get(std);
  if (t) return t;
  t = new THREE.MeshLambertMaterial({
    color: std.color, map: std.map, emissive: std.emissive, emissiveMap: std.emissiveMap, emissiveIntensity: std.emissiveIntensity,
    vertexColors: std.vertexColors, transparent: std.transparent, opacity: std.opacity, side: std.side, flatShading: std.flatShading,
  });
  if (std.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey) {
    t.onBeforeCompile = std.onBeforeCompile;
    t.customProgramCacheKey = () => 'lambert-' + std.customProgramCacheKey();
  }
  twins.set(std, t);
  return t;
}

export function applyShading(root, useLambert = lambert) {
  lambert = useLambert;
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (lambert && o.material?.isMeshStandardMaterial) {
      o.userData.pbr = o.material;
      o.material = twinOf(o.material);
    } else if (!lambert && o.userData.pbr) {
      o.material = o.userData.pbr;
      delete o.userData.pbr;
    }
  });
}

export function syncTwins() {
  if (!lambert) return;
  for (const [std, t] of twins) {
    t.emissiveIntensity = std.emissiveIntensity;
    t.color.copy(std.color);
    t.opacity = std.opacity;
    t.visible = std.visible;
  }
}
