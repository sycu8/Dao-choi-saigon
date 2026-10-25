# Xe Bay Sài Gòn — playable prototype

Single-player lightweight 3D free-roam game.

## Development

Source lives in `src/` as ES modules (`main.js`, `world.js`, `vehicles.js`, `traffic.js`, `weather.js`, `effects.js`, `gameplay.js`, `hud.js`, `input.js`). `index.html` holds the markup/CSS and an import map that points `three` at `node_modules`, so after `npm install` you can serve the repo root directly (`python3 -m http.server 8080`) without building. `npm run build` bundles `src/main.js` with esbuild into `public/game.js` and writes `public/index.html`.

Features: 3 selectable stylized vehicles, all flyable; procedural buildings, stylized recognizable landmarks; animated cars and motorbikes; randomized weather (every 75 seconds); localized flooded streets with slowdown; keyboard and touch controls; multiple cameras.

Limitations: stylized procedural approximation, **not** geographically accurate OpenStreetMap geometry or licensed branded car 3D meshes. AI traffic is ambient and does not yet react to traffic lights, collisions, or jams. No live website deployment is included. Next phase: real OSM road/footprint ingestion, intersection AI, signals, water physics and optimized branded vehicle assets.

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
