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
- **Farms** (60 wood) fill a **4×4 plot** and are **walked straight over**
  — they're ground, not obstacles, so fields never wall your village in.
  Each one wants exactly **one farmer**; extra hands are waved off to a
  free farm (or told to plant another). A worked field **turns through
  the year**: bare furrows and seed, green shoots, tall stalks, heavy
  gold — then the scythe, a puff of chaff, and back to bare earth. The
  farmer stands in the **middle of his own field**, so it's plain at a
  glance who is tending what
- **Berry bushes** forage out, **mines and quarries** shrink to rubble,
  **trees** leave stumps — and once they're spent you can build straight
  over them
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
- **Companies and their beasts** (multiple armies): every soldier and
  siege engine musters under **the Lion** by default — the shield *is*
  that company, so if you never split your host, nothing changes. A
  company is known by the **beast it wears**, not by a flag: the Lion,
  then **the Stag, the Boar and the Wolf**, each borne on a roundel in
  its own colours. Which beast a soldier rides under is settled where he
  is *raised*: a **military hall sends its recruits to a company** — tap
  the roundel on its dock, and raise a new one there if you want a fresh
  company. The hall then *flies that company's colours on its roof*, so
  you can read your whole muster off the rooftops. The beasts sit in the
  **row at the top right** — tap one to switch companies. The bucklers
  below show **that company's roster**, and the **shield musters all of
  it**, wearing those colours so the whole right edge belongs to the
  company you're looking at. One beast per unit; an emptied company keeps
  its roundel, pale, because its halls still feed it. **Monks are the
  exception**: they are ordained at a church rather than a military hall,
  so they swear to no beast at all — and a monk carrying a relic ignores
  the muster entirely, the reliquary mattering more than the parade
- **The muster flag** (where recruits gather): now that no company wears
  a flag, a flag means one thing — **stand here**. Select a military hall
  and the dock carries a pennant beside the beast; tap it, then tap the
  grass, and that company's **muster flag** is planted there. Every man
  it raises from then on walks straight to the flag instead of milling
  about the yard, taking a spot a little off the pole so a company builds
  up around it rather than treading the same patch. The flag is per
  *company*, not per hall, so a barracks and an archery range both
  feeding the Stag send their recruits to the same field. It stands in
  the meadow in that company's colours — full strength for the company
  you're looking at, pale for the rest — and the button shows a mound of
  earth at the pole's foot once one is planted. Tap the flag again to
  move it, or clear it and recruits gather at their halls as before
- **Formation** (how a company marches): select soldiers and the dock
  carries a single formation button — a **bunch** (a square block,
  shoulder to shoulder) or a **line** (one rank drawn *across* the
  direction of travel, folding into a second rank past twelve). The
  button always shows the shape you'd be switching *to*, and switching
  re-forms a company that is already on the march. Every move order then
  hands out standing places rather than sending everyone at one point:
  the company keeps its shape on the way over instead of scattering and
  jostling. Each company remembers its own formation, so the Lion can
  hold a line while the Stag stays bunched
- **The build grid**: every building covers a whole number of **16px
  tiles** — a house is 4×4, a barracks 8×8, the Town Hall 8×8, a fence
  post 1×1 — and pick one up and the meadow rules itself into that
  lattice, with a heavier line every fourth. The ghost shows the true
  footprint, tile by tile, and **snaps so its edges land on the grid
  lines**, so buildings pack flush against each other and rows come out
  straight. The squares it *won't* fit are washed red around the ghost
  (fading at the edge of what's checked, so it reads as a hint near your
  thumb rather than a hard border). The rival village builds on the same
  lattice, so its streets line up too
- **Worked-out ground is buildable**: a foraged-out berry bush, a mine or
  quarry shrunk to rubble, a chopped stump, a picked-clean carcass — none
  of them hold the ground any more. Build right over the top and the
  litter is swept away underneath
- **Deselect** (the empty frame beside the stone pill): one tap drops the
  whole selection — far easier than picking villagers off one by one
- **Info mode** (the ⓘ to the left of the resources): tap it to light it
  up, then tap *anything* — a building, a unit, a deer, a relic — and a
  card explains what it is for, what it costs, what it trains or
  researches, and what it's doing right now. Nothing gets selected and no
  order goes out while it's lit; tap the ⓘ again to switch it off
- **Drag** to pan the camera, **pinch** to zoom
- **Army panel** (right edge): a **buckler** per unit type in the active
  company, with a live count — tap one to grab all its spearmen /
  swordsmen / knights at once. Below them the **heater shield** musters
  every soldier in the active company; the companies' own beasts sit in a
  row across the top right
- **Archery Range** (175 wood) trains **longbowmen** — ranged units that
  shoot arrows from a distance (30 food + 35 gold each)
- **Stable** (175 wood, Feudal) trains scouts (30 food + 15 gold) so your
  eyes on the meadow can be replaced; **Knights** (60 food + 75 gold) ride
  out once the Castle Age dawns — fast, armoured lancers (spearmen carry a
  +12 bonus against cavalry, knights included)
- **Siege Workshop** (200 wood, Castle Age) builds the engines of war.
  The **Mangonel** (140w + 80g) lobs a boulder that shatters on impact —
  everything near where it lands is hit, so clumped defenders scatter or
  suffer — but it can't drop a shot at its own feet: knights that close
  the gap shred it (cavalry carries a bonus against siege). The
  **Trebuchet** (200w + 120g) outranges every tower and keep on the
  meadow, but must stand still ~3 seconds to plant its frame before it
  can loose, and packs up the moment it rolls. Boulders fly to where the
  target *was* — buildings can't dodge; soldiers sometimes do. A planted
  trebuchet batters any enemy building in reach on its own
- **Palisade walls** (3 wood a post, Dark Age) place as a dragged line —
  grab either end of the fence and stretch it; the ✓ shows a live post
  count and price, and your villager builds along the row without being
  re-told, working right down the run rather than stopping when the next
  post is a little way off. **Gates** (20 wood) **snap into a fence at whatever slant it
  runs at** — level, diagonal, or anything between. A gate follows the
  single run you point at, so corners, T-junctions and parallel fences
  all behave, and it can never slide off the end into open grass. Its
  posts stand upright whatever the angle and carry a team pennant, so a
  gateway reads even on a run pointing straight at you. It swallows the
  posts it covers, whose timber goes straight back in the pile. Your
  people **route through their own gates** — a fenced-in village is not
  a trap — and the posts framing a gateway stand aside as you pass, so a
  crowd streams through instead of jamming in the doorway. They swing open for your own units and stay barred to
  the enemy, who must chop through
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

## Relics, monks, churches & ministries (Castle Age)

**Holy relics** rest on wayside plinths in the contested wilds — golden
reliquaries that gleam on the minimap once found (three on the classic
meadow, five on every rolled map, always well away from both homes).
Only a **monk** may lift one.

- The **Church** (150 wood + 50 gold, Castle Age, economy menu) ordains
  **monks** (100 gold): unarmed wanderers who quietly **heal** nearby
  friendly units (1 hp/s) and answer taps on relics — the monk walks
  over, hoists the reliquary overhead, and carries it home
- Tap a church or **Ministry** with a laden monk selected and the relic
  is **enshrined** there: each relic tithes a steady **+0.5 gold/s**
  forever (little gold caskets line the shrine's front). Fell the shrine
  and the relics spill out for anyone's monk to claim anew; fell a
  carrying monk and the relic drops where he stood
- The **Ministry** (175 wood + 75 gold, Castle Age) also researches the
  faith techs: **Tithe Barns** (150f + 100g — relics also trickle
  +0.25 food/s) and **Sanctuary** (100f + 100g — monks heal twice as
  fast, twice as far)
- The rival village keeps the faith too: at Castle it raises a church,
  ordains monks, and **races you for every unclaimed relic**

## The way in

Four cards, in order:

1. **Your name** — a **stand-in sign-in**: no password, no server, nothing
   leaves the device. The name is kept in `localStorage` so the menu can
   greet you next time and put you on the victory card; the sim never
   reads it. *Wander in unnamed* skips it. Real accounts land with
   multiplayer.
2. **How you're playing** — **Solo**, or **Multiplayer** wearing a *coming
   soon* badge (a ranked trophy ladder arrives with it).
3. **Where you're playing** — the map picker. **Crocodile Crossing** is the
   home meadow: the handcrafted map, a winding stream with three shallow
   fords, crocodiles in the reeds, and woods packed tight enough to wall a
   lane shut. **Wanderer's Roll** deals a fresh generated map instead —
   four times the land, villages in opposite corners. The picker builds
   itself from the `MAPS` table in `data.ts`, so adding a map is a line of
   data. Picking ground the boot didn't deal re-deals the world in place.
4. **Your banner** — **the English or the French**, and the rival's temper
   (**Gentle / Fair / Fierce**). Then Begin.

Every match is **civ vs civ**: the enemy village always marches under the
other banner, plays its own civ's landmarks, and leans into its own civ's
habits. A Fierce rival thinks faster, runs a deeper economy, starts flush,
and pushes with bigger armies; a Gentle one gives you room to breathe.

Held in portrait, the game shows one flat *turn sideways* screen rather
than a blurred glimpse of a meadow laid out for a window it hasn't got —
and everything outside the playfield (including the strip beyond a notched
phone's viewport) is painted the same deep green, so no pale band shows
along an edge.

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

## Sound

The meadow has a voice: axes into trunks, picks on stone, hammers on a
half-built hall, a bowstring, a boulder landing, the town bell when something
of yours is being hurt, and a horn for the age turning over.

- Every sample ships **inside** the bundle as a base64 mono MP3, so the game
  still has audio installed to a home screen with the phone in flight mode, and
  the Artifact build works under a CSP that forbids fetching anything.
- Sound follows the eye. A cue carries a world position; the mixer pans it,
  fades it out toward the edge of the screen, drops it entirely once it's well
  off-camera, and never plays anything standing in the fog.
- Repeats are throttled per sound and pitch-drifted a few percent, so twenty
  villagers chopping in step sound like a village rather than a machine gun.
- Every sample is levelled onto a common reference when it decodes. Recordings
  arrive at wildly different levels and no encoder setting reliably fixes that
  for a file dropped in by hand, so the engine measures what it actually got.
  The per-sound gains in `MIX` are then free to mean what they say — how loud a
  chop is *relative to* a boulder — rather than compensating for hot sources.
- The handbell above the minimap hushes everything, and remembers.

The sim never touches the audio engine — it appends a name and a position to
`g.sfxQueue` via `cue()`, and `drainSfx()` empties that once a frame. A headless
run therefore behaves identically with no speaker attached, which is how the
playtest checks the right sounds fire at the right moments.

### Working on the sound bank

```bash
npm run audio   # render the bank, then encode it into src/sfx-data.ts
```

`scripts/synth.mjs` builds the stand-in bank from modal synthesis — a struck
object is a handful of decaying sine partials, so wood, stone, metal and bells
all come out of the same small toolkit. It's seeded, so a rebuild that changed
nothing produces identical files.

To swap in a real recording, drop it in as `audio-src/<name>.src.wav`. The synth
leaves that name alone and `scripts/audio.mjs` normalises, trims and encodes it
exactly like the rest. `audio-src/` is deliberately untracked: the synthesised
files regenerate from source, and licensed samples don't belong in a public repo.

### The twenty-one slots

All twenty-one now ship as real licensed recordings — dry, close-mic'd, one hit
per file, no reverb of their own (the mixer supplies distance). Sources are
searched by physical description rather than by mood; abstract wording drifts
badly. Because `audio-src/` is untracked, a fresh clone has only the encoded
result in `src/sfx-data.ts`; re-running `npm run audio` without re-fetching the
originals will fall back to the synthesised stand-ins for every slot.

One thing to watch when picking a replacement: the bank encodes to 22.05kHz
mono MP3 at 32 kbps, which lowpasses hard. A sample whose energy all sits above
about 6kHz — a bright coin jangle, say — survives the encoder as near-silence
and trips the playtest's sound check. Prefer sources with real low-mid body.

| Slot | Wanted | Length |
| --- | --- | --- |
| `chop` | axe biting into a trunk, single hit | ~0.5s |
| `mine` | pick on stone, dry, a little grit | ~0.4s |
| `forage` | hands through a berry bush | ~0.4s |
| `harvest` | scythe through standing wheat | ~0.5s |
| `drop` | a sack set down, then coins | ~0.5s |
| `hammer` | one blow of a builder's hammer on timber | ~0.3s |
| `place` | a stake driven into ground | ~0.4s |
| `built` | roof going on: a drum and a warm chord | ~1.2s |
| `muster` | a soldier stepping out — short horn motif | ~0.8s |
| `sword` | blade on blade, single clash | ~0.4s |
| `bow` | bowstring released | ~0.3s |
| `arrowhit` | an arrow finding timber | ~0.3s |
| `launch` | trebuchet: rope, timber, counterweight dropping | ~0.9s |
| `boom` | boulder landing, rubble thrown | ~1.0s |
| `crumble` | a building giving way | ~1.4s |
| `tap` | small UI tick, wooden not electronic | ~0.15s |
| `bell` | a town bell, one strike, allowed to ring on | ~2s |
| `gate` | heavy wooden gate swinging, then a thud | ~1.0s |
| `ageup` | rising horn fanfare | ~2s |
| `victory` | fuller fanfare, horns and bells | ~2.5s |
| `defeat` | descending horns, a slow drum | ~2.5s |

Long tails cost real bytes: `bell`, `ageup`, `victory` and `defeat` are encoded
at 48 kbps and everything else at 32, and together they are about a third of the
bank's size. Trim recordings to the table above before dropping them in.

## Development

```bash
npm install
npm run build   # bundles src/ into dist/index.html + dist/artifact.html
npm run shot    # headless playtest + screenshots (PW_EXECUTABLE=/path/to/chromium if needed)
npm run audio   # re-render and re-encode the sound bank (needs ffmpeg-static)
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
| `src/audio.ts` | The mixer: decoding, panning, throttling, mute |
| `src/sfx-data.ts` | Generated — the sound bank as base64 MP3 |
| `src/main.ts` | Bootstrap and game loop |
