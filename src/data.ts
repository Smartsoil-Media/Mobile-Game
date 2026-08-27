// Shared types, stats and balance numbers for Bramblewick.

export type Team = 0 | 1
export const NEUTRAL = -1

export type Kind =
  | 'villager' | 'swordsman' | 'spearman' | 'archer' | 'scout' | 'knight' | 'monk'
  | 'mangonel' | 'trebuchet'
  | 'towncenter' | 'house' | 'barracks' | 'archeryrange' | 'stable' | 'lumbercamp' | 'miningcamp' | 'mill' | 'farm' | 'watchtower' | 'wall' | 'gate'
  | 'church' | 'ministry' | 'siegeworkshop'
  | 'abbeymill' | 'kingsbarracks' | 'guildhall' | 'whitekeep'
  | 'chamberofcommerce' | 'cavalryschool' | 'royalvineyard' | 'redpalace'
  | 'tree' | 'goldmine' | 'berrybush' | 'stonequarry' | 'deer' | 'crag' | 'croc' | 'relic'

export type Buildable = 'house' | 'farm' | 'mill' | 'barracks' | 'archeryrange' | 'stable' | 'watchtower' | 'wall' | 'gate' | 'lumbercamp' | 'miningcamp' | 'towncenter'
  | 'church' | 'ministry' | 'siegeworkshop'
  | 'abbeymill' | 'kingsbarracks' | 'guildhall' | 'whitekeep'
  | 'chamberofcommerce' | 'cavalryschool' | 'royalvineyard' | 'redpalace'

// ---- civilisations: each fights under its own banner and landmarks ----
export type CivId = 'english' | 'french'
export const CIVS: Record<CivId, { name: string; blurb: string }> = {
  english: {
    name: 'The English',
    blurb: 'Sturdy landmarks and cheap levy spearmen — the long game of field and fletching.',
  },
  french: {
    name: 'The French',
    blurb: 'Chivalry comes early: knights ride in the Feudal Age, and the School of Cavalry musters them cheap.',
  },
}

export type ResKind = 'wood' | 'food' | 'gold' | 'stone'

export interface Pt { x: number; y: number }

// How a company arranges itself on the march. A bunch is a block, shoulder to
// shoulder; a line is a rank drawn across the direction of travel.
export type Formation = 'bunch' | 'line'
export const FORMATION_SPACING = 26 // shoulder to shoulder: a shade over two unit widths

export interface Ent {
  id: number
  kind: Kind
  team: number // 0 player, 1 enemy, -1 neutral resource
  x: number
  y: number
  r: number
  hp: number
  maxHp: number
  seed: number
  // units
  state?: 'idle' | 'move' | 'attackmove' | 'attack' | 'gather' | 'return' | 'build' | 'garrison' | 'fetchrelic' | 'enshrine'
  hidden?: boolean // garrisoned inside a building; still alive and counted in pop
  tx?: number
  ty?: number
  targetId?: number
  resume?: { x: number; y: number } | null
  carry?: number
  carryRes?: ResKind
  cd?: number
  gatherT?: number
  scanT?: number
  job?: { state: 'gather' | 'build'; targetId: number } | null // remembered work while sheltering
  face?: number // -1 left, 1 right
  heading?: number // radians, smoothed direction of travel
  stepped?: boolean // true if the unit actually walked this tick
  avoidSide?: number // 1 | -1: which way we're sliding around an obstacle
  chaseT?: number // keep closing a touch after re-entering attack range
  stuckT?: number // time spent walking without getting anywhere
  homeX?: number // where a deer's heart is — it ambles near here
  homeY?: number
  fleeT?: number // a startled deer bolts for this long
  path?: { x: number; y: number }[] | null // grid waypoints when the straight line is blocked
  pathGoal?: { x: number; y: number } | null // where that path was headed
  repathT?: number // cooldown so a lost walker doesn't re-plan every tick
  lastX?: number
  lastY?: number
  phase?: number
  relicId?: number // the relic a monk is carrying
  banner?: number // which banner this soldier rides under (monks may ride under none)
  recruitBanner?: number // on a military hall: the banner its recruits join
  setup?: number // a trebuchet plants its frame before it can loose (resets on the move)
  crop?: number // a farm's field: 0 just sown, 1 ripe for the scythe
  angle?: number // a gate set into a fence lies along the run, at any slant
  // relics
  heldBy?: number // the monk carrying this relic
  shrineId?: number // the church or ministry this relic is enshrined in
  // buildings
  complete?: boolean
  progress?: number
  queue?: { kind: Kind; t: number; total: number }[]
  research?: { id: ChampId | TechId; t: number; total: number } // an upgrade underway here
  garrison?: number
  insideId?: number // which building this hidden unit is sheltering in
  volleyT?: number
  // resources
  amount?: number
}

export interface Particle {
  x: number; y: number; vx: number; vy: number
  life: number; maxLife: number
  size: number; color: string
  kind: 'puff' | 'spark' | 'hit' | 'leaf'
}

export interface Projectile {
  x: number; y: number
  targetId: number
  tx: number; ty: number // last known target position
  speed: number
  dmg: number
  team: number
  // siege boulders: lobbed at a FIXED point (no homing), land with a splash
  kind?: 'boulder'
  sx?: number; sy?: number // launch point, for the flight arc
  arcH?: number // how high the lob rises
  splash?: number // everything hostile within this radius of impact is hit
}

export interface Fog {
  w: number
  h: number
  explored: Uint8Array
  visible: Uint8Array
}

export interface Game {
  ents: Ent[]
  byId: Map<number, Ent>
  nextId: number
  t: number
  speed: number
  res: Record<ResKind, number>[]
  camera: { x: number; y: number; zoom: number }
  selection: number[]
  placing: Buildable | null
  placePos: { x: number; y: number } | null
  placeEnd: { x: number; y: number } | null // walls stretch between placePos and here
  placeAngle: number // a gate ghost lies along the fence it has snapped to
  over: 'win' | 'lose' | null
  overT: number
  particles: Particle[]
  projectiles: Projectile[]
  arrowsFired: number
  fog: Fog
  visionT: number
  ai: { enabled: boolean; thinkT: number; attackSize: number; attacking: boolean }
  age: number[] // per team: 1 = Dark, 2 = Feudal, 3 = Castle (advanced by landmarks)
  civs: CivId[] // per team: whose banner flies over the village
  aiLevel: 'easy' | 'normal' | 'hard' // how sharp the rival village plays
  champs: Record<ChampId, boolean>[] // per team: bought champion upgrades
  techs: Record<TechId, boolean>[] // per team: researched economy techs
  world: { w: number; h: number } // this map's size (random maps are bigger than classic)
  nav: { w: number; h: number; block: Uint8Array } | null // coarse walkability grid (lazy)
  navDirty: boolean // terrain changed — rebuild the grid before the next query
  navWater: Uint8Array | null // cached water stamp (streams never move)
  mapSeed: number // 0 = the classic meadow; anything else = a rolled map
  streams: { pts: { x: number; y: number }[]; w: number }[] // winding water, crossable at fords
  fords: { x: number; y: number; r: number }[] // shallow crossings through the streams
  toasts: { text: string; t: number }[]
  pings: { x: number; y: number; t: number }[] // minimap alerts where your things take hits
  taps: { x: number; y: number; r: number; ent: boolean; at: number }[] // tap feedback markers
  banners: number // how many banners are raised (1 = just the Lion)
  formation: Formation[] // per banner: how its companies stand when they march
  muster: (Pt | null)[] // per banner: where its recruits walk once they are raised
  mustering: number | null // which banner is waiting for you to plant its muster flag
  activeBanner: number // whose roster the bucklers are showing
  infoMode: boolean // the ? button: taps read a thing out instead of commanding it
  infoId: number | null // what the info card is currently reading out
  started: boolean
  uiDirty: boolean
  sfxQueue: SfxCue[] // things that just happened and want to be heard
}

/** A sound the sim asked for. The sim never touches the audio engine itself. */
export interface SfxCue { name: string; x?: number; y?: number; gain?: number }

const SFX_QUEUE_MAX = 48 // a frame of chaos shouldn't grow the queue without end

/** Ask for a sound at a spot in the world. Cheap, and safe to spam. */
export function cue(g: Game, name: string, x?: number, y?: number, gain?: number): void {
  if (g.sfxQueue.length >= SFX_QUEUE_MAX) return
  g.sfxQueue.push({ name, x, y, gain })
}

export interface Cost { wood: number; food: number; gold: number; stone: number }
export const NO_COST: Cost = { wood: 0, food: 0, gold: 0, stone: 0 }
export function cost(c: Partial<Cost>): Cost { return { ...NO_COST, ...c } }

export const UNITS: Record<string, {
  hp: number; dmg: number; range: number; cd: number
  speed: number; aggro: number; cost: Cost; time: number; r: number; los: number
  age?: number; name: string
}> = {
  villager: { hp: 30, dmg: 3, range: 16, cd: 1.0, speed: 31, aggro: 0, cost: cost({ food: 50 }), time: 7, r: 10, los: 160, name: 'Villager' },
  swordsman: { hp: 70, dmg: 9, range: 18, cd: 0.9, speed: 37, aggro: 130, cost: cost({ food: 40, gold: 25 }), time: 9, r: 11, los: 180, age: 2, name: 'Swordsman' },
  spearman: { hp: 55, dmg: 6, range: 20, cd: 1.0, speed: 37, aggro: 130, cost: cost({ food: 35, wood: 20 }), time: 8, r: 11, los: 180, name: 'Spearman' },
  archer: { hp: 40, dmg: 6, range: 110, cd: 1.6, speed: 35, aggro: 150, cost: cost({ food: 30, gold: 35 }), time: 10, r: 10, los: 200, age: 2, name: 'Longbowman' },
  scout: { hp: 45, dmg: 2, range: 14, cd: 1.0, speed: 58, aggro: 0, cost: cost({ food: 30, gold: 15 }), time: 8, r: 12, los: 280, name: 'Scout' },
  knight: { hp: 110, dmg: 11, range: 16, cd: 0.9, speed: 50, aggro: 140, cost: cost({ food: 60, gold: 75 }), time: 12, r: 13, los: 220, age: 3, name: 'Knight' },
  monk: { hp: 45, dmg: 0, range: 14, cd: 1.0, speed: 34, aggro: 0, cost: cost({ gold: 100 }), time: 16, r: 10, los: 190, age: 3, name: 'Monk' },
  // siege engines: slow wooden machines from the workshop (Castle Age).
  // The mangonel lobs a splash boulder at clumps; the trebuchet outranges
  // every fortress but must plant its frame before it can loose.
  mangonel: { hp: 90, dmg: 14, range: 200, cd: 4.0, speed: 22, aggro: 180, cost: cost({ wood: 140, gold: 80 }), time: 18, r: 14, los: 230, age: 3, name: 'Mangonel' },
  trebuchet: { hp: 110, dmg: 55, range: 330, cd: 7.0, speed: 14, aggro: 0, cost: cost({ wood: 200, gold: 120 }), time: 24, r: 15, los: 280, age: 3, name: 'Trebuchet' },
}

// Buildings occupy a whole number of TILES, and `foot` is just half that span
// in pixels — so every footprint edge lands on a grid line and buildings pack
// against each other cleanly.
export const BUILDINGS: Record<string, {
  hp: number; r: number; tiles: number; foot: number; art?: number; cost: Cost; time: number; pop: number; los: number
  garrisonCap: number; age?: number; name: string
}> = {
  towncenter: { hp: 800, r: 59, tiles: 8, foot: 64, art: 56, cost: cost({ wood: 200, stone: 150 }), time: 45, pop: 6, los: 200, garrisonCap: 10, age: 2, name: 'Town Hall' },
  house: { hp: 200, r: 26, tiles: 4, foot: 32, cost: cost({ wood: 50 }), time: 12, pop: 5, los: 140, garrisonCap: 0, name: 'House' },
  farm: { hp: 120, r: 30, tiles: 4, foot: 32, cost: cost({ wood: 60 }), time: 10, pop: 0, los: 140, garrisonCap: 0, name: 'Farm' },
  barracks: { hp: 350, r: 53, tiles: 8, foot: 64, art: 48, cost: cost({ wood: 150 }), time: 20, pop: 0, los: 140, garrisonCap: 0, name: 'Barracks' },
  archeryrange: { hp: 300, r: 51, tiles: 8, foot: 64, art: 48, cost: cost({ wood: 175 }), time: 20, pop: 0, los: 140, garrisonCap: 0, age: 2, name: 'Archery Range' },
  stable: { hp: 350, r: 51, tiles: 8, foot: 64, art: 48, cost: cost({ wood: 175 }), time: 20, pop: 0, los: 140, garrisonCap: 0, age: 2, name: 'Stable' },
  watchtower: { hp: 280, r: 22, tiles: 3, foot: 24, cost: cost({ wood: 150 }), time: 18, pop: 0, los: 260, garrisonCap: 5, age: 2, name: 'Watchtower' },
  lumbercamp: { hp: 200, r: 26, tiles: 4, foot: 32, cost: cost({ wood: 75 }), time: 13, pop: 0, los: 140, garrisonCap: 0, name: 'Lumber Camp' },
  miningcamp: { hp: 200, r: 26, tiles: 4, foot: 32, cost: cost({ wood: 75 }), time: 13, pop: 0, los: 140, garrisonCap: 0, name: 'Mining Camp' },
  mill: { hp: 200, r: 26, tiles: 4, foot: 32, cost: cost({ wood: 60 }), time: 12, pop: 0, los: 140, garrisonCap: 0, name: 'Mill' },
  church: { hp: 320, r: 60, tiles: 8, foot: 64, art: 32, cost: cost({ wood: 150, gold: 50 }), time: 22, pop: 0, los: 160, garrisonCap: 0, age: 3, name: 'Church' },
  ministry: { hp: 350, r: 51, tiles: 8, foot: 64, art: 40, cost: cost({ wood: 175, gold: 75 }), time: 24, pop: 0, los: 160, garrisonCap: 0, age: 3, name: 'Ministry' },
  siegeworkshop: { hp: 350, r: 53, tiles: 8, foot: 64, art: 48, cost: cost({ wood: 200 }), time: 22, pop: 0, los: 140, garrisonCap: 0, age: 3, name: 'Siege Workshop' },
  wall: { hp: 220, r: 8, tiles: 1, foot: 8, cost: cost({ wood: 3 }), time: 4, pop: 0, los: 60, garrisonCap: 0, name: 'Palisade Wall' },
  gate: { hp: 300, r: 15, tiles: 2, foot: 16, cost: cost({ wood: 20 }), time: 8, pop: 0, los: 80, garrisonCap: 0, name: 'Palisade Gate' },
  // Landmarks — building one IS the age-up; it dawns when the walls rise
  abbeymill: { hp: 400, r: 60, tiles: 8, foot: 64, art: 32, cost: cost({ food: 200, wood: 100 }), time: 45, pop: 0, los: 160, garrisonCap: 0, name: 'Abbey Mill' },
  kingsbarracks: { hp: 500, r: 53, tiles: 8, foot: 64, art: 48, cost: cost({ food: 150, wood: 150 }), time: 45, pop: 0, los: 160, garrisonCap: 0, name: "King's Barracks" },
  guildhall: { hp: 500, r: 55, tiles: 8, foot: 64, art: 40, cost: cost({ food: 300, gold: 100 }), time: 55, pop: 0, los: 160, garrisonCap: 0, name: 'Guild Hall' },
  whitekeep: { hp: 900, r: 60, tiles: 8, foot: 64, art: 32, cost: cost({ food: 250, stone: 200 }), time: 60, pop: 0, los: 300, garrisonCap: 8, name: 'The White Keep' },
  chamberofcommerce: { hp: 400, r: 51, tiles: 8, foot: 64, art: 40, cost: cost({ food: 200, wood: 100 }), time: 45, pop: 0, los: 160, garrisonCap: 0, name: 'Chamber of Commerce' },
  cavalryschool: { hp: 500, r: 53, tiles: 8, foot: 64, art: 48, cost: cost({ food: 150, wood: 150 }), time: 45, pop: 0, los: 160, garrisonCap: 0, name: 'School of Cavalry' },
  royalvineyard: { hp: 500, r: 55, tiles: 8, foot: 64, art: 40, cost: cost({ food: 300, gold: 100 }), time: 55, pop: 0, los: 160, garrisonCap: 0, name: 'Royal Vineyard' },
  redpalace: { hp: 900, r: 60, tiles: 8, foot: 64, art: 32, cost: cost({ food: 250, stone: 200 }), time: 60, pop: 0, los: 300, garrisonCap: 8, name: 'The Red Palace' },
}

// ---- landmarks: the age-up IS a building, eco path or military path ----
export type LandmarkKind = 'abbeymill' | 'kingsbarracks' | 'guildhall' | 'whitekeep'
  | 'chamberofcommerce' | 'cavalryschool' | 'royalvineyard' | 'redpalace'
export const LANDMARKS: Record<LandmarkKind, { civ: CivId; toAge: number; path: 'eco' | 'military'; blurb: string }> = {
  abbeymill: { civ: 'english', toAge: 2, path: 'eco', blurb: 'A mill whose tithes trickle in food on their own' },
  kingsbarracks: { civ: 'english', toAge: 2, path: 'military', blurb: 'Musters spearmen for nearly half the price' },
  guildhall: { civ: 'english', toAge: 3, path: 'eco', blurb: 'Merchants bring a steady trickle of gold' },
  whitekeep: { civ: 'english', toAge: 3, path: 'military', blurb: 'A stone fortress that rains arrows on raiders' },
  chamberofcommerce: { civ: 'french', toAge: 2, path: 'eco', blurb: 'Merchants bring a steady trickle of gold' },
  cavalryschool: { civ: 'french', toAge: 2, path: 'military', blurb: 'Musters knights at a chevalier’s discount' },
  royalvineyard: { civ: 'french', toAge: 3, path: 'eco', blurb: 'The harvest trickles in food on its own' },
  redpalace: { civ: 'french', toAge: 3, path: 'military', blurb: 'A brick fortress that rains bolts on raiders' },
}
// eco landmarks earn their keep on their own: which resource trickles in
export const LANDMARK_TRICKLES: Partial<Record<LandmarkKind, { res: ResKind; rate: number }>> = {
  abbeymill: { res: 'food', rate: 0.4 },
  guildhall: { res: 'gold', rate: 0.4 },
  chamberofcommerce: { res: 'gold', rate: 0.35 }, // gold a whole age early, a touch slower
  royalvineyard: { res: 'food', rate: 0.5 },
}
export const LANDMARK_TRICKLE = 0.4 // (kept for reference; see LANDMARK_TRICKLES)
export const KEEP_RANGE = 260
export const KEEP_VOLLEY = 1.5
export const KEEP_DMG = 5
export const KEEP_BASE_ARROWS = 2
// the cheap spear levy at the King's Barracks
export const LEVY_SPEAR_COST = cost({ food: 20, wood: 10 })
export const LEVY_SPEAR_TIME = 6
// the chevalier's discount at the School of Cavalry
export const SCHOOL_KNIGHT_COST = cost({ food: 50, gold: 60 })
export const SCHOOL_KNIGHT_TIME = 10

// ---- champions: one mighty upgrade per military hall, Castle Age ----
export type ChampId = 'infantry' | 'ranged' | 'cavalry'
export const CHAMPS: Record<ChampId, {
  name: string; blurb: string; at: Kind[]; kinds: Kind[]
  cost: Cost; time: number; hp: number; dmg: number
}> = {
  infantry: {
    name: 'Champion Infantry', blurb: 'Spearmen and swordsmen: +15 health, +3 damage',
    at: ['barracks', 'kingsbarracks'], kinds: ['spearman', 'swordsman'],
    cost: cost({ food: 150, gold: 100 }), time: 30, hp: 15, dmg: 3,
  },
  ranged: {
    name: 'Champion Longbows', blurb: 'Longbowmen: +10 health, +3 damage',
    at: ['archeryrange'], kinds: ['archer'],
    cost: cost({ wood: 100, gold: 150 }), time: 30, hp: 10, dmg: 3,
  },
  cavalry: {
    name: 'Champion Knights', blurb: 'Knights: +20 health, +3 damage',
    at: ['stable', 'cavalryschool'], kinds: ['knight'],
    cost: cost({ food: 150, gold: 150 }), time: 30, hp: 20, dmg: 3,
  },
}
export const NO_CHAMPS: Record<ChampId, boolean> = { infantry: false, ranged: false, cavalry: false }

export const RESOURCES: Record<string, { r: number; amount: number; gives: ResKind; name: string }> = {
  tree: { r: 16, amount: 60, gives: 'wood', name: 'Tree' },
  goldmine: { r: 34, amount: 500, gives: 'gold', name: 'Gold Mine' },
  berrybush: { r: 14, amount: 120, gives: 'food', name: 'Berry Bush' },
  stonequarry: { r: 30, amount: 350, gives: 'stone', name: 'Stone Quarry' },
  deer: { r: 11, amount: 90, gives: 'food', name: 'Deer' },
  croc: { r: 14, amount: 130, gives: 'food', name: 'Crocodile' },
}

// ---- economy techs: researched the honest way at their home buildings ----
export type TechId = 'steelaxes' | 'wheelbarrow' | 'minerspicks' | 'tithebarns' | 'sanctuary'
export const TECHS: Record<TechId, { name: string; blurb: string; at: Kind; cost: Cost; time: number }> = {
  steelaxes: { name: 'Steel Axes', blurb: 'Villagers chop wood 20% faster', at: 'lumbercamp', cost: cost({ food: 100, wood: 75 }), time: 30 },
  wheelbarrow: { name: 'Wheelbarrow', blurb: 'Villagers gather food 20% faster', at: 'mill', cost: cost({ food: 100, wood: 75 }), time: 30 },
  minerspicks: { name: "Miner's Picks", blurb: 'Villagers mine gold and stone 20% faster', at: 'miningcamp', cost: cost({ food: 100, wood: 75 }), time: 30 },
  // the ministry's faith techs — the quiet arts of the Castle Age
  tithebarns: { name: 'Tithe Barns', blurb: 'Enshrined relics also trickle food', at: 'ministry', cost: cost({ food: 150, gold: 100 }), time: 30 },
  sanctuary: { name: 'Sanctuary', blurb: 'Monks heal twice as fast, twice as far', at: 'ministry', cost: cost({ food: 100, gold: 100 }), time: 30 },
}
export const NO_TECHS: Record<TechId, boolean> = { steelaxes: false, wheelbarrow: false, minerspicks: false, tithebarns: false, sanctuary: false }

// ---- relics and the monks who carry them (Castle Age) ----
// A relic enshrined in a church or ministry tithes gold on its own;
// Tithe Barns adds a food tithe beside it.
export const RELIC_GOLD_RATE = 0.5
export const RELIC_FOOD_RATE = 0.25
export const MONK_HEAL_RATE = 1 // hp per tick to wounded friends nearby
export const MONK_HEAL_RADIUS = 70
export const MONK_HEAL_TICK = 1
export const SANCTUARY_HEAL_RATE = 2
export const SANCTUARY_HEAL_RADIUS = 110

// deer: shy little herds — hunt one down and its meat hauls home as food
export const DEER_HP = 24
export const DEER_STRIKE = 8 // a villager's hunting poke
export const DEER_AMBLE = 22
export const DEER_FLEE = 95
// crocodiles: they lurk at the water and bite whatever strays close.
// One villager loses that fight; three hunters end it in seconds.
export const CROC_HP = 100
export const CROC_DMG = 7
export const CROC_CD = 1.2
export const CROC_AGGRO = 70
export const CROC_LEASH = 135 // it gives up the chase before the meal is truly gone
export const CROC_SPEED = 46
// farms are steady but small: one pair of hands per field
export const FARM_CREW = 1
// how long a field takes to come round from sowing to harvest, while worked
export const FARM_CYCLE = 20

// counter bonuses: extra damage dealt by attacker kind against target kind.
// Scouts stand in for cavalry until the stable arrives; knights will slot in here.
export const DMG_BONUS: Partial<Record<Kind, Partial<Record<Kind, number>>>> = {
  spearman: { scout: 12, knight: 12 },
  archer: { spearman: 4 },
  knight: { mangonel: 12, trebuchet: 12 }, // cavalry rides down the war machines
}

// ---- the maps you can play on ----
// `seed: 0` is the handcrafted meadow the test suite lives on; anything else is
// a roll of the generator, and `seed: null` means roll a fresh one every game.
// Adding a map is a line here — the picker builds itself from this list.
export interface MapSpec {
  id: string
  name: string
  tag: string // the one-line label under the name
  blurb: string
  seed: number | null
}
export const MAPS: MapSpec[] = [
  {
    id: 'crocodile-crossing',
    name: 'Crocodile Crossing',
    tag: 'The home meadow',
    blurb: 'A winding stream with three shallow fords, crocodiles basking in the reeds, and woods packed tight enough to wall a lane shut.',
    seed: 0,
  },
  {
    id: 'wanderers-roll',
    name: "Wanderer's Roll",
    tag: 'A fresh map every game',
    blurb: 'Four times the land, villages in opposite corners, and each one dealt its own berries, woods, gold and stone.',
    seed: null,
  },
]

// ---- banners: the companies your host is split into ----
// Each company is known by the beast it wears, not by a flag: a flag now means
// a muster point. Everything raised musters under the Lion unless a military
// hall sends its recruits elsewhere. Monks swear to no beast unless asked.
export type Beast = 'lion' | 'stag' | 'boar' | 'wolf'
export interface BannerSpec { name: string; short: string; beast: Beast; color: string; edge: string }
export const BANNERS: BannerSpec[] = [
  { name: 'The Lion', short: 'Lion', beast: 'lion', color: '#6D9DC5', edge: '#4E7EA6' },
  { name: 'The Stag', short: 'Stag', beast: 'stag', color: '#C9A227', edge: '#A07D13' },
  { name: 'The Boar', short: 'Boar', beast: 'boar', color: '#6E9B57', edge: '#527A3E' },
  { name: 'The Wolf', short: 'Wolf', beast: 'wolf', color: '#8A6FA8', edge: '#6B5286' },
]
export const BANNER_MAX = BANNERS.length
export const LION_BANNER = 0 // the host you start with, and where every recruit goes by default
// who may swear to a banner at all: the battle line, plus monks by invitation.
// Villagers and scouts never do — they have their own work.
export function canBanner(e: Ent): boolean {
  return e.kind === 'spearman' || e.kind === 'swordsman' || e.kind === 'archer' ||
    e.kind === 'knight' || e.kind === 'mangonel' || e.kind === 'trebuchet' || e.kind === 'monk'
}
// soldiers and engines always ride under some banner; only monks may stand outside one
export function mustBanner(e: Ent): boolean { return canBanner(e) && e.kind !== 'monk' }

// ---- siege engines (Castle Age) ----
export const MANGONEL_SPLASH = 42 // the boulder shatters — everything close is hit
export const MANGONEL_MIN_RANGE = 60 // can't drop a shot on its own toes: get close and it's helpless
export const MANGONEL_ARC = 46
export const MANGONEL_BOULDER_SPEED = 190
export const TREB_SETUP = 3 // seconds standing still before the frame is planted
export const TREB_SPLASH = 30
export const TREB_ARC = 95
export const TREB_BOULDER_SPEED = 150

// where each carried resource may be dropped off
export const DROPOFFS: Record<ResKind, Kind[]> = {
  wood: ['towncenter', 'lumbercamp'],
  food: ['towncenter', 'mill', 'abbeymill'],
  gold: ['towncenter', 'miningcamp'],
  stone: ['towncenter', 'miningcamp'],
}

// what to look for when the current source runs dry
export const SOURCE_OF: Record<ResKind, Kind> = {
  wood: 'tree', food: 'berrybush', gold: 'goldmine', stone: 'stonequarry',
}

export const FOG_CELL = 32
export const TILE = 16 // the build grid: buildings cover whole tiles of this size
export const PLACE_SNAP = TILE // (kept as the old name; walls step along it too)
// where a building of this many tiles may sit, so its edges land on grid lines:
// even footprints centre on a line, odd ones on a cell's middle
export function snapTiles(x: number, y: number, tiles: number): { x: number; y: number } {
  const off = (tiles % 2) * TILE / 2
  return {
    x: Math.round((x - off) / TILE) * TILE + off,
    y: Math.round((y - off) / TILE) * TILE + off,
  }
}
export const AGE_NAMES = ['', 'Dark Age', 'Feudal Age', 'Castle Age']
export const CARRY_CAP = 8
export const GATHER_TICK = 0.7
export const POP_MAX = 50
// garrison defense
export const TC_RANGE = 190
export const TC_VOLLEY = 1.4
export const ARROW_DMG = 4
export const TOWER_RANGE = 200
export const TOWER_VOLLEY = 1.6
export const TOWER_DMG = 5
export const WORLD_W = 1920
export const WORLD_H = 1280
export const CAM_PAD = 90 // how far the camera may drift past the world edge

// The sim thinks in a flat top-down plane. The eye sits above and in front of
// it, so the view squashes the world's Y and lets sprites stand upright on the
// result — the whole 3/4 view is this one number. Nothing outside the renderer
// and screenToWorld() is allowed to care: pathing, placement and combat all
// stay honestly top-down, which is why tilting the camera didn't disturb them.
export const TILT = 0.55

export const TEAM_COLOR = [
  { main: '#6D9DC5', dark: '#4E7EA6', pale: '#A8C6E0' },
  { main: '#C4746B', dark: '#9E574F', pale: '#DBA49D' },
]

export function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay
  return Math.hypot(dx, dy)
}

export function isUnit(e: Ent): boolean {
  return e.kind === 'villager' || e.kind === 'swordsman' || e.kind === 'spearman' ||
    e.kind === 'archer' || e.kind === 'scout' || e.kind === 'knight' || e.kind === 'monk' ||
    e.kind === 'mangonel' || e.kind === 'trebuchet'
}
export function isSiege(e: Ent): boolean {
  return e.kind === 'mangonel' || e.kind === 'trebuchet'
}
export function isBuilding(e: Ent): boolean {
  return e.kind === 'towncenter' || e.kind === 'house' || e.kind === 'barracks' ||
    e.kind === 'archeryrange' || e.kind === 'stable' || e.kind === 'lumbercamp' ||
    e.kind === 'miningcamp' || e.kind === 'mill' ||
    e.kind === 'farm' || e.kind === 'watchtower' || e.kind === 'wall' || e.kind === 'gate' ||
    e.kind === 'church' || e.kind === 'ministry' || e.kind === 'siegeworkshop' ||
    e.kind === 'abbeymill' || e.kind === 'kingsbarracks' || e.kind === 'guildhall' || e.kind === 'whitekeep' ||
    e.kind === 'chamberofcommerce' || e.kind === 'cavalryschool' || e.kind === 'royalvineyard' || e.kind === 'redpalace'
}
export function isResource(e: Ent): boolean {
  return e.kind === 'tree' || e.kind === 'goldmine' || e.kind === 'berrybush' ||
    e.kind === 'stonequarry' || e.kind === 'deer' || e.kind === 'croc'
}
