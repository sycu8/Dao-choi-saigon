# Xe Bay Sài Gòn — playable prototype

Single-player lightweight 3D free-roam game.

## Development

Source lives in `src/` as ES modules (`main.js`, `world.js`, `vehicles.js`, `traffic.js`, `weather.js`, `effects.js`, `gameplay.js`, `hud.js`, `input.js`). `index.html` holds the markup/CSS and an import map that points `three` at `node_modules`, so after `npm install` you can serve the repo root directly (`python3 -m http.server 8080`) without building. `npm run build` bundles `src/main.js` with esbuild into `public/game.js` and writes `public/index.html`.

Gameplay modules: `gameplay.js` (inertia/drift/banking physics, AABB collisions, energy), `missions.js` (missions, rooftop lanterns, VinFast charging stations, records in `localStorage`), `minimap.js`. Effects/audio: `effects.js`, `carfx.js`, `lights.js`, `audio.js` (WebAudio synthesis).

Graphics modules: `sky.js` (Sky addon, day/night cycle, sun shadows, fog), `textures.js` (procedural canvas textures), `landmarks.js`, `postfx.js` (bloom, SMAA, vignette), `materials.js` and `settings.js` (quality tiers).

### Quality tiers
- **Thấp (Low)** — default on touch/narrow screens: Lambert shading, gradient sky, no shadows/post-processing, simple river.
- **Trung bình / Cao (Medium / High)** — PBR materials with environment lighting, Sky addon, shadow maps, reflective `Water`, bloom + SMAA + vignette.

All tiers use dynamic resolution (render scale 0.6–1.0) to hold frame rate. URL overrides for testing: `?q=low|medium|high`, `?hour=0-24` and `?weather=0-3`.

Features: 3 selectable stylized vehicles, all flyable; procedural buildings, stylized recognizable landmarks; AI cars and motorbikes that stop at traffic lights and keep their distance; smoothly changing weather with rain, flooding and lightning; day/night cycle; synthesized engine/rain/thunder/horn audio; keyboard and touch controls; multiple cameras.

Gameplay: drive into a coloured beam (or press N / 🎯) to start a delivery, passenger or checkpoint-race mission with a time limit; money, score and the race record are saved in `localStorage`. Flying and boost use energy, recharged at VinFast stations (green rings) or a little by braking in electric cars. 12 hidden lanterns sit on rooftops — you can land on roofs. Esc/P opens the pause menu with quality settings and stats.

Limitations: stylized procedural approximation, **not** geographically accurate OpenStreetMap geometry or licensed branded car 3D meshes. AI traffic drives straight along its road (no turning at intersections). No live website deployment is included.

## Cloudflare Workers Static Assets deployment

This project runs as a static-assets Worker. No separate hosting, server, D1, R2, or KV needed. To deploy:

```bash
npm install
npm run check
npx wrangler login
npm run deploy
```

`npm run dev` runs Wrangler locally. `npm run build` validates and stages `public/index.html`.

### Fully Cloudflare-hosted build
The build bundles Three.js into `public/game.js` using esbuild and rewrites `public/index.html` to load that local script. Run `npm ci` if a lockfile exists, or `npm install` otherwise, then `npm run check` before deploying. The root `index.html` is development source only; Cloudflare serves the compiled files under `public/`.
