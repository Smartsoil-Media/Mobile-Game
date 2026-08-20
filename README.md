# Bramblewick

A tiny, cosy real-time strategy game in the spirit of Age of Empires, built for
phones. Gather wood and gold, raise a barracks, train little swordsmen, and
destroy the enemy town hall before their raiders topple yours.

Everything — world, units, buildings, art — is drawn in code on an HTML5 canvas.
No image assets, no frameworks. The whole game bundles into a single HTML file.

## Controls

- **Tap** a villager or building to select it
- **Tap** a tree/mine to gather, the ground to move, an enemy to attack
- **Drag** to pan the camera, **pinch** to zoom
- **Army** button selects all your soldiers and jumps the camera to them
- **Ring the Bell** (Town Hall) shelters your villagers inside — a garrisoned
  Town Hall shoots arrows at raiders (one per villager, up to 10). Ring again
  to send everyone back to work.

## Development

```bash
npm install
npm run build   # bundles src/ into dist/index.html + dist/artifact.html
npm run shot    # headless playtest + screenshots (PW_EXECUTABLE=/path/to/chromium if needed)
```

- `dist/index.html` — complete single-file game, open in any browser
- `dist/artifact.html` — same game as a body fragment, for publishing as a Claude Artifact

## Code layout

| File | What it does |
| --- | --- |
| `src/data.ts` | Types, unit/building stats, balance numbers |
| `src/world.ts` | Map generation, spawning, shared queries |
| `src/sim.ts` | Fixed-timestep simulation: gathering, combat, construction, enemy raids |
| `src/sprites.ts` | Cosy storybook art, all canvas vector drawing |
| `src/render.ts` | Camera, meadow ground, draw loop |
| `src/input.ts` | Touch input: tap/drag/pinch, command dispatch |
| `src/ui.ts` | DOM HUD: resource pills, command dock, hints, overlays |
| `src/main.ts` | Bootstrap and game loop |
