// Fixed-timestep simulation: unit state machines, combat, economy, enemy AI.
import {
  Game, Ent, Particle, UNITS, BUILDINGS, RESOURCES,
  CARRY_CAP, GATHER_TICK, WORLD_W, WORLD_H,
  dist, isUnit, isBuilding, isResource,
} from './data'
import { spawn, nearest, nearestDropoff, nearestEnemyUnit, nearestEnemyThing, pop, toast } from './world'

export function puff(g: Game, x: number, y: number, color: string, n = 4, kind: Particle['kind'] = 'puff'): void {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2
    const sp = kind === 'spark' ? 30 + Math.random() * 40 : 8 + Math.random() * 18
    g.particles.push({
      x: x + (Math.random() - 0.5) * 8, y: y + (Math.random() - 0.5) * 8,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (kind === 'puff' ? 14 : 6),
      life: 0, maxLife: kind === 'spark' ? 0.5 : 0.9 + Math.random() * 0.5,
      size: kind === 'spark' ? 2.5 : 5 + Math.random() * 4, color, kind,
    })
  }
}

function moveToward(e: Ent, tx: number, ty: number, speed: number, dt: number): boolean {
  const dx = tx - e.x, dy = ty - e.y
  const d = Math.hypot(dx, dy)
  if (d < 3) return true
  const step = Math.min(speed * dt, d)
  e.x += (dx / d) * step
  e.y += (dy / d) * step
  if (Math.abs(dx) > 1) e.face = dx > 0 ? 1 : -1
  return d - step < 3
}

function inRange(a: Ent, b: Ent, range: number): boolean {
  return dist(a.x, a.y, b.x, b.y) <= a.r + b.r + range
}

function attackTarget(g: Game, e: Ent, dt: number): void {
  const s = UNITS[e.kind]
  const t = e.targetId !== undefined ? g.byId.get(e.targetId) : undefined
  if (!t) {
    // target gone: resume attack-move or go idle
    if (e.resume) { e.state = 'attackmove'; e.tx = e.resume.x; e.ty = e.resume.y }
    else e.state = 'idle'
    e.targetId = undefined
    return
  }
  if (!inRange(e, t, s.range)) {
    moveToward(e, t.x, t.y, s.speed, dt)
    return
  }
  if (Math.abs(t.x - e.x) > 1) e.face = t.x > e.x ? 1 : -1
  if ((e.cd ?? 0) <= 0) {
    e.cd = s.cd
    t.hp -= s.dmg
    puff(g, t.x + (Math.random() - 0.5) * t.r, t.y - t.r * 0.4, '#FFF3D6', 3, 'hit')
    // defenders fight back: idle victims turn on their attacker
    if (isUnit(t) && (t.state === 'idle' || t.state === 'gather' || t.state === 'return') && t.kind === 'swordsman') {
      t.state = 'attack'; t.targetId = e.id
    }
  }
}

function updateVillager(g: Game, e: Ent, dt: number): void {
  const s = UNITS.villager
  switch (e.state) {
    case 'move': {
      if (moveToward(e, e.tx!, e.ty!, s.speed, dt)) e.state = 'idle'
      break
    }
    case 'gather': {
      const res = e.targetId !== undefined ? g.byId.get(e.targetId) : undefined
      if (!res || (res.amount ?? 0) <= 0) {
        // find another of the same kind nearby, else head home with what we carry
        const kind = res?.kind ?? (e.carryRes === 'gold' ? 'goldmine' : 'tree')
        const next = nearest(g, e.x, e.y, o => o.kind === kind && (o.amount ?? 0) > 0, 280)
        if (next) { e.targetId = next.id }
        else if ((e.carry ?? 0) > 0) e.state = 'return'
        else e.state = 'idle'
        break
      }
      if (!inRange(e, res, 6)) { moveToward(e, res.x, res.y, s.speed, dt); break }
      if (Math.abs(res.x - e.x) > 1) e.face = res.x > e.x ? 1 : -1
      e.gatherT = (e.gatherT ?? 0) + dt
      if (e.gatherT >= GATHER_TICK) {
        e.gatherT = 0
        const gives = RESOURCES[res.kind].gives
        if (e.carryRes !== gives) { e.carry = 0; e.carryRes = gives }
        const take = Math.min(1, res.amount!)
        res.amount! -= take
        e.carry = (e.carry ?? 0) + take
        puff(g, res.x, res.y - res.r * 0.6, gives === 'gold' ? '#F2CA5C' : '#A4C77E', 2, 'spark')
        if (res.amount! <= 0 && res.kind === 'tree') {
          puff(g, res.x, res.y - 10, '#7BA05B', 8, 'leaf')
          killEnt(g, res)
        }
        if ((e.carry ?? 0) >= CARRY_CAP) e.state = 'return'
      }
      break
    }
    case 'return': {
      const home = nearestDropoff(g, e)
      if (!home) { e.state = 'idle'; break }
      if (!inRange(e, home, 8)) { moveToward(e, home.x, home.y, s.speed, dt); break }
      if (e.team === 0 || e.team === 1) {
        const r = g.res[e.team] as any
        r[e.carryRes === 'gold' ? 'gold' : 'wood'] += e.carry ?? 0
        if (e.team === 0) g.uiDirty = true
      }
      e.carry = 0
      const res = e.targetId !== undefined ? g.byId.get(e.targetId) : undefined
      if (res && (res.amount ?? 0) > 0) e.state = 'gather'
      else {
        const kind = e.carryRes === 'gold' ? 'goldmine' : 'tree'
        const next = nearest(g, e.x, e.y, o => o.kind === kind && (o.amount ?? 0) > 0, 320)
        if (next) { e.targetId = next.id; e.state = 'gather' }
        else e.state = 'idle'
      }
      break
    }
    case 'build': {
      const site = e.targetId !== undefined ? g.byId.get(e.targetId) : undefined
      if (!site || site.complete) { e.state = 'idle'; e.targetId = undefined; break }
      if (!inRange(e, site, 10)) { moveToward(e, site.x, site.y, s.speed, dt); break }
      if (Math.abs(site.x - e.x) > 1) e.face = site.x > e.x ? 1 : -1
      const b = BUILDINGS[site.kind]
      site.progress = Math.min(1, (site.progress ?? 0) + dt / b.time)
      site.hp = Math.min(b.hp, site.hp + (b.hp * 0.9) * (dt / b.time))
      if (Math.random() < dt * 6) puff(g, site.x + (Math.random() - 0.5) * site.r, site.y - site.r * 0.5, '#E8DCC0', 1)
      if (site.progress >= 1) {
        site.complete = true
        site.hp = b.hp
        puff(g, site.x, site.y - site.r * 0.5, '#FBF3E4', 10)
        if (site.team === 0) {
          toast(g, `${b.name} finished!`)
          if (site.kind === 'barracks' && g.hintStage < 3) { g.hintStage = 3 }
        }
        e.state = 'idle'; e.targetId = undefined
      }
      break
    }
    case 'attack': attackTarget(g, e, dt); break
    default: { // idle
      // enemy flavor villagers keep their meadow busy
      if (e.team === 1) {
        const res = nearest(g, e.x, e.y, o => isResource(o) && (o.amount ?? 0) > 0, 500)
        if (res) { e.state = 'gather'; e.targetId = res.id }
      }
      break
    }
  }
}

function updateSoldier(g: Game, e: Ent, dt: number): void {
  const s = UNITS[e.kind]
  switch (e.state) {
    case 'move': {
      if (moveToward(e, e.tx!, e.ty!, s.speed, dt)) e.state = 'idle'
      break
    }
    case 'attackmove': {
      e.scanT = (e.scanT ?? 0) - dt
      if (e.scanT <= 0) {
        e.scanT = 0.25
        const foe = nearestEnemyThing(g, e, 150)
        if (foe) {
          e.resume = { x: e.tx!, y: e.ty! }
          e.state = 'attack'; e.targetId = foe.id
          break
        }
      }
      if (moveToward(e, e.tx!, e.ty!, s.speed, dt)) {
        // arrived at destination: hunt anything left nearby, else hold
        const foe = nearestEnemyThing(g, e, 260)
        if (foe) { e.resume = { x: e.tx!, y: e.ty! }; e.state = 'attack'; e.targetId = foe.id }
        else { e.state = 'idle'; e.resume = null }
      }
      break
    }
    case 'attack': attackTarget(g, e, dt); break
    default: { // idle: auto-engage nearby enemy units
      e.scanT = (e.scanT ?? 0) - dt
      if (e.scanT <= 0) {
        e.scanT = 0.3
        const foe = nearestEnemyUnit(g, e, s.aggro)
        if (foe) { e.state = 'attack'; e.targetId = foe.id; e.resume = null }
      }
      break
    }
  }
}

function updateBuilding(g: Game, e: Ent, dt: number): void {
  if (!e.complete || !e.queue) return
  const q = e.queue[0]
  if (!q) return
  q.t -= dt
  if (q.t <= 0) {
    e.queue.shift()
    const a = Math.random() * Math.PI * 2
    const d = e.r + 18
    const u = spawn(g, q.kind, e.team, e.x + Math.cos(a) * d, e.y + Math.abs(Math.sin(a)) * d + 6)
    puff(g, u.x, u.y, '#FBF3E4', 6)
    if (e.team === 0) {
      g.uiDirty = true
      if (q.kind === 'swordsman' && g.hintStage < 4) g.hintStage = 4
    }
  }
}

function killEnt(g: Game, e: Ent): void {
  const i = g.ents.indexOf(e)
  if (i >= 0) g.ents.splice(i, 1)
  g.byId.delete(e.id)
  const si = g.selection.indexOf(e.id)
  if (si >= 0) { g.selection.splice(si, 1); g.uiDirty = true }
}

function separation(g: Game): void {
  const units = g.ents.filter(isUnit)
  for (let i = 0; i < units.length; i++) {
    const a = units[i]
    for (let j = i + 1; j < units.length; j++) {
      const b = units[j]
      const dx = b.x - a.x, dy = b.y - a.y
      const d = Math.hypot(dx, dy)
      const min = a.r + b.r
      if (d > 0.001 && d < min) {
        const push = (min - d) / 2
        const nx = dx / d, ny = dy / d
        a.x -= nx * push; a.y -= ny * push
        b.x += nx * push; b.y += ny * push
      }
    }
    // push out of buildings and big resources
    for (const o of g.ents) {
      if (o === a || isUnit(o)) continue
      if (o.kind === 'tree') continue // walkable under canopies, keeps paths simple
      const dx = a.x - o.x, dy = a.y - o.y
      const d = Math.hypot(dx, dy)
      const min = a.r + o.r * 0.85
      if (d > 0.001 && d < min) {
        a.x += (dx / d) * (min - d)
        a.y += (dy / d) * (min - d)
      }
    }
    a.x = Math.max(16, Math.min(WORLD_W - 16, a.x))
    a.y = Math.max(16, Math.min(WORLD_H - 16, a.y))
  }
}

function enemyWaves(g: Game, dt: number): void {
  if (g.t < g.wave.at) {
    // pre-warn 15s ahead of the first couple of waves
    return
  }
  const barracks = g.ents.find(e => e.team === 1 && e.kind === 'barracks' && e.complete)
  const tc = g.ents.find(e => e.team === 1 && e.kind === 'towncenter')
  const src = barracks ?? tc
  if (!src) return
  const playerTC = g.ents.find(e => e.team === 0 && e.kind === 'towncenter')
  const target = playerTC ?? g.ents.find(e => e.team === 0)
  if (!target) return
  for (let i = 0; i < g.wave.size; i++) {
    const u = spawn(g, 'swordsman', 1, src.x + (Math.random() - 0.5) * 60, src.y + src.r + 14 + Math.random() * 30)
    u.state = 'attackmove'
    u.tx = target.x + (Math.random() - 0.5) * 80
    u.ty = target.y + (Math.random() - 0.5) * 80
  }
  g.wave.count++
  toast(g, g.wave.count === 1 ? 'Enemy raid! Defend your town!' : `Another raid is coming — ${g.wave.size} raiders!`)
  g.wave.at = g.t + 75
  g.wave.size = Math.min(7, g.wave.size + 1)
}

function updateHints(g: Game): void {
  let hint = ''
  if (g.hintStage === 0) hint = 'Tap a villager, then tap a tree to gather wood.'
  else if (g.hintStage === 1) hint = 'Good! Wood pays for buildings. Gold from the mine pays for soldiers.'
  else if (g.hintStage === 2) hint = 'Select a villager and build a Barracks.'
  else if (g.hintStage === 3) hint = 'Tap the Barracks to train swordsmen — raiders are coming!'
  else if (g.hintStage === 4) hint = 'Destroy the enemy Town Hall in the north-east to win!'
  if (hint !== g.hint) { g.hint = hint; g.uiDirty = true }
  // stage transitions driven by world state
  if (g.hintStage === 1 && g.t > 40) { g.hintStage = 2 }
  if (g.hintStage === 2 && g.ents.some(e => e.team === 0 && e.kind === 'barracks')) g.hintStage = 3
  if (g.hintStage === 4 && g.t > 60 && g.hint) { /* fades via ui timer */ }
}

export function update(g: Game, dt: number): void {
  if (g.over) { g.overT += dt; return }
  g.t += dt

  for (const e of g.ents) {
    if (isUnit(e)) {
      e.cd = Math.max(0, (e.cd ?? 0) - dt)
      if (e.kind === 'villager') updateVillager(g, e, dt)
      else updateSoldier(g, e, dt)
    } else if (isBuilding(e)) {
      updateBuilding(g, e, dt)
    }
  }

  separation(g)

  // deaths
  for (const e of [...g.ents]) {
    if ((isUnit(e) || isBuilding(e)) && e.hp <= 0) {
      puff(g, e.x, e.y - e.r * 0.4, isBuilding(e) ? '#C9B896' : '#F4E4C6', isBuilding(e) ? 14 : 7)
      killEnt(g, e)
    }
  }

  enemyWaves(g, dt)
  updateHints(g)

  // particles
  for (const p of g.particles) {
    p.life += dt
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.vx *= (1 - dt * 1.5)
    p.vy = p.kind === 'leaf' ? p.vy + 30 * dt : p.vy * (1 - dt * 1.5)
  }
  g.particles = g.particles.filter(p => p.life < p.maxLife)

  // toasts age out
  const before = g.toasts.length
  g.toasts = g.toasts.filter(t => g.t - t.t < 4)
  if (g.toasts.length !== before) g.uiDirty = true

  // win / lose
  const playerTC = g.ents.some(e => e.team === 0 && e.kind === 'towncenter')
  const enemyTC = g.ents.some(e => e.team === 1 && e.kind === 'towncenter')
  if (!enemyTC) { g.over = 'win'; g.uiDirty = true }
  else if (!playerTC) { g.over = 'lose'; g.uiDirty = true }
}
