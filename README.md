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
- **Resource pills** show how many villagers work each resource; **tap a
  pill** to put one more villager on it (idle hands first, then borrowed
  from the busiest line). The pop pill counts idle villagers — tap it to
  jump to them
- **Drag** to pan the camera, **pinch** to zoom
- **Army** button selects all your soldiers and jumps the camera to them
- **Archery Range** (175 wood) trains archers — ranged units that shoot
  arrows from a distance (30 food + 35 gold each)
- **Stable** (175 wood, Feudal) trains scouts (30 food + 15 gold) so your
  eyes on the meadow can be replaced; the **Knight** button waits behind a
  padlock until the Castle Age (spearmen already carry a +12 bonus against
  cavalry, knights included)
- **Watchtowers** (150 wood) fire one arrow at a time at anything hostile in
  range and shelter up to 5 units — tap a tower with units selected to
  garrison them, select it to open the doors
- **Ring the Bell** (Town Hall) shelters your villagers inside — a garrisoned
  Town Hall shoots arrows at attackers (one per villager, up to 10). Open the
  doors and everyone goes **back to the job they were doing**.
- **Repairs**: tap a damaged friendly building with villagers selected and
  they'll hammer it back to health — a full mend costs about half the
  building's wood price, paid as they work.
- **Build menu** has three doors: Economy, Military, and **Study** — home of
  the **Blacksmith** (150 wood, Feudal Age), which forges army upgrades:
  Forged Blades (+2 melee damage), Fletched Arrows (+2 archer damage), and
  Iron Mail (+15 infantry health, fitted to soldiers already standing).

## Ages & Patron Spirits

You start in the **Dark Age** (spearmen only; the archery range, watchtower,
swordsman and new Town Halls are locked). Advancing to the **Feudal Age**
costs 275 food and 35s at the Town Hall — and when you do, you choose a
**patron spirit**. There's no age indicator in the HUD: your **architecture
shows the age** — timber-plank walls in the Dark Age, cream plaster on stone
footings once Feudal (and scouting the enemy village reveals whether they've
aged up). Each patron grants one economy tech instantly and free;
everyone else can research that same tech the slow way (100 food + 75 wood,
30s) at its home building:

| Patron | Free tech | Effect | Researched by others at |
| --- | --- | --- | --- |
| the Oak Father | Steel Axes | +20% wood chopping | Lumber Camp |
| the River Mother | Wheelbarrow | +20% food gathering | Mill |
| the Mountain King | Miner's Picks | +20% gold & stone mining | Mining Camp |
| the Fox | Fox Paths | villagers & scouts walk faster, see further | Town Hall |

The **Mill** (60 wood) is a food drop-off for berries and farms, and home to
the Wheelbarrow research. The enemy village ages up too, follows its own
patron, and picks up the remaining techs when it can afford them.

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
