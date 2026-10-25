import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';

export function createPostFX(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.45, 0.5, 1.0);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const smaa = new SMAAPass(innerWidth, innerHeight);
  composer.addPass(smaa);
  const vignette = new ShaderPass(VignetteShader);
  vignette.uniforms.offset.value = 1.05;
  vignette.uniforms.darkness.value = 1.1;
  composer.addPass(vignette);

  let enabled = true;
  return {
    bloom,
    configure(t) {
      enabled = t.post;
      smaa.enabled = t.smaa;
    },
    setNight(n) {
      bloom.strength = 0.3 + n * 0.25;
      bloom.threshold = 1.0 - n * 0.1;
    },
    setSize(w, h, pixelRatio) {
      composer.setPixelRatio(pixelRatio);
      composer.setSize(w, h);
    },
    render() {
      if (enabled) composer.render();
      else renderer.render(scene, camera);
    },
  };
}
