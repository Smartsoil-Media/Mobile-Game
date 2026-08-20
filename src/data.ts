// Shared types, stats and balance numbers for Bramblewick.

export type Team = 0 | 1
export const NEUTRAL = -1

export type Kind =
  | 'villager' | 'swordsman' | 'archer' | 'scout'
  | 'towncenter' | 'house' | 'barracks' | 'archeryrange' | 'lumbercamp' | 'miningcamp' | 'farm' | 'watchtower'
  | 'tree' | 'goldmine' | 'berrybush' | 'stonequarry'

export type Buildable = 'house' | 'farm' | 'barracks' | 'archeryrange' | 'watchtower' | 'lumbercamp' | 'miningcamp' | 'towncenter'

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
  face?: number // -1 left, 1 right
  heading?: number // radians, direction of last movement step
  stepped?: boolean // true if the unit actually walked this tick
  phase?: number
  // buildings
  complete?: boolean
  progress?: number
  queue?: { kind: Kind; t: number; total: number }[]
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
  over: 'win' | 'lose' | null
  overT: number
  particles: Particle[]
  projectiles: Projectile[]
  arrowsFired: number
  fog: Fog
  visionT: number
  ai: { enabled: boolean; thinkT: number; attackSize: number; attacking: boolean }
  toasts: { text: string; t: number }[]
  started: boolean
  uiDirty: boolean
}

export interface Cost { wood: number; food: number; gold: number; stone: number }
export const NO_COST: Cost = { wood: 0, food: 0, gold: 0, stone: 0 }
export function cost(c: Partial<Cost>): Cost { return { ...NO_COST, ...c } }

export const UNITS: Record<string, {
  hp: number; dmg: number; range: number; cd: number
  speed: number; aggro: number; cost: Cost; time: number; r: number; los: number; name: string
}> = {
  villager: { hp: 30, dmg: 3, range: 16, cd: 1.0, speed: 31, aggro: 0, cost: cost({ food: 50 }), time: 7, r: 10, los: 160, name: 'Villager' },
  swordsman: { hp: 70, dmg: 9, range: 18, cd: 0.9, speed: 37, aggro: 130, cost: cost({ food: 40, gold: 25 }), time: 9, r: 11, los: 180, name: 'Swordsman' },
  archer: { hp: 40, dmg: 6, range: 110, cd: 1.6, speed: 35, aggro: 150, cost: cost({ food: 30, gold: 35 }), time: 10, r: 10, los: 200, name: 'Archer' },
  scout: { hp: 45, dmg: 2, range: 14, cd: 1.0, speed: 58, aggro: 0, cost: cost({ food: 30, gold: 15 }), time: 8, r: 12, los: 280, name: 'Scout' },
}

export const BUILDINGS: Record<string, {
  hp: number; r: number; cost: Cost; time: number; pop: number; los: number
  garrisonCap: number; name: string
}> = {
  towncenter: { hp: 800, r: 52, cost: cost({ wood: 200, stone: 150 }), time: 45, pop: 6, los: 200, garrisonCap: 10, name: 'Town Hall' },
  house: { hp: 200, r: 26, cost: cost({ wood: 50 }), time: 12, pop: 5, los: 140, garrisonCap: 0, name: 'House' },
  farm: { hp: 120, r: 24, cost: cost({ wood: 60 }), time: 10, pop: 0, los: 140, garrisonCap: 0, name: 'Farm' },
  barracks: { hp: 350, r: 40, cost: cost({ wood: 150 }), time: 20, pop: 0, los: 140, garrisonCap: 0, name: 'Barracks' },
  archeryrange: { hp: 300, r: 38, cost: cost({ wood: 175 }), time: 20, pop: 0, los: 140, garrisonCap: 0, name: 'Archery Range' },
  watchtower: { hp: 280, r: 22, cost: cost({ wood: 150 }), time: 18, pop: 0, los: 260, garrisonCap: 5, name: 'Watchtower' },
  lumbercamp: { hp: 200, r: 26, cost: cost({ wood: 75 }), time: 13, pop: 0, los: 140, garrisonCap: 0, name: 'Lumber Camp' },
  miningcamp: { hp: 200, r: 26, cost: cost({ wood: 75 }), time: 13, pop: 0, los: 140, garrisonCap: 0, name: 'Mining Camp' },
}

export const RESOURCES: Record<string, { r: number; amount: number; gives: ResKind; name: string }> = {
  tree: { r: 16, amount: 60, gives: 'wood', name: 'Tree' },
  goldmine: { r: 34, amount: 500, gives: 'gold', name: 'Gold Mine' },
  berrybush: { r: 14, amount: 120, gives: 'food', name: 'Berry Bush' },
  stonequarry: { r: 30, amount: 350, gives: 'stone', name: 'Stone Quarry' },
}

// where each carried resource may be dropped off
export const DROPOFFS: Record<ResKind, Kind[]> = {
  wood: ['towncenter', 'lumbercamp'],
  food: ['towncenter'],
  gold: ['towncenter', 'miningcamp'],
  stone: ['towncenter', 'miningcamp'],
}

// what to look for when the current source runs dry
export const SOURCE_OF: Record<ResKind, Kind> = {
  wood: 'tree', food: 'berrybush', gold: 'goldmine', stone: 'stonequarry',
}

export const FOG_CELL = 32
export const CARRY_CAP = 8
export const GATHER_TICK = 0.7
export const POP_MAX = 25
// garrison defense
export const TC_RANGE = 190
export const TC_VOLLEY = 1.4
export const ARROW_DMG = 4
export const TOWER_RANGE = 200
export const TOWER_VOLLEY = 1.6
export const TOWER_DMG = 5
export const WORLD_W = 1920
export const WORLD_H = 1280

export const TEAM_COLOR = [
  { main: '#6D9DC5', dark: '#4E7EA6', pale: '#A8C6E0' },
  { main: '#C4746B', dark: '#9E574F', pale: '#DBA49D' },
]

export function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay
  return Math.hypot(dx, dy)
}

export function isUnit(e: Ent): boolean {
  return e.kind === 'villager' || e.kind === 'swordsman' || e.kind === 'archer' || e.kind === 'scout'
}
export function isBuilding(e: Ent): boolean {
  return e.kind === 'towncenter' || e.kind === 'house' || e.kind === 'barracks' ||
    e.kind === 'archeryrange' || e.kind === 'lumbercamp' || e.kind === 'miningcamp' ||
    e.kind === 'farm' || e.kind === 'watchtower'
}
export function isResource(e: Ent): boolean {
  return e.kind === 'tree' || e.kind === 'goldmine' || e.kind === 'berrybush' || e.kind === 'stonequarry'
}
