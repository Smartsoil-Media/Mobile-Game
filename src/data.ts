// Shared types, stats and balance numbers for Bramblewick.

export type Team = 0 | 1
export const NEUTRAL = -1

export type Kind =
  | 'villager' | 'swordsman'
  | 'towncenter' | 'house' | 'barracks'
  | 'tree' | 'goldmine'

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
  state?: 'idle' | 'move' | 'attackmove' | 'attack' | 'gather' | 'return' | 'build'
  tx?: number
  ty?: number
  targetId?: number
  resume?: { x: number; y: number } | null
  carry?: number
  carryRes?: 'wood' | 'gold'
  cd?: number
  gatherT?: number
  scanT?: number
  face?: number // -1 left, 1 right
  phase?: number
  // buildings
  complete?: boolean
  progress?: number
  queue?: { kind: Kind; t: number; total: number }[]
  // resources
  amount?: number
}

export interface Particle {
  x: number; y: number; vx: number; vy: number
  life: number; maxLife: number
  size: number; color: string
  kind: 'puff' | 'spark' | 'hit' | 'leaf'
}

export interface Game {
  ents: Ent[]
  byId: Map<number, Ent>
  nextId: number
  t: number
  speed: number
  res: { wood: number; gold: number }[]
  camera: { x: number; y: number; zoom: number }
  selection: number[]
  placing: 'house' | 'barracks' | null
  over: 'win' | 'lose' | null
  overT: number
  particles: Particle[]
  wave: { at: number; size: number; count: number }
  toasts: { text: string; t: number }[]
  hint: string
  hintStage: number
  started: boolean
  uiDirty: boolean
}

export interface Cost { wood: number; gold: number }

export const UNITS: Record<string, {
  hp: number; dmg: number; range: number; cd: number
  speed: number; aggro: number; cost: Cost; time: number; r: number; name: string
}> = {
  villager: { hp: 30, dmg: 3, range: 16, cd: 1.0, speed: 62, aggro: 0, cost: { wood: 50, gold: 0 }, time: 7, r: 10, name: 'Villager' },
  swordsman: { hp: 70, dmg: 9, range: 18, cd: 0.9, speed: 74, aggro: 130, cost: { wood: 0, gold: 50 }, time: 9, r: 11, name: 'Swordsman' },
}

export const BUILDINGS: Record<string, {
  hp: number; r: number; cost: Cost; time: number; pop: number; name: string
}> = {
  towncenter: { hp: 800, r: 52, cost: { wood: 0, gold: 0 }, time: 0, pop: 5, name: 'Town Hall' },
  house: { hp: 200, r: 26, cost: { wood: 50, gold: 0 }, time: 12, pop: 5, name: 'House' },
  barracks: { hp: 350, r: 40, cost: { wood: 150, gold: 0 }, time: 20, pop: 0, name: 'Barracks' },
}

export const RESOURCES: Record<string, { r: number; amount: number; gives: 'wood' | 'gold'; name: string }> = {
  tree: { r: 16, amount: 60, gives: 'wood', name: 'Tree' },
  goldmine: { r: 34, amount: 500, gives: 'gold', name: 'Gold Mine' },
}

export const CARRY_CAP = 8
export const GATHER_TICK = 0.7
export const POP_MAX = 25
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

export function isUnit(e: Ent): boolean { return e.kind === 'villager' || e.kind === 'swordsman' }
export function isBuilding(e: Ent): boolean { return e.kind === 'towncenter' || e.kind === 'house' || e.kind === 'barracks' }
export function isResource(e: Ent): boolean { return e.kind === 'tree' || e.kind === 'goldmine' }
