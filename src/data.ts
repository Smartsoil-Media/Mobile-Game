// Shared types, stats and balance numbers for Bramblewick.

export type Team = 0 | 1
export const NEUTRAL = -1

export type Kind =
  | 'villager' | 'swordsman' | 'spearman' | 'archer' | 'scout' | 'knight'
  | 'towncenter' | 'house' | 'barracks' | 'archeryrange' | 'stable' | 'lumbercamp' | 'miningcamp' | 'mill' | 'farm' | 'watchtower' | 'wall' | 'gate'
  | 'abbeymill' | 'kingsbarracks' | 'guildhall' | 'whitekeep'
  | 'tree' | 'goldmine' | 'berrybush' | 'stonequarry' | 'deer' | 'crag'

export type Buildable = 'house' | 'farm' | 'mill' | 'barracks' | 'archeryrange' | 'stable' | 'watchtower' | 'wall' | 'gate' | 'lumbercamp' | 'miningcamp' | 'towncenter'
  | 'abbeymill' | 'kingsbarracks' | 'guildhall' | 'whitekeep'

export type ResKind = 'wood' | 'food' | 'gold' | 'stone'

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
  state?: 'idle' | 'move' | 'attackmove' | 'attack' | 'gather' | 'return' | 'build' | 'garrison'
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
  over: 'win' | 'lose' | null
  overT: number
  particles: Particle[]
  projectiles: Projectile[]
  arrowsFired: number
  fog: Fog
  visionT: number
  ai: { enabled: boolean; thinkT: number; attackSize: number; attacking: boolean }
  age: number[] // per team: 1 = Dark, 2 = Feudal, 3 = Castle (advanced by landmarks)
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
  started: boolean
  uiDirty: boolean
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
}

export const BUILDINGS: Record<string, {
  hp: number; r: number; foot: number; cost: Cost; time: number; pop: number; los: number
  garrisonCap: number; age?: number; name: string
}> = {
  towncenter: { hp: 800, r: 52, foot: 58, cost: cost({ wood: 200, stone: 150 }), time: 45, pop: 6, los: 200, garrisonCap: 10, age: 2, name: 'Town Hall' },
  house: { hp: 200, r: 26, foot: 28, cost: cost({ wood: 50 }), time: 12, pop: 5, los: 140, garrisonCap: 0, name: 'House' },
  farm: { hp: 120, r: 24, foot: 30, cost: cost({ wood: 60 }), time: 10, pop: 0, los: 140, garrisonCap: 0, name: 'Farm' },
  barracks: { hp: 350, r: 40, foot: 44, cost: cost({ wood: 150 }), time: 20, pop: 0, los: 140, garrisonCap: 0, name: 'Barracks' },
  archeryrange: { hp: 300, r: 38, foot: 44, cost: cost({ wood: 175 }), time: 20, pop: 0, los: 140, garrisonCap: 0, age: 2, name: 'Archery Range' },
  stable: { hp: 350, r: 38, foot: 44, cost: cost({ wood: 175 }), time: 20, pop: 0, los: 140, garrisonCap: 0, age: 2, name: 'Stable' },
  watchtower: { hp: 280, r: 22, foot: 22, cost: cost({ wood: 150 }), time: 18, pop: 0, los: 260, garrisonCap: 5, age: 2, name: 'Watchtower' },
  lumbercamp: { hp: 200, r: 26, foot: 28, cost: cost({ wood: 75 }), time: 13, pop: 0, los: 140, garrisonCap: 0, name: 'Lumber Camp' },
  miningcamp: { hp: 200, r: 26, foot: 28, cost: cost({ wood: 75 }), time: 13, pop: 0, los: 140, garrisonCap: 0, name: 'Mining Camp' },
  mill: { hp: 200, r: 26, foot: 28, cost: cost({ wood: 60 }), time: 12, pop: 0, los: 140, garrisonCap: 0, name: 'Mill' },
  wall: { hp: 220, r: 8, foot: 8, cost: cost({ wood: 3 }), time: 4, pop: 0, los: 60, garrisonCap: 0, name: 'Palisade Wall' },
  gate: { hp: 300, r: 15, foot: 16, cost: cost({ wood: 20 }), time: 8, pop: 0, los: 80, garrisonCap: 0, name: 'Palisade Gate' },
  // English landmarks — building one IS the age-up; it dawns when the walls rise
  abbeymill: { hp: 400, r: 30, foot: 34, cost: cost({ food: 200, wood: 100 }), time: 45, pop: 0, los: 160, garrisonCap: 0, name: 'Abbey Mill' },
  kingsbarracks: { hp: 500, r: 40, foot: 44, cost: cost({ food: 150, wood: 150 }), time: 45, pop: 0, los: 160, garrisonCap: 0, name: "King's Barracks" },
  guildhall: { hp: 500, r: 34, foot: 38, cost: cost({ food: 300, gold: 100 }), time: 55, pop: 0, los: 160, garrisonCap: 0, name: 'Guild Hall' },
  whitekeep: { hp: 900, r: 30, foot: 34, cost: cost({ food: 250, stone: 200 }), time: 60, pop: 0, los: 300, garrisonCap: 8, name: 'The White Keep' },
}

// ---- landmarks: the age-up IS a building, eco path or military path ----
export type LandmarkKind = 'abbeymill' | 'kingsbarracks' | 'guildhall' | 'whitekeep'
export const LANDMARKS: Record<LandmarkKind, { toAge: number; path: 'eco' | 'military'; blurb: string }> = {
  abbeymill: { toAge: 2, path: 'eco', blurb: 'A mill whose tithes trickle in food on their own' },
  kingsbarracks: { toAge: 2, path: 'military', blurb: 'Musters spearmen for nearly half the price' },
  guildhall: { toAge: 3, path: 'eco', blurb: 'Merchants bring a steady trickle of gold' },
  whitekeep: { toAge: 3, path: 'military', blurb: 'A stone fortress that rains arrows on raiders' },
}
export const LANDMARK_TRICKLE = 0.4 // food/gold per second from the eco landmarks
export const KEEP_RANGE = 260
export const KEEP_VOLLEY = 1.5
export const KEEP_DMG = 5
export const KEEP_BASE_ARROWS = 2
// the cheap spear levy at the King's Barracks
export const LEVY_SPEAR_COST = cost({ food: 20, wood: 10 })
export const LEVY_SPEAR_TIME = 6

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
    at: ['stable'], kinds: ['knight'],
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
}

// ---- economy techs: researched the honest way at their home buildings ----
export type TechId = 'steelaxes' | 'wheelbarrow' | 'minerspicks'
export const TECHS: Record<TechId, { name: string; blurb: string; at: Kind; cost: Cost; time: number }> = {
  steelaxes: { name: 'Steel Axes', blurb: 'Villagers chop wood 20% faster', at: 'lumbercamp', cost: cost({ food: 100, wood: 75 }), time: 30 },
  wheelbarrow: { name: 'Wheelbarrow', blurb: 'Villagers gather food 20% faster', at: 'mill', cost: cost({ food: 100, wood: 75 }), time: 30 },
  minerspicks: { name: "Miner's Picks", blurb: 'Villagers mine gold and stone 20% faster', at: 'miningcamp', cost: cost({ food: 100, wood: 75 }), time: 30 },
}
export const NO_TECHS: Record<TechId, boolean> = { steelaxes: false, wheelbarrow: false, minerspicks: false }

// deer: shy little herds — hunt one down and its meat hauls home as food
export const DEER_HP = 24
export const DEER_STRIKE = 8 // a villager's hunting poke
export const DEER_AMBLE = 22
export const DEER_FLEE = 95
// farms are steady but small: one pair of hands per field
export const FARM_CREW = 1

// counter bonuses: extra damage dealt by attacker kind against target kind.
// Scouts stand in for cavalry until the stable arrives; knights will slot in here.
export const DMG_BONUS: Partial<Record<Kind, Partial<Record<Kind, number>>>> = {
  spearman: { scout: 12, knight: 12 },
  archer: { spearman: 4 },
}

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
export const PLACE_SNAP = 16 // buildings snap to this grid so rows line up
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
    e.kind === 'archer' || e.kind === 'scout' || e.kind === 'knight'
}
export function isBuilding(e: Ent): boolean {
  return e.kind === 'towncenter' || e.kind === 'house' || e.kind === 'barracks' ||
    e.kind === 'archeryrange' || e.kind === 'stable' || e.kind === 'lumbercamp' ||
    e.kind === 'miningcamp' || e.kind === 'mill' ||
    e.kind === 'farm' || e.kind === 'watchtower' || e.kind === 'wall' || e.kind === 'gate' ||
    e.kind === 'abbeymill' || e.kind === 'kingsbarracks' || e.kind === 'guildhall' || e.kind === 'whitekeep'
}
export function isResource(e: Ent): boolean {
  return e.kind === 'tree' || e.kind === 'goldmine' || e.kind === 'berrybush' ||
    e.kind === 'stonequarry' || e.kind === 'deer'
}
