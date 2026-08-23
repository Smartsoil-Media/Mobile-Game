# Bramblewick

A tiny, cosy real-time strategy game in the spirit of Age of Empires, built for
phones — portrait or landscape.

**Play it**: https://smartsoil-media.github.io/Mobile-Game/ (deployed from this
repo by `.github/workflows/pages.yml` on every push). It's an installable
web app: **Share → Add to Home Screen** gives you a Bramblewick icon that
launches fullscreen, no browser chrome, and keeps working offline
(network-first service worker; icons regenerate via `node scripts/icons.mjs`). Gather wood, food, gold and stone; farm, expand with new town halls,
train little swordsmen, and destroy the enemy town hall before their army
topples yours. The enemy village plays by the same rules: same starting
villagers and resources, a real economy, and attacks that grow bolder.

Everything — world, units, buildings, art — is drawn in code on an HTML5 canvas.
No image assets, no frameworks. The whole game bundles into a single HTML file.
The meadow itself is alive: mixed woods (oaks, pines, pale birches), pebble
clusters, toadstool rings and clover, butterflies looping in the sunlight,
worn earth trodden around every standing building, and deer grazing the wilds.

## The map

Every new game rolls a **fresh map, four times the classic size**
(3840×2560): the two villages spawn in opposite corners, and each is
guaranteed its starting kit *closish* to home — a berry patch, home woods,
a gold mine and a stone quarry — while the wilds between are dealt anew
each time (contested mines, rambling forests, deer herds). The population
cap is **50**. URL flags: `?map=classic` pins the original handcrafted
meadow (the regression suite lives there); `?map=<number>` replays a
specific roll.

The land itself has character. A **stream** winds down the middle of every
rolled map — deep water that no one swims, crossed only at three sandy
**fords** (stepping stones show the way; you can't build in the water or
dam a ford, and the pathfinder routes armies through the crossings).
**Rocky crags** rise from the meadow as impassable outcrops, and the
ground shifts through **broad soft zones** — lush hollows, dry golden
grass, mossy shade, scree aprons, gentle sunlit rises — with reed beds
framing every ford, lily pads off the shallows, and glints drifting
downstream.

**Crocodiles** lurk along the water — mostly submerged, eyes and scutes
above the ripples, some right beside the fords. Stray too close and they
lunge: one bite sends a villager (or scout) bolting; soldiers bite back
with steel. They're also **food (130)**: a lone villager loses that hunt,
so send **three** — they'll bring one down in seconds and haul the meat
to any food drop-off. Crocs keep to a short territory and give up the
chase at its edge.

## Controls

- **Tap** a villager or building to select it
- **Tap** a tree/mine to gather, the ground to move, an enemy to attack
- Units **pathfind**: a coarse walkability grid + A* routes them around
  whole forests, villages and walls (a grove is one obstacle, not a trap of
  trunks); on open ground they walk straight, and chopping a tree or
  starting a fence post updates the grid on the spot
- **Lumber/Mining Camps** (75 wood) act as drop-off points near the woods or
  a mine/quarry, so villagers don't trek back to the Town Hall
- **Farms** (60 wood) give a steady food trickle — but each field wants
  exactly **one farmer**; extra hands are waved off to a free farm (or told
  to plant another). **Berry bushes** forage out, **mines and quarries**
  shrink to rubble, **trees** leave stumps
- **Deer** graze in shy little herds. Send a villager at one to **hunt**:
  the deer bolts in short hops, three pokes bring it down, and the venison
  (90 food) hauls to any food drop-off. Herds amble, keep their distance,
  and only show in live sight
- **Economy shape**: food trains villagers (50) and soldiers (40 + 25 gold);
  wood pays for buildings; **stone + wood builds new Town Halls** (200w/150s)
  for +5 pop and forward drop-offs
- **Resource pills** show how many villagers work each resource; **tap a
  pill** to put one more villager on it (idle hands first, then borrowed
  from the busiest line). The pop pill counts idle villagers — tap it to
  jump to them
- **Minimap** (bottom-left): the whole meadow at a glance, fog and all —
  explored land, the stream and fords, resources, buildings (enemy once
  seen), units (enemy in live sight), and your camera's window. **Tap or
  drag on it** to send the camera anywhere; **red rings pulse** wherever
  your villagers or buildings are taking hits
- **Tap feedback**: whatever you touch flashes briefly; a tap on bare
  meadow leaves a small settling ring. Selecting units (army chips
  included) never moves the camera — the minimap is the way to travel
- **Production loaders** (a small row, top-left): everything in progress
  shows as a tiny circular loader — like apps downloading — one ring per
  training queue (with a ×count badge), per tech being researched, and per
  landmark rising. Tap a loader to select the building doing the work; the
  command dock stays clean for giving orders
- **Drag** to pan the camera, **pinch** to zoom
- **Army panel** (right edge): one chip per unit type you field, with a
  live count — tap a chip to grab all spearmen / swordsmen / archers at
  once; the blue **Army** button below grabs the whole battle line
- **Archery Range** (175 wood) trains **longbowmen** — ranged units that
  shoot arrows from a distance (30 food + 35 gold each)
- **Stable** (175 wood, Feudal) trains scouts (30 food + 15 gold) so your
  eyes on the meadow can be replaced; **Knights** (60 food + 75 gold) ride
  out once the Castle Age dawns — fast, armoured lancers (spearmen carry a
  +12 bonus against cavalry, knights included)
- **Palisade walls** (3 wood a post, Dark Age) place as a dragged line —
  grab either end of the fence and stretch it; the ✓ shows a live post
  count and price, and your villager builds along the row without being
  re-told. **Gates** (20 wood) swing open for your own units and stay
  barred to the enemy, who must chop through
- **Watchtowers** (150 wood) fire one arrow at a time at anything hostile in
  range and shelter up to 5 units — tap a tower with units selected to
  garrison them, select it to open the doors
- **Ring the Bell** (Town Hall) shelters your villagers inside — a garrisoned
  Town Hall shoots arrows at attackers (one per villager, up to 10). Open the
  doors and everyone goes **back to the job they were doing**.
- **Repairs**: tap a damaged friendly building with villagers selected and
  they'll hammer it back to health — a full mend costs about half the
  building's wood price, paid as they work.
- **Build menu** has two doors: Economy and Military. The **Mill** (60 wood)
  is a food drop-off for berries and farms.
- **Economy techs** (Feudal Age, 100 food + 75 wood, 30s each) are researched
  at their home buildings: **Steel Axes** at the Lumber Camp (+20% wood),
  **Wheelbarrow** at the Mill (+20% food, farms included), **Miner's Picks**
  at the Mining Camp (+20% gold & stone). The enemy researches them too.

## The menu, the banners, the rivalry

The game opens on a **main menu**: **Solo** leads to the banner screen —
pick **the English or the French**, set the rival's temper (**Gentle /
Fair / Fierce**), and Begin. **Multiplayer** wears a *coming soon* badge
(a ranked trophy ladder arrives with it). Every match is **civ vs civ**:
the enemy village always marches under the other banner, plays its own
civ's landmarks, and leans into its own civ's habits. A Fierce rival
thinks faster, runs a deeper economy, starts flush, and pushes with
bigger armies; a Gentle one gives you room to breathe.

## Ages & Landmarks

You start in the **Dark Age** (spearmen only; the archery range, stable,
watchtower, swordsman and new Town Halls are locked). There's no age
research bar: **an age is a landmark you build**. Tap the laurel on the
Town Hall, choose the eco road or the military road, place the landmark,
and when your villagers finish raising it the new age dawns. Landmarks are
real buildings on the map — the enemy can raid the site while it rises.
There's no age indicator in the HUD either: your **architecture shows the
age** — timber planks in the Dark Age, cream plaster once Feudal, dressed
stone in the Castle Age.

**The English:**

| To reach | Eco road | Military road |
| --- | --- | --- |
| **Feudal Age** | **Abbey Mill** (200f + 100w): a food drop-off that also tithes a steady food trickle | **King's Barracks** (150f + 150w): trains full infantry, and musters **levy spearmen** for 20 food + 10 wood |
| **Castle Age** | **Guild Hall** (300f + 100g): merchants bring a steady gold trickle | **The White Keep** (250f + 200 stone): an arrow fortress with a long reach — garrison up to 8 for more arrows |

**The French** — chivalry comes early: **knights ride in the Feudal Age**
(everyone else waits for Castle):

| To reach | Eco road | Military road |
| --- | --- | --- |
| **Feudal Age** | **Chamber of Commerce** (200f + 100w): a gold trickle a whole age early | **School of Cavalry** (150f + 150w): trains scouts and **discounted knights** (50 food + 60 gold, faster too) |
| **Castle Age** | **Royal Vineyard** (300f + 100g): the harvest trickles in food on its own | **The Red Palace** (250f + 200 stone): a brick bolt-fortress — garrison up to 8 for more bolts |

## Champions (Castle Age)

Each military hall offers one mighty upgrade — tap the **crown** on the
building. It retrofits soldiers already standing (gold sparkles included)
and every recruit after:

| Where | Upgrade | Effect |
| --- | --- | --- |
| Barracks / King's Barracks | **Champion Infantry** (150f + 100g) | spearmen & swordsmen +15 health, +3 damage |
| Archery Range | **Champion Longbows** (100w + 150g) | longbowmen +10 health, +3 damage |
| Stable | **Champion Knights** (150f + 150g) | knights +20 health, +3 damage |

The enemy village walks the same road: it banks toward its own landmarks,
counters what you field, and swears in champions when its coffers run deep.

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
