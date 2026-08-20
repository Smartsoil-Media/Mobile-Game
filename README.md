# Bramblewick

A tiny, cosy real-time strategy game in the spirit of Age of Empires, built for
phones. Gather wood, food, gold and stone; farm, expand with new town halls,
train little swordsmen, and destroy the enemy town hall before their army
topples yours. The enemy village plays by the same rules: same starting
villagers and resources, a real economy, and attacks that grow bolder.

Everything — world, units, buildings, art — is drawn in code on an HTML5 canvas.
No image assets, no frameworks. The whole game bundles into a single HTML file.

## Controls

- **Tap** a villager or building to select it
- **Tap** a tree/mine to gather, the ground to move, an enemy to attack
- **Lumber/Mining Camps** (75 wood) act as drop-off points near the woods or
  a mine/quarry, so villagers don't trek back to the Town Hall
- **Farms** (60 wood) give a steady food trickle; **berry bushes** forage out,
  **mines and quarries** shrink to rubble, **trees** leave stumps
- **Economy shape**: food trains villagers (50) and soldiers (40 + 25 gold);
  wood pays for buildings; **stone + wood builds new Town Halls** (200w/150s)
  for +5 pop and forward drop-offs
- **Drag** to pan the camera, **pinch** to zoom
- **Army** button selects all your soldiers and jumps the camera to them
- **Build menu** is split into Economy (house, farm, camps, town hall) and
  Military (barracks, archery range, watchtower) categories
- **Archery Range** (175 wood) trains archers — ranged units that shoot
  arrows from a distance (30 food + 35 gold each)
- **Watchtowers** (150 wood) fire one arrow at a time at anything hostile in
  range and shelter up to 5 units — tap a tower with units selected to
  garrison them, select it to open the doors
- **Ring the Bell** (Town Hall) shelters your villagers inside — a garrisoned
  Town Hall shoots arrows at attackers (one per villager, up to 10). Ring
  again to send everyone back to work.

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
