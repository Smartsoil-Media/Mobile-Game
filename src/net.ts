// The command layer: every order a player gives, as data.
//
// In a solo game an order could just reach into the world and change it, and
// for a long time that is what happened. Two players cannot work that way. Both
// phones run the whole simulation, and they stay in step only if they apply
// exactly the same orders on exactly the same tick — so an order has to be
// something you can put on the wire, not a closure that has already run.
//
// Hence: the dock builds a Cmd and hands it to `issue`. Solo, that applies it
// on the spot and nothing has changed. Networked, it goes into the schedule for
// a turn a little way ahead, travels to the other phone, and both machines run
// it together when that turn comes round.
import { Game, Ent, Buildable, Kind, Formation, ChampId, TechId, Pt } from './data'
import {
  commandMove, commandAttack, commandBuild, tryPlaceBuilding, tryPlaceWall,
  sendVillagerToResource, raiseBanner, plantMuster, clearMuster, commandGather,
} from './input'
import { trainAt, researchAt, ringBell, openDoors } from './world'
import { update } from './sim'
import { checksum } from './data'

/** Orders to a handful of units. */
export interface UnitCmd {
  t: 'unit'
  p: number
  ids: number[]
  v: 'move' | 'attack' | 'gather' | 'build' | 'garrison' | 'relic' | 'enshrine'
  x?: number
  y?: number
  target?: number
}
/** Something asked of one of your buildings. */
export interface BldgCmd {
  t: 'bldg'
  p: number
  b: number
  v: 'train' | 'research' | 'bell' | 'doors' | 'recruit'
  kind?: Kind
  id?: ChampId | TechId
  banner?: number
}
/** Putting a building down, and the villagers sent to raise it. */
export interface PlaceCmd {
  t: 'place'
  p: number
  kind: Buildable
  x: number
  y: number
  angle?: number
  ids: number[]
}
/** A dragged line of palisade, which is one order however many posts it is. */
export interface WallCmd { t: 'wall'; p: number; a: Pt; b: Pt; ids: number[] }
/** Your own host's habits: how it marches, where it gathers, who it rides for. */
export interface HostCmd {
  t: 'host'
  p: number
  v: 'formation' | 'muster' | 'unmuster' | 'raise'
  banner?: number
  f?: Formation
  x?: number
  y?: number
}
/** Put an idle villager on a resource — the pill at the top of the screen. */
export interface WorkCmd { t: 'work'; p: number; res: 'wood' | 'food' | 'gold' | 'stone' }

export type Cmd = UnitCmd | BldgCmd | PlaceCmd | WallCmd | HostCmd | WorkCmd

// ---- the wire ----

/** Set by the lobby once a match is live. Solo leaves it null and nothing changes. */
export interface Link {
  /** Hand a turn's worth of our orders to the other player. */
  send(turn: number, cmds: Cmd[], sum: number): void
  /** Orders they have sent us, by turn. */
  inbox: Map<number, { cmds: Cmd[]; sum: number }>
  /** Their seat, so we can tell our orders from theirs. */
  them: number
  dropped: boolean
}

// A tap-off for the playtest: every order raised, so a test can check they all
// survive a trip through JSON. An order that cannot be written down cannot be
// sent, and would work in a solo game right up until the first match.
let recording: Cmd[] | null = null
export function record(on: boolean): Cmd[] {
  const out = recording ?? []
  recording = on ? [] : null
  return out
}

let link: Link | null = null
export function setLink(l: Link | null): void { link = l }
export function linked(): boolean { return link !== null }

// How far ahead orders are scheduled. Two turns of grace means a packet has a
// whole turn to cross before the tick it is needed on, which is what lets both
// machines run smoothly rather than stopping dead on every order.
export const TURN_TICKS = 6 // 200ms at 30Hz
export const TURN_LEAD = 2

/** Orders waiting for their turn to come round, ours and theirs alike. */
const schedule = new Map<number, Cmd[]>()
let pending: Cmd[] = [] // ours, for the turn currently being filled
const filed = new Set<number>() // turns whose incoming packet we have already used
const mySums = new Map<number, number>() // our fingerprint at the top of each turn

let tick = 0
let sentThrough = -1
let stalledSince = 0
let desync: number | null = null // the turn the two worlds parted, if they did
export function desyncedAt(): number | null { return desync }
export function linkDropped(): boolean { return link?.dropped ?? false }

export function resetNet(): void {
  schedule.clear()
  filed.clear()
  mySums.clear()
  pending = []
  tick = 0
  sentThrough = -1
  stalledSince = 0
  desync = null
}

export function matchTick(): number { return tick }
export function matchTurn(): number { return Math.floor(tick / TURN_TICKS) }
/** How long we have been waiting on the other player, in seconds. */
export function stalledFor(now: number): number {
  return stalledSince ? (now - stalledSince) / 1000 : 0
}

/**
 * Give an order. Solo it happens now; in a match it happens on the same tick
 * for both players, a couple of turns from now.
 */
export function issue(g: Game, c: Cmd): void {
  if (recording) recording.push(c)
  if (!link) { applyCmd(g, c); return }
  pending.push(c)
}

/** The orders this turn is carrying, ours and theirs, in a fixed order. */
export function turnCmds(turn: number): Cmd[] {
  return schedule.get(turn) ?? []
}

export function takePending(): Cmd[] {
  const out = pending
  pending = []
  return out
}

/** File a turn's orders — from either player — into the schedule. */
export function fileTurn(turn: number, cmds: Cmd[], from: number): void {
  const slot = schedule.get(turn) ?? []
  // Ours always ahead of theirs, on both machines, so the two lists are built
  // in the same order and the world cannot fork on ordering alone.
  if (from === 0) slot.unshift(...cmds)
  else slot.push(...cmds)
  schedule.set(turn, slot)
}

export function forgetTurn(turn: number): void { schedule.delete(turn) }

/**
 * One tick of a match, or of a solo game. Returns false when we cannot step
 * because the other player's orders for this turn have not arrived — the
 * caller simply doesn't advance, and tries again next frame.
 *
 * Time is cut into turns of TURN_TICKS. At the top of each turn we seal
 * whatever we have been asked to do, send it off for a turn TURN_LEAD ahead,
 * and run the orders that were sealed for the turn now starting. That lead is
 * what lets a packet cross the wire without either machine stopping dead.
 */
export function stepOne(g: Game, step: number, now: number): boolean {
  if (!link) { update(g, step); tick++; return true }
  const turn = Math.floor(tick / TURN_TICKS)
  if (tick % TURN_TICKS === 0) {
    // seal and send our orders for a turn a little way ahead
    const target = turn + TURN_LEAD
    if (target > sentThrough) {
      const mine = takePending()
      const sum = checksum(g)
      mySums.set(turn, sum)
      fileTurn(target, mine, g.me)
      link.send(target, mine, sum)
      sentThrough = target
    }
    // and wait for theirs before running this one
    if (turn >= TURN_LEAD) {
      const packet = link.inbox.get(turn)
      if (!packet) {
        if (!stalledSince) stalledSince = now
        return false
      }
      stalledSince = 0
      if (!filed.has(turn)) {
        filed.add(turn)
        fileTurn(turn, packet.cmds, link.them)
        // Their fingerprint was taken at the top of turn (turn - TURN_LEAD),
        // which is a moment we also have a note of. If those disagree the two
        // worlds have already parted and nothing after this is worth playing.
        const at = turn - TURN_LEAD
        const ours = mySums.get(at)
        if (desync === null && ours !== undefined && packet.sum !== ours) desync = at
        mySums.delete(at)
        link.inbox.delete(turn)
      }
    }
    for (const c of turnCmds(turn)) applyCmd(g, c)
    forgetTurn(turn)
  }
  update(g, step)
  tick++
  return true
}

// ---- applying an order ----

const ents = (g: Game, ids: number[], p: number): Ent[] =>
  ids.map(i => g.byId.get(i)).filter((e): e is Ent => !!e && e.team === p)

/**
 * Carry out an order. Runs identically on both machines — which is why every
 * check lives here rather than in the dock that raised it, and why anything the
 * player is *told* is gated on the order being theirs.
 */
export function applyCmd(g: Game, c: Cmd): void {
  const mine = c.p === g.me
  switch (c.t) {
    case 'unit': {
      const us = ents(g, c.ids, c.p)
      if (!us.length) return
      if (c.v === 'move' && c.x !== undefined && c.y !== undefined) commandMove(g, us, c.x, c.y)
      else if (c.v === 'attack' && c.target !== undefined) {
        const tgt = g.byId.get(c.target)
        if (tgt) commandAttack(g, us, tgt)
      } else if (c.v === 'build' && c.target !== undefined) {
        const tgt = g.byId.get(c.target)
        if (tgt) commandBuild(g, us, tgt)
      } else if (c.v === 'gather' && c.target !== undefined) {
        const tgt = g.byId.get(c.target)
        if (tgt) commandGather(g, us, tgt)
      } else if (c.v === 'garrison' || c.v === 'relic' || c.v === 'enshrine') {
        if (c.target === undefined) return
        const tgt = g.byId.get(c.target)
        if (!tgt) return
        for (const u of us) {
          if (c.v === 'relic' && u.relicId !== undefined) continue // his hands are full
          if (c.v === 'enshrine' && u.relicId === undefined) continue // nothing to lay down
          u.state = c.v === 'garrison' ? 'garrison' : c.v === 'relic' ? 'fetchrelic' : 'enshrine'
          u.targetId = tgt.id
        }
      }
      return
    }
    case 'bldg': {
      const b = g.byId.get(c.b)
      if (!b || b.team !== c.p) return
      if (c.v === 'train' && c.kind) trainAt(g, b, c.kind, mine)
      else if (c.v === 'research' && c.id) researchAt(g, b, c.id, mine)
      else if (c.v === 'bell') ringBell(g, b)
      else if (c.v === 'doors') openDoors(g, b)
      else if (c.v === 'recruit' && c.banner !== undefined) b.recruitBanner = c.banner
      g.uiDirty = true
      return
    }
    case 'place':
      tryPlaceBuilding(g, c.kind, c.x, c.y, c.p, c.ids, c.angle, mine)
      return
    case 'wall':
      tryPlaceWall(g, c.a, c.b, c.p, c.ids, mine)
      return
    case 'work':
      sendVillagerToResource(g, c.res, c.p, mine)
      return
    case 'host': {
      if (c.v === 'formation' && c.banner !== undefined && c.f) g.formation[c.p][c.banner] = c.f
      else if (c.v === 'muster' && c.banner !== undefined && c.x !== undefined && c.y !== undefined) {
        plantMuster(g, c.banner, c.x, c.y, c.p, mine)
      } else if (c.v === 'unmuster' && c.banner !== undefined) clearMuster(g, c.banner, c.p, mine)
      else if (c.v === 'raise') raiseBanner(g, [], c.p, mine)
      g.uiDirty = true
      return
    }
  }
}
