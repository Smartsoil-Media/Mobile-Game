// DOM HUD: resource pills, icon command dock, toasts, overlays.
import {
  Game, Ent, Buildable, Cost, ResKind, ChampId, LandmarkKind, UNITS, BUILDINGS,
  CHAMPS, LANDMARKS, LEVY_SPEAR_COST, LEVY_SPEAR_TIME, AGE_NAMES,
} from './data'
import { pop, canAfford, pay, toast, ringBell, openDoors, gatherResOf, wallLinePoints } from './world'
import { selectArmy, selectUnitsOfKind, tryPlaceBuilding, snapPlace, sendVillagerToResource, cycleIdleVillager } from './input'
import { drawTC, drawHouse, drawBarracks, drawLumberCamp, drawMiningCamp, drawMill, drawStable, drawFarm, drawWatchtower, drawArcheryRange, drawWall, drawGate, drawVillager, drawSwordsman, drawSpearman, drawArcher, drawScout, drawKnight, drawAbbeyMill, drawKingsBarracks, drawGuildhall, drawWhiteKeep } from './sprites'

const ICON = {
  wood: `<svg viewBox="0 0 24 24" width="17" height="17"><rect x="3" y="9" width="15" height="7" rx="3.5" fill="#8B6A4A"/><circle cx="18" cy="12.5" r="3.5" fill="#C89B6E"/><circle cx="18" cy="12.5" r="1.6" fill="#8B6A4A"/><path d="M6 11.5h7M6 14h5" stroke="#6F5238" stroke-width="1.2" stroke-linecap="round"/></svg>`,
  gold: `<svg viewBox="0 0 24 24" width="17" height="17"><circle cx="12" cy="12" r="8" fill="#E9B44C"/><circle cx="12" cy="12" r="5.4" fill="#F5D584"/><path d="M12 8.5v7M9.8 10.4h3.4a1.7 1.7 0 0 1 0 3.4H10" stroke="#B8842E" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>`,
  pop: `<svg viewBox="0 0 24 24" width="17" height="17"><circle cx="12" cy="8" r="4.2" fill="#F6CFA0"/><path d="M4.5 20c.8-4.4 3.9-6.5 7.5-6.5s6.7 2.1 7.5 6.5z" fill="#6D9DC5"/></svg>`,
  food: `<svg viewBox="0 0 24 24" width="17" height="17"><circle cx="9" cy="13" r="5" fill="#C9525E"/><circle cx="16" cy="12" r="4.4" fill="#B23F4C"/><circle cx="10.5" cy="11.5" r="1.5" fill="#E58F8F"/><path d="M12 8c1-2.5 3-3.5 4.5-3.5" stroke="#75A055" stroke-width="2" stroke-linecap="round" fill="none"/><ellipse cx="17.5" cy="5" rx="2.6" ry="1.6" fill="#8CB56A" transform="rotate(-20 17.5 5)"/></svg>`,
  stone: `<svg viewBox="0 0 24 24" width="17" height="17"><path d="M4 16 7 8.5 13 6l6 4-1 7z" fill="#A8A395"/><path d="M7 8.5 13 6l3 2.5-5.5 2z" fill="#D3CEC1"/><path d="M10.5 10.5 16 8.5l3 1.5-1 7-7.5-1z" fill="#BDB8AA"/></svg>`,
  sword: `<svg viewBox="0 0 24 24" width="20" height="20"><path d="M5 19 15.5 8.5M15.5 8.5 19 5l-1 4.5L14.5 13" stroke="#FBF3E4" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M7.5 14.5l2 2M5 19l-1.2 1.2" stroke="#E9B44C" stroke-width="2.2" stroke-linecap="round"/></svg>`,
  economy: `<svg viewBox="0 0 24 24" width="34" height="34"><circle cx="12" cy="12" r="11.5" fill="#FBF3E4"/><path d="M12 19V8M12 19c0-3-2.5-4.5-5-4.5M12 19c0-3 2.5-4.5 5-4.5" stroke="#8B6A4A" stroke-width="1.6" stroke-linecap="round" fill="none"/><ellipse cx="12" cy="6.5" rx="2" ry="3" fill="#E9B44C"/><ellipse cx="8.4" cy="9" rx="1.8" ry="2.6" fill="#E9B44C" transform="rotate(-28 8.4 9)"/><ellipse cx="15.6" cy="9" rx="1.8" ry="2.6" fill="#E9B44C" transform="rotate(28 15.6 9)"/></svg>`,
  military: `<svg viewBox="0 0 24 24" width="34" height="34"><circle cx="12" cy="12" r="11.5" fill="#FBF3E4"/><path d="M6.5 17.5 16 8M17.5 17.5 8 8" stroke="#AEB4BF" stroke-width="2.4" stroke-linecap="round"/><path d="M15 6.5 17.5 5.5 16.5 8M9 6.5 6.5 5.5 7.5 8" fill="#AEB4BF"/><path d="M6.5 17.5l-1.6 1.6M17.5 17.5l1.6 1.6" stroke="#E9B44C" stroke-width="2.6" stroke-linecap="round"/></svg>`,
  swordspear: `<svg viewBox="0 0 24 24" width="34" height="34"><circle cx="12" cy="12" r="11.5" fill="#FBF3E4"/><path d="M6 18 15 9" stroke="#C7CCD4" stroke-width="2.4" stroke-linecap="round"/><path d="M15 9l2.5-3.5L18.5 9z" fill="#C7CCD4"/><path d="M9.2 15.2l-1.8-1.8M6 18l-1.4 1.4" stroke="#E9B44C" stroke-width="2.4" stroke-linecap="round"/><path d="M18 18 8.5 8.5" stroke="#8B6A4A" stroke-width="2.2" stroke-linecap="round"/><path d="M8.5 8.5 5.5 5.5l1.2 3.8 2.6-.1z" fill="#AEB4BF"/></svg>`,
  target: `<svg viewBox="0 0 24 24" width="34" height="34"><circle cx="12" cy="12" r="11.5" fill="#FBF3E4"/><circle cx="12" cy="12" r="8.5" fill="#E8C97A"/><circle cx="12" cy="12" r="6" fill="#FBF3E4"/><circle cx="12" cy="12" r="3.6" fill="#C9525E"/><circle cx="12" cy="12" r="1.4" fill="#FBF3E4"/><path d="M12.5 11.5 18 6" stroke="#6F5238" stroke-width="1.8" stroke-linecap="round"/><path d="M18 6l.8-2.3L16.5 4.6z" fill="#8B6A4A"/></svg>`,
  laurel: `<svg viewBox="0 0 24 24" width="30" height="30"><circle cx="12" cy="12" r="11.5" fill="#FBF3E4"/><path d="M12 18.5V7" stroke="#8B6A4A" stroke-width="1.6" stroke-linecap="round"/><path d="M12 17c-4.5-.5-6.5-3-6.8-6.2C8 11 10.5 12.5 12 15M12 17c4.5-.5 6.5-3 6.8-6.2C16 11 13.5 12.5 12 15" fill="#75A055"/><circle cx="12" cy="6" r="2.2" fill="#E9B44C"/></svg>`,
  crown: `<svg viewBox="0 0 24 24" width="34" height="34"><circle cx="12" cy="12" r="11.5" fill="#FBF3E4"/><path d="M5.5 15.5 4.5 7.5l3.8 2.8L12 5.5l3.7 4.8 3.8-2.8-1 8z" fill="#E9B44C"/><path d="M5.5 15.5h13v2.4a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" fill="#B8842E"/><circle cx="12" cy="12.4" r="1.3" fill="#C9525E"/><circle cx="8.2" cy="13" r="0.9" fill="#6D9DC5"/><circle cx="15.8" cy="13" r="0.9" fill="#6D9DC5"/></svg>`,
  lock: `<svg class="lockb" viewBox="0 0 24 24" width="14" height="14"><rect x="6" y="10" width="12" height="9" rx="2.5" fill="#5A4632"/><path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" stroke="#5A4632" stroke-width="2.2" fill="none"/><circle cx="12" cy="14.5" r="1.6" fill="#FBF3E4"/></svg>`,
  bell: `<svg viewBox="0 0 24 24" width="30" height="30"><circle cx="12" cy="12" r="11.5" fill="#FBF3E4"/><path d="M12 4a6 6 0 0 1 6 6v4l1.5 2.5H4.5L6 14v-4a6 6 0 0 1 6-6z" fill="#B8842E"/><path d="M12 4a6 6 0 0 1 6 6v4H6v-4a6 6 0 0 1 6-6z" fill="#E9B44C"/><circle cx="12" cy="19.5" r="2" fill="#B8842E"/><circle cx="12" cy="3.5" r="1.5" fill="#8B6A4A"/></svg>`,
}

function el<T extends HTMLElement>(id: string): T { return document.getElementById(id) as T }

// Menu icons are miniatures of the real in-game sprites, drawn fresh onto
// tiny canvases so the build menu always matches the world's art.
function spriteIcon(kind: string, age = 2): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = 96
  c.className = 'sprite-icon'
  const ctx = c.getContext('2d')!
  const fake: any = {
    id: 0, kind, team: 0, x: 0, y: 0, r: 0, hp: 1, maxHp: 1, seed: 3,
    complete: true, state: 'idle', face: 1, phase: 0, carry: 0, amount: 60,
  }
  // scale fits the sprite's bounding box into the 48px icon; (cx, cy) is the
  // sprite's visual center in its own coordinates
  const conf: Record<string, { scale: number; cx: number; cy: number }> = {
    towncenter: { scale: 0.44, cx: 0, cy: -11 },
    farm: { scale: 0.85, cx: 2, cy: -1 },
    watchtower: { scale: 0.58, cx: 0, cy: -23 },
    archeryrange: { scale: 0.62, cx: -2, cy: -3 },
    stable: { scale: 0.6, cx: 0, cy: -5 },
    wall: { scale: 1.5, cx: 0, cy: -3 },
    gate: { scale: 1.05, cx: 0, cy: -2 },
    house: { scale: 1.0, cx: 0, cy: -5.5 },
    barracks: { scale: 0.72, cx: 0, cy: -7.5 },
    lumbercamp: { scale: 0.72, cx: 3, cy: -2.5 },
    miningcamp: { scale: 0.78, cx: 4.5, cy: -2.5 },
    mill: { scale: 0.7, cx: 0, cy: -12 },
    abbeymill: { scale: 0.56, cx: 0, cy: -12 },
    kingsbarracks: { scale: 0.6, cx: 0, cy: -9 },
    guildhall: { scale: 0.58, cx: 0, cy: -12 },
    whitekeep: { scale: 0.46, cx: 0, cy: -24 },
    villager: { scale: 1.6, cx: 0, cy: -6.5 },
    swordsman: { scale: 1.45, cx: 0, cy: -8 },
    spearman: { scale: 1.4, cx: 0, cy: -8 },
    archer: { scale: 1.45, cx: 0, cy: -7 },
    scout: { scale: 1.15, cx: 0, cy: -10 },
    knight: { scale: 1.05, cx: 0, cy: -11 },
  }
  const k = conf[kind] ?? { scale: 1, cx: 0, cy: 0 }
  ctx.scale(2, 2)
  ctx.translate(24, 24)
  ctx.scale(k.scale, k.scale)
  ctx.translate(-k.cx, -k.cy)
  switch (kind) {
    case 'towncenter': drawTC(ctx, fake, 0.2, age); break
    case 'farm': drawFarm(ctx, fake, 0.2); break
    case 'watchtower': drawWatchtower(ctx, fake, 0.2); break
    case 'archeryrange': drawArcheryRange(ctx, fake, 0.2); break
    case 'stable': drawStable(ctx, fake, 0.2); break
    case 'wall': drawWall(ctx, fake); break
    case 'gate': drawGate(ctx, fake, 0.2, false); break
    case 'house': drawHouse(ctx, fake, 0.2, age); break
    case 'barracks': drawBarracks(ctx, fake, 0.2, age); break
    case 'lumbercamp': drawLumberCamp(ctx, fake); break
    case 'miningcamp': drawMiningCamp(ctx, fake); break
    case 'mill': drawMill(ctx, fake, 0.8, age); break
    case 'abbeymill': drawAbbeyMill(ctx, fake, 0.8); break
    case 'kingsbarracks': drawKingsBarracks(ctx, fake, 0.8); break
    case 'guildhall': drawGuildhall(ctx, fake, 0.8); break
    case 'whitekeep': drawWhiteKeep(ctx, fake, 0.8); break
    case 'villager': drawVillager(ctx, fake, 0); break
    case 'swordsman': drawSwordsman(ctx, fake, 0); break
    case 'spearman': drawSpearman(ctx, fake, 0); break
    case 'archer': drawArcher(ctx, fake, 0); break
    case 'scout': drawScout(ctx, fake, 0); break
    case 'knight': drawKnight(ctx, fake, 0); break
  }
  return c
}

const MINI_VILL = `<svg viewBox="0 0 24 24" width="10" height="10"><circle cx="12" cy="7.5" r="4.5" fill="currentColor"/><path d="M4.5 20.5c.8-4.6 4-6.8 7.5-6.8s6.7 2.2 7.5 6.8z" fill="currentColor"/></svg>`

export function initUI(g: Game): void {
  const canvas = document.getElementById('game') as HTMLCanvasElement
  // the blue grab-everything button anchors the bottom of the army panel;
  // per-type chips grow above it as the army musters (see syncUI)
  const all = document.createElement('button')
  all.id = 'army-all'
  all.innerHTML = ICON.sword + '<span>Army</span>'
  all.addEventListener('click', () => selectArmy(g, canvas))
  el('army-panel').appendChild(all)
  el('t-wood').insertAdjacentHTML('afterbegin', ICON.wood)
  el('t-food').insertAdjacentHTML('afterbegin', ICON.food)
  el('t-gold').insertAdjacentHTML('afterbegin', ICON.gold)
  el('t-stone').insertAdjacentHTML('afterbegin', ICON.stone)
  el('t-pop').insertAdjacentHTML('afterbegin', ICON.pop)
  for (const r of ['wood', 'food', 'gold', 'stone'] as ResKind[]) {
    el(`s-${r}`).insertAdjacentHTML('afterbegin', MINI_VILL)
    // tapping a resource pill puts one more villager on that resource
    el(`p-${r}`).addEventListener('click', () => sendVillagerToResource(g, r))
  }
  el('p-pop').addEventListener('click', () => cycleIdleVillager(g, canvas))

  el('play-btn').addEventListener('click', () => {
    g.started = true
    el('start-overlay').classList.add('hidden')
  })
  el('replay-btn').addEventListener('click', () => location.reload())
}

function selectedEnts(g: Game): Ent[] {
  return g.selection.map(id => g.byId.get(id)).filter((e): e is Ent => !!e)
}

function queueLen(g: Game): number {
  let n = 0
  for (const e of g.ents) if (e.team === 0 && e.queue) n += e.queue.length
  return n
}

function tryTrain(g: Game, b: Ent, kind: 'villager' | 'swordsman' | 'spearman' | 'archer' | 'scout' | 'knight'): void {
  const s = UNITS[kind]
  if ((s.age ?? 1) > g.age[0]) { toast(g, `Reach the ${AGE_NAMES[s.age ?? 1]} first!`); return }
  // the King's Barracks musters its spear levy for a pittance
  const levy = b.kind === 'kingsbarracks' && kind === 'spearman'
  const trainCost = levy ? LEVY_SPEAR_COST : s.cost
  const trainTime = levy ? LEVY_SPEAR_TIME : s.time
  const p = pop(g, 0)
  if (p.used + queueLen(g) >= p.cap) { toast(g, 'Population full — build a House!'); return }
  if (!canAfford(g, 0, trainCost)) {
    const r = g.res[0]
    const missing =
      r.food < trainCost.food ? 'Not enough food — forage berries or work a farm!' :
      r.gold < trainCost.gold ? 'Not enough gold — mine some!' :
      r.stone < trainCost.stone ? 'Not enough stone — quarry some!' :
      'Not enough wood!'
    toast(g, missing)
    return
  }
  if ((b.queue?.length ?? 0) >= 5) { toast(g, 'Training queue is full.'); return }
  pay(g, 0, trainCost)
  b.queue!.push({ kind, t: trainTime, total: trainTime })
  g.uiDirty = true
}

interface IconBtn {
  cmd: string
  label: string
  icon: HTMLElement | string
  cost?: Cost
  badge?: string
  locked?: boolean
}

const COST_KEYS = ['wood', 'food', 'gold', 'stone'] as const

function iconButton(opts: IconBtn, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button')
  b.className = 'cmd icon'
  b.dataset.cmd = opts.cmd
  b.setAttribute('aria-label', opts.label)
  const costs: string[] = []
  for (const k of COST_KEYS) {
    const n = opts.cost?.[k] ?? 0
    if (!n) continue
    b.dataset[k] = String(n)
    costs.push(`${n}${ICON[k]}`)
  }
  if (typeof opts.icon === 'string') b.insertAdjacentHTML('beforeend', opts.icon)
  else b.appendChild(opts.icon)
  if (costs.length) b.insertAdjacentHTML('beforeend', `<i>${costs.join(' ')}</i>`)
  if (opts.badge) b.insertAdjacentHTML('beforeend', `<span class="badge">${opts.badge}</span>`)
  if (opts.locked) {
    b.classList.add('locked')
    b.insertAdjacentHTML('beforeend', ICON.lock)
  }
  b.addEventListener('click', onClick)
  return b
}

function queuePill(b: Ent): HTMLElement {
  const q = document.createElement('div')
  q.className = 'queue'
  const t0 = b.queue![0]
  q.innerHTML = `<div class="qring"><div style="width:${(1 - t0.t / t0.total) * 100}%"></div></div><span>×${b.queue!.length}</span>`
  return q
}

// which build submenu is open (per selection; resets when the selection changes)
let buildCat: 'economy' | 'military' | null = null
let agePick = false // the landmark-choice menu on the Town Hall
let lastSelKey = ''

// the landmark site currently rising toward the player's next age, if any
function landmarkSite(g: Game): Ent | null {
  for (const e of g.ents) {
    if (e.team !== 0 || e.complete) continue
    const lm = LANDMARKS[e.kind as LandmarkKind]
    if (lm && lm.toAge === g.age[0] + 1) return e
  }
  return null
}

// the champion upgrade offered by this military hall, plus its progress pill
function champDock(g: Game, dock: HTMLElement, b: Ent): void {
  const id = (Object.keys(CHAMPS) as ChampId[]).find(c => CHAMPS[c].at.includes(b.kind))
  if (!id) return
  if (b.research) {
    const q = document.createElement('div')
    q.className = 'queue'
    q.dataset.cmd = 'research-progress'
    q.innerHTML = `<div class="qring"><div style="width:${(1 - b.research.t / b.research.total) * 100}%"></div></div><span>${CHAMPS[b.research.id].name}…</span>`
    dock.appendChild(q)
    return
  }
  if (g.champs[0][id]) return // already sworn in
  const spec = CHAMPS[id]
  dock.appendChild(iconButton(
    { cmd: `champ-${id}`, label: `${spec.name} — ${spec.blurb}`, icon: ICON.crown, cost: spec.cost, locked: g.age[0] < 3 },
    () => {
      if (g.age[0] < 3) { toast(g, 'Reach the Castle Age first!'); return }
      if (b.research || g.champs[0][id]) return
      if (!canAfford(g, 0, spec.cost)) { toast(g, `Not enough for ${spec.name}.`); return }
      pay(g, 0, spec.cost)
      b.research = { id, t: spec.time, total: spec.time }
      g.uiDirty = true
    }))
}

function updateAffordability(g: Game): void {
  const btns = document.querySelectorAll<HTMLButtonElement>('#dock-buttons button.cmd')
  btns.forEach(b => {
    let hasCost = false
    let short = false
    for (const k of COST_KEYS) {
      const n = Number(b.dataset[k] ?? 0)
      if (!n) continue
      hasCost = true
      if (g.res[0][k] < n) short = true
    }
    if (hasCost) b.classList.toggle('disabled', short)
  })
}

// one chip per unit type the player fields, count badges live; rebuilt only
// when the tally actually changes
const ARMY_TYPES = ['spearman', 'swordsman', 'archer', 'knight'] as const
let armySig = ''
function syncArmyPanel(g: Game): void {
  const counts = ARMY_TYPES.map(k =>
    g.ents.reduce((n, e) => n + (e.team === 0 && e.kind === k && !e.hidden ? 1 : 0), 0))
  const sig = counts.join(',')
  if (sig === armySig) return
  armySig = sig
  const panel = el('army-panel')
  panel.querySelectorAll('.army-chip').forEach(c => c.remove())
  const canvas = document.getElementById('game') as HTMLCanvasElement
  const allBtn = el('army-all')
  ARMY_TYPES.forEach((kind, i) => {
    if (!counts[i]) return
    const chip = document.createElement('button')
    chip.className = 'army-chip'
    chip.dataset.cmd = `army-${kind}`
    chip.setAttribute('aria-label', `Select all ${UNITS[kind].name.toLowerCase()}s`)
    chip.appendChild(spriteIcon(kind))
    chip.insertAdjacentHTML('beforeend', `<span class="count">${counts[i]}</span>`)
    chip.addEventListener('click', () => selectUnitsOfKind(g, kind, canvas))
    panel.insertBefore(chip, allBtn)
  })
}

export function syncUI(g: Game): void {
  const p = pop(g, 0)
  el('wood-n').textContent = String(Math.floor(g.res[0].wood))
  el('food-n').textContent = String(Math.floor(g.res[0].food))
  el('gold-n').textContent = String(Math.floor(g.res[0].gold))
  el('stone-n').textContent = String(Math.floor(g.res[0].stone))
  el('pop-n').textContent = `${p.used}/${p.cap}`
  // little crew counts under each number: who's working what, who's loafing
  const crew: Record<ResKind, number> = { wood: 0, food: 0, gold: 0, stone: 0 }
  let idleVills = 0
  for (const e of g.ents) {
    if (e.team !== 0 || e.kind !== 'villager' || e.hidden) continue
    if (e.state === 'idle') { idleVills++; continue }
    const r = gatherResOf(g, e)
    if (r) crew[r]++
  }
  for (const r of ['wood', 'food', 'gold', 'stone'] as ResKind[]) {
    const n = String(crew[r])
    const elV = el(`${r}-v`)
    if (elV.textContent !== n) elV.textContent = n
  }
  const idleStr = String(idleVills)
  if (el('idle-n').textContent !== idleStr) el('idle-n').textContent = idleStr
  el('s-pop').classList.toggle('alert', idleVills > 0)
  syncArmyPanel(g)
  updateAffordability(g)

  // wall placement: the ✓ shows a live post count and total price as you drag
  if (g.placing === 'wall' && g.placePos && g.placeEnd) {
    const btn = document.querySelector<HTMLButtonElement>('#dock-buttons [data-cmd="confirm"]')
    if (btn) {
      const n = wallLinePoints(g).filter(p => p.ok).length
      const total = Math.max(1, n) * BUILDINGS.wall.cost.wood
      btn.dataset.wood = String(total)
      const badge = btn.querySelector('.badge')
      if (badge && badge.textContent !== `×${n}`) badge.textContent = `×${n}`
      const costEl = btn.querySelector('i')
      const want = `${total}${ICON.wood}`
      if (costEl && costEl.dataset.was !== want) { costEl.innerHTML = want; costEl.dataset.was = want }
    }
  }

  // keep visible progress rings moving between full dock rebuilds
  const sel0 = g.byId.get(g.selection[0] ?? -1)
  document.querySelectorAll<HTMLElement>('#dock-buttons .queue').forEach(q => {
    const cmd = q.dataset.cmd
    let frac = -1
    if (cmd === 'age-progress') {
      const site = landmarkSite(g)
      if (site) frac = site.progress ?? 0
    }
    else if (cmd === 'research-progress' && sel0?.research) frac = 1 - sel0.research.t / sel0.research.total
    else if (!cmd && sel0?.queue?.length) frac = 1 - sel0.queue[0].t / sel0.queue[0].total
    if (frac >= 0) {
      const bar = q.querySelector<HTMLElement>('.qring > div')
      if (bar) bar.style.width = `${frac * 100}%`
    }
  })

  if (!g.uiDirty) return
  g.uiDirty = false

  // toasts
  el('toasts').innerHTML = g.toasts.map(t => `<div class="toast">${t.text}</div>`).join('')

  // end-of-game overlays
  if (g.over === 'win') {
    el('end-title').textContent = 'Victory!'
    el('end-text').textContent = 'The enemy town hall has crumbled. Peace returns to the meadow.'
    el('end-overlay').classList.remove('hidden')
  } else if (g.over === 'lose') {
    el('end-title').textContent = 'Defeat…'
    el('end-text').textContent = 'Your town hall has fallen. The meadow will remember your stand.'
    el('end-overlay').classList.remove('hidden')
  }

  // dock: a row of icon commands for the current selection
  const dock = el('dock-buttons')
  dock.innerHTML = ''
  const sel = selectedEnts(g)
  const first = sel[0]
  const sameKind = sel.length > 0 && sel.every(e => e.kind === first.kind)
  const selKey = g.selection.join(',')
  if (selKey !== lastSelKey) { lastSelKey = selKey; buildCat = null; agePick = false }

  if (g.placing) {
    const cross = document.createElement('button')
    cross.className = 'cmd ghost'
    cross.dataset.cmd = 'cancel-place'
    cross.setAttribute('aria-label', 'Cancel placement')
    cross.textContent = '✕'
    cross.addEventListener('click', () => { g.placing = null; g.placePos = null; g.placeEnd = null; g.uiDirty = true })
    dock.appendChild(cross)
    const b = BUILDINGS[g.placing]
    const tick = iconButton(
      { cmd: 'confirm', label: `Place ${b.name}`, icon: `<span class="tick">✓</span>`, cost: b.cost,
        badge: g.placing === 'wall' ? '×1' : undefined },
      () => {
        if (g.placePos) tryPlaceBuilding(g, g.placing!, g.placePos.x, g.placePos.y)
      })
    dock.appendChild(tick)
  } else if (first && first.kind === 'towncenter' && first.complete) {
    const rising = landmarkSite(g)
    if (agePick && g.age[0] < 3 && !rising) {
      // choose your landmark — the eco road or the military road into the next age
      const back = document.createElement('button')
      back.className = 'cmd ghost'
      back.dataset.cmd = 'back'
      back.setAttribute('aria-label', 'Back')
      back.textContent = '‹'
      back.addEventListener('click', () => { agePick = false; g.uiDirty = true })
      dock.appendChild(back)
      const nextAge = g.age[0] + 1
      const choices = (Object.keys(LANDMARKS) as LandmarkKind[]).filter(k => LANDMARKS[k].toAge === nextAge)
      for (const kind of choices) {
        const spec = BUILDINGS[kind]
        const lm = LANDMARKS[kind]
        dock.appendChild(iconButton(
          { cmd: `build-${kind}`, label: `${spec.name} (${lm.path}) — ${lm.blurb}`, icon: spriteIcon(kind), cost: spec.cost },
          () => {
            agePick = false
            g.placing = kind
            g.placePos = snapPlace(g.camera.x, g.camera.y) // ghost starts under your thumb
            g.placeEnd = null
            g.uiDirty = true
          }))
      }
    } else {
      dock.appendChild(iconButton(
        { cmd: 'train-villager', label: 'Train villager', icon: spriteIcon('villager'), cost: UNITS.villager.cost },
        () => tryTrain(g, first, 'villager')))
      if (rising) {
        const q = document.createElement('div')
        q.className = 'queue'
        q.dataset.cmd = 'age-progress'
        q.innerHTML = `<div class="qring"><div style="width:${(rising.progress ?? 0) * 100}%"></div></div><span>${BUILDINGS[rising.kind].name} rises…</span>`
        dock.appendChild(q)
      } else if (g.age[0] < 3) {
        dock.appendChild(iconButton(
          { cmd: 'age-up', label: `Advance to the ${AGE_NAMES[g.age[0] + 1]} — raise a landmark`, icon: ICON.laurel },
          () => { agePick = true; g.uiDirty = true }))
      }
      const garrison = first.garrison ?? 0
      if (garrison > 0) {
        dock.appendChild(iconButton(
          { cmd: 'doors', label: 'Open the doors — back to work!', icon: ICON.bell, badge: `×${garrison}` },
          () => openDoors(g, first)))
      } else {
        dock.appendChild(iconButton(
          { cmd: 'bell', label: 'Ring the bell — shelter villagers', icon: ICON.bell },
          () => ringBell(g, first)))
      }
      if (first.queue?.length) dock.appendChild(queuePill(first))
    }
  } else if (first && (first.kind === 'watchtower' || first.kind === 'whitekeep') && first.complete && first.team === 0 && (first.garrison ?? 0) > 0) {
    dock.appendChild(iconButton(
      { cmd: 'doors', label: 'Open the doors', icon: ICON.bell, badge: `×${first.garrison}` },
      () => openDoors(g, first)))
  } else if (first && (first.kind === 'barracks' || first.kind === 'kingsbarracks') && first.complete && first.team === 0) {
    const levy = first.kind === 'kingsbarracks'
    dock.appendChild(iconButton(
      { cmd: 'train-spearman', label: levy ? 'Muster levy spearman' : 'Train spearman',
        icon: spriteIcon('spearman'), cost: levy ? LEVY_SPEAR_COST : UNITS.spearman.cost },
      () => tryTrain(g, first, 'spearman')))
    dock.appendChild(iconButton(
      { cmd: 'train-swordsman', label: 'Train swordsman', icon: spriteIcon('swordsman'),
        cost: UNITS.swordsman.cost, locked: g.age[0] < (UNITS.swordsman.age ?? 1) },
      () => tryTrain(g, first, 'swordsman')))
    champDock(g, dock, first)
    if (first.queue?.length) dock.appendChild(queuePill(first))
  } else if (first && first.kind === 'archeryrange' && first.complete && first.team === 0) {
    dock.appendChild(iconButton(
      { cmd: 'train-archer', label: 'Train longbowman', icon: spriteIcon('archer'), cost: UNITS.archer.cost },
      () => tryTrain(g, first, 'archer')))
    champDock(g, dock, first)
    if (first.queue?.length) dock.appendChild(queuePill(first))
  } else if (first && first.kind === 'stable' && first.complete && first.team === 0) {
    dock.appendChild(iconButton(
      { cmd: 'train-scout', label: 'Train scout', icon: spriteIcon('scout'), cost: UNITS.scout.cost },
      () => tryTrain(g, first, 'scout')))
    dock.appendChild(iconButton(
      { cmd: 'train-knight', label: 'Train knight (Castle Age)', icon: spriteIcon('knight'),
        cost: UNITS.knight.cost, locked: g.age[0] < (UNITS.knight.age ?? 1) },
      () => tryTrain(g, first, 'knight')))
    champDock(g, dock, first)
    if (first.queue?.length) dock.appendChild(queuePill(first))
  } else if (sameKind && first.kind === 'villager') {
    if (buildCat === null) {
      // two clear doors: what kind of building?
      dock.appendChild(iconButton(
        { cmd: 'cat-economy', label: 'Economy buildings', icon: ICON.economy },
        () => { buildCat = 'economy'; g.uiDirty = true }))
      dock.appendChild(iconButton(
        { cmd: 'cat-military', label: 'Military buildings', icon: ICON.military },
        () => { buildCat = 'military'; g.uiDirty = true }))
      dock.querySelector('[data-cmd="cat-economy"]')!.insertAdjacentHTML('beforeend', '<i>Economy</i>')
      dock.querySelector('[data-cmd="cat-military"]')!.insertAdjacentHTML('beforeend', '<i>Military</i>')
    } else {
      const back = document.createElement('button')
      back.className = 'cmd ghost'
      back.dataset.cmd = 'back'
      back.setAttribute('aria-label', 'Back')
      back.textContent = '‹'
      back.addEventListener('click', () => { buildCat = null; g.uiDirty = true })
      dock.appendChild(back)
      const lists: Record<'economy' | 'military', Buildable[]> = {
        economy: ['house', 'farm', 'mill', 'lumbercamp', 'miningcamp', 'towncenter'],
        military: ['barracks', 'archeryrange', 'stable', 'watchtower', 'wall', 'gate'],
      }
      // symbolic icons where a miniature would be muddy
      const symbolIcons: Partial<Record<Buildable, string>> = {
        barracks: ICON.swordspear,
        archeryrange: ICON.target,
      }
      for (const kind of lists[buildCat]) {
        const b = BUILDINGS[kind]
        const locked = g.age[0] < (b.age ?? 1)
        dock.appendChild(iconButton(
          { cmd: `build-${kind}`, label: `Build ${b.name}`, icon: symbolIcons[kind] ?? spriteIcon(kind, g.age[0]), cost: b.cost, locked },
          () => {
            if (g.age[0] < (b.age ?? 1)) { toast(g, `Reach the ${AGE_NAMES[b.age ?? 1]} first!`); return }
            g.placing = kind
            g.placePos = snapPlace(g.camera.x, g.camera.y) // ghost starts under your thumb
            g.placeEnd = kind === 'wall'
              ? snapPlace(g.camera.x + 96, g.camera.y) // a fence starts as a short run; drag the ends
              : null
            g.uiDirty = true
          }))
      }
    }
  }

  el('dock').classList.toggle('hidden', dock.children.length === 0)
  updateAffordability(g)
}
