// DOM HUD: resource pills, icon command dock, toasts, overlays.
import {
  Game, Ent, Buildable, Cost, ResKind, ChampId, TechId, CivId, LandmarkKind, UNITS, BUILDINGS,
  CHAMPS, TECHS, CIVS, LANDMARKS, LEVY_SPEAR_COST, LEVY_SPEAR_TIME,
  SCHOOL_KNIGHT_COST, SCHOOL_KNIGHT_TIME, AGE_NAMES,
  isUnit, isBuilding,
} from './data'
import { pop, canAfford, pay, toast, ringBell, openDoors, gatherResOf, wallLinePoints, unitAgeReq, fogIndex } from './world'
import { selectArmy, selectUnitsOfKind, tryPlaceBuilding, snapPlace, sendVillagerToResource, cycleIdleVillager, clampCamera } from './input'
import { drawTC, drawHouse, drawBarracks, drawLumberCamp, drawMiningCamp, drawMill, drawStable, drawFarm, drawWatchtower, drawArcheryRange, drawWall, drawGate, drawVillager, drawSwordsman, drawSpearman, drawArcher, drawScout, drawKnight, drawAbbeyMill, drawKingsBarracks, drawGuildhall, drawWhiteKeep, drawChamberOfCommerce, drawCavalrySchool, drawRoyalVineyard, drawRedPalace } from './sprites'

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
  // economy tech icons
  axe: `<svg viewBox="0 0 24 24" width="34" height="34"><circle cx="12" cy="12" r="11.5" fill="#FBF3E4"/><path d="M8 19 15.5 8.5" stroke="#8B6A4A" stroke-width="2.2" stroke-linecap="round"/><path d="M12.8 5.8c2.6-1.6 5.4-1.2 7 .4-.5 2.5-2.1 4.6-4.7 5.6z" fill="#C7CCD4"/><path d="M12.8 5.8c1-.3 2-.4 3-.2l-1.9 4.6-1.8-1.5z" fill="#E4E7EC"/></svg>`,
  barrow: `<svg viewBox="0 0 24 24" width="34" height="34"><circle cx="12" cy="12" r="11.5" fill="#FBF3E4"/><path d="M6.3 8.7c2.2-1.4 6.2-1.4 8.4 0l-.6 1.6H6.9z" fill="#E4CB8F"/><path d="M5 10.3h11.2l-1.9 5H7.9z" fill="#8B6A4A"/><path d="M16.2 10.3h3.3" stroke="#6F5238" stroke-width="1.8" stroke-linecap="round"/><path d="M8.5 15.3l-1.3 3M13.7 15.3l1.3 3" stroke="#6F5238" stroke-width="1.6" stroke-linecap="round"/><circle cx="11" cy="18" r="2.4" fill="#6F5238"/><circle cx="11" cy="18" r="1" fill="#FBF3E4"/></svg>`,
  pick: `<svg viewBox="0 0 24 24" width="34" height="34"><circle cx="12" cy="12" r="11.5" fill="#FBF3E4"/><path d="M7 18.5 15 8" stroke="#8B6A4A" stroke-width="2.2" stroke-linecap="round"/><path d="M8.3 6.3c3.6-2.1 8.3-1.5 10.9 1.2l-1 1.4c-2.4-2.2-6-2.6-8.9-1.3z" fill="#C7CCD4"/><circle cx="17.5" cy="16.5" r="1.7" fill="#E9B44C"/></svg>`,
  lock: `<svg class="lockb" viewBox="0 0 24 24" width="14" height="14"><rect x="6" y="10" width="12" height="9" rx="2.5" fill="#5A4632"/><path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" stroke="#5A4632" stroke-width="2.2" fill="none"/><circle cx="12" cy="14.5" r="1.6" fill="#FBF3E4"/></svg>`,
  bell: `<svg viewBox="0 0 24 24" width="30" height="30"><circle cx="12" cy="12" r="11.5" fill="#FBF3E4"/><path d="M12 4a6 6 0 0 1 6 6v4l1.5 2.5H4.5L6 14v-4a6 6 0 0 1 6-6z" fill="#B8842E"/><path d="M12 4a6 6 0 0 1 6 6v4H6v-4a6 6 0 0 1 6-6z" fill="#E9B44C"/><circle cx="12" cy="19.5" r="2" fill="#B8842E"/><circle cx="12" cy="3.5" r="1.5" fill="#8B6A4A"/></svg>`,
}

const TECH_ICON: Record<TechId, string> = {
  steelaxes: ICON.axe, wheelbarrow: ICON.barrow, minerspicks: ICON.pick,
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
    chamberofcommerce: { scale: 0.58, cx: 0, cy: -11 },
    cavalryschool: { scale: 0.6, cx: 0, cy: -9 },
    royalvineyard: { scale: 0.58, cx: 0, cy: -10 },
    redpalace: { scale: 0.46, cx: 0, cy: -24 },
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
    case 'chamberofcommerce': drawChamberOfCommerce(ctx, fake, 0.8); break
    case 'cavalryschool': drawCavalrySchool(ctx, fake, 0.8); break
    case 'royalvineyard': drawRoyalVineyard(ctx, fake, 0.8); break
    case 'redpalace': drawRedPalace(ctx, fake, 0.8); break
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

  // the minimap is the fast way around: tap (or drag) to send the camera there
  const mini = el<HTMLCanvasElement>('minimap')
  const jumpTo = (ev: PointerEvent) => {
    const r = mini.getBoundingClientRect()
    g.camera.x = ((ev.clientX - r.left) / r.width) * g.world.w
    g.camera.y = ((ev.clientY - r.top) / r.height) * g.world.h
    clampCamera(g, canvas)
  }
  mini.addEventListener('pointerdown', ev => {
    ev.preventDefault()
    ev.stopPropagation()
    mini.setPointerCapture(ev.pointerId)
    jumpTo(ev)
  })
  mini.addEventListener('pointermove', ev => {
    if (ev.buttons) jumpTo(ev)
  })

  // ---- the main menu: home → solo screen (banner + difficulty) → begin ----
  let civPick: CivId = 'english'
  el('menu-solo').addEventListener('click', () => {
    el('menu-home').classList.add('hidden')
    el('menu-solo-screen').classList.remove('hidden')
  })
  el('menu-back').addEventListener('click', () => {
    el('menu-solo-screen').classList.add('hidden')
    el('menu-home').classList.remove('hidden')
  })
  document.querySelectorAll<HTMLButtonElement>('.civ-card').forEach(cardEl => {
    cardEl.addEventListener('click', () => {
      document.querySelectorAll('.civ-card').forEach(c => c.classList.remove('selected'))
      cardEl.classList.add('selected')
      civPick = (cardEl.dataset.civ as CivId) ?? 'english'
    })
  })
  document.querySelectorAll<HTMLButtonElement>('.diff-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.diff-chip').forEach(c => c.classList.remove('selected'))
      chip.classList.add('selected')
      g.aiLevel = (chip.dataset.diff as Game['aiLevel']) ?? 'normal'
    })
  })
  el('play-btn').addEventListener('click', () => {
    // the enemy always marches under the other banner — every match is civ vs civ
    g.civs = [civPick, civPick === 'english' ? 'french' : 'english']
    if (g.aiLevel === 'hard') { g.res[1].food += 150; g.res[1].wood += 150 } // a fierce rival starts flush
    g.started = true
    el('start-overlay').classList.add('hidden')
    toast(g, `${CIVS[g.civs[1]].name} raise their banner across the meadow.`)
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
  const ageReq = unitAgeReq(g, 0, kind)
  if (ageReq > g.age[0]) { toast(g, `Reach the ${AGE_NAMES[ageReq]} first!`); return }
  // the King's Barracks musters its spear levy for a pittance;
  // the School of Cavalry saddles knights at a chevalier's discount
  const levy = b.kind === 'kingsbarracks' && kind === 'spearman'
  const school = b.kind === 'cavalryschool' && kind === 'knight'
  const trainCost = levy ? LEVY_SPEAR_COST : school ? SCHOOL_KNIGHT_COST : s.cost
  const trainTime = levy ? LEVY_SPEAR_TIME : school ? SCHOOL_KNIGHT_TIME : s.time
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

// ---- production loaders (a small top-left row): one ring per thing underway — a unit
// training (with its queue count), an upgrade researching, a landmark rising.
// The ring fills like an app download; tapping it selects the busy building.
const RING_C = 2 * Math.PI * 22
let prodSig = ''
function syncProdPanel(g: Game): void {
  interface Item { key: string; hostId: number; icon: string; frac: number; count: number }
  const items: Item[] = []
  for (const e of g.ents) {
    if (e.team !== 0) continue
    if (e.queue?.length) {
      items.push({
        key: `q${e.id}`, hostId: e.id, icon: `unit:${e.queue[0].kind}`,
        frac: 1 - e.queue[0].t / e.queue[0].total, count: e.queue.length,
      })
    }
    if (e.research) {
      items.push({
        key: `r${e.id}`, hostId: e.id, icon: `research:${e.research.id}`,
        frac: 1 - e.research.t / e.research.total, count: 1,
      })
    }
    if (!e.complete && LANDMARKS[e.kind as LandmarkKind]) {
      items.push({
        key: `l${e.id}`, hostId: e.id, icon: `landmark:${e.kind}`,
        frac: e.progress ?? 0, count: 1,
      })
    }
  }
  const panel = el('prod-panel')
  const sig = items.map(i => `${i.key}:${i.icon}`).join(',')
  if (sig !== prodSig) {
    prodSig = sig
    panel.innerHTML = ''
    for (const it of items) {
      const chip = document.createElement('button')
      chip.className = 'prod-chip'
      chip.dataset.key = it.key
      const [what, id] = it.icon.split(':')
      chip.setAttribute('aria-label',
        what === 'unit' ? `Training ${UNITS[id]?.name ?? id}` :
        what === 'landmark' ? `${BUILDINGS[id].name} rising` :
        `Researching ${CHAMPS[id as ChampId]?.name ?? TECHS[id as TechId]?.name ?? id}`)
      if (what === 'unit' || what === 'landmark') chip.appendChild(spriteIcon(id))
      else if (CHAMPS[id as ChampId]) chip.insertAdjacentHTML('beforeend', ICON.crown.replace('<svg ', '<svg class="picon" '))
      else chip.insertAdjacentHTML('beforeend', (TECH_ICON[id as TechId] ?? ICON.crown).replace('<svg ', '<svg class="picon" '))
      chip.insertAdjacentHTML('beforeend',
        `<svg class="ring" viewBox="0 0 50 50"><circle class="track" cx="25" cy="25" r="22"/><circle class="fill" cx="25" cy="25" r="22" stroke-dasharray="${RING_C}" stroke-dashoffset="${RING_C}"/></svg>`)
      chip.insertAdjacentHTML('beforeend', `<span class="count hidden">×1</span>`)
      chip.addEventListener('click', () => {
        // a gentle nudge: select the busy building (the camera stays put)
        if (g.byId.has(it.hostId)) { g.selection = [it.hostId]; g.uiDirty = true }
      })
      panel.appendChild(chip)
    }
  }
  // every frame: rings fill, counts tick
  panel.querySelectorAll<HTMLElement>('.prod-chip').forEach((chip, i) => {
    const it = items[i]
    if (!it) return
    const fill = chip.querySelector<SVGCircleElement>('.ring .fill')
    if (fill) fill.style.strokeDashoffset = String(RING_C * (1 - Math.max(0, Math.min(1, it.frac))))
    const count = chip.querySelector<HTMLElement>('.count')
    if (count) {
      count.classList.toggle('hidden', it.count < 2)
      const want = `×${it.count}`
      if (count.textContent !== want) count.textContent = want
    }
  })
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

// research buttons / progress pill for whatever economy techs live here
function researchDock(g: Game, dock: HTMLElement, b: Ent): void {
  const ids = (Object.keys(TECHS) as TechId[]).filter(t => TECHS[t].at === b.kind)
  if (!ids.length) return
  if (b.research) return // the top-right loader tells the story now
  for (const id of ids) {
    if (g.techs[0][id]) continue // already known
    const spec = TECHS[id]
    dock.appendChild(iconButton(
      { cmd: `research-${id}`, label: `Research ${spec.name} — ${spec.blurb}`, icon: TECH_ICON[id], cost: spec.cost, locked: g.age[0] < 2 },
      () => {
        if (g.age[0] < 2) { toast(g, 'Reach the Feudal Age first!'); return }
        if (b.research || g.techs[0][id]) return
        if (!canAfford(g, 0, spec.cost)) { toast(g, `Not enough for ${spec.name}.`); return }
        pay(g, 0, spec.cost)
        b.research = { id, t: spec.time, total: spec.time }
        g.uiDirty = true
      }))
  }
}

// the champion upgrade offered by this military hall, plus its progress pill
function champDock(g: Game, dock: HTMLElement, b: Ent): void {
  const id = (Object.keys(CHAMPS) as ChampId[]).find(c => CHAMPS[c].at.includes(b.kind))
  if (!id) return
  if (b.research) return // the top-right loader tells the story now
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

// ---- the minimap: the whole meadow at a glance, fog and all. Tap it to
// send the camera there; red rings pulse where your things are under attack ----
let miniFog: HTMLCanvasElement | null = null
function drawMinimap(g: Game): void {
  const c = el<HTMLCanvasElement>('minimap')
  const ctx = c.getContext('2d')!
  const W = c.width, H = c.height
  const sx = W / g.world.w, sy = H / g.world.h
  // fog underlay, softly scaled up from the fog grid
  if (!miniFog || miniFog.width !== g.fog.w || miniFog.height !== g.fog.h) {
    miniFog = document.createElement('canvas')
    miniFog.width = g.fog.w
    miniFog.height = g.fog.h
  }
  const fctx = miniFog.getContext('2d')!
  const img = fctx.createImageData(g.fog.w, g.fog.h)
  const d = img.data
  for (let i = 0; i < g.fog.w * g.fog.h; i++) {
    const o = i * 4
    if (!g.fog.explored[i]) { d[o] = 30; d[o + 1] = 42; d[o + 2] = 26 }
    else if (!g.fog.visible[i]) { d[o] = 74; d[o + 1] = 95; d[o + 2] = 56 }
    else { d[o] = 122; d[o + 1] = 153; d[o + 2] = 88 }
    d[o + 3] = 255
  }
  fctx.putImageData(img, 0, 0)
  ctx.imageSmoothingEnabled = true
  ctx.clearRect(0, 0, W, H)
  ctx.drawImage(miniFog, 0, 0, g.fog.w, g.fog.h, 0, 0, W, H)
  // the stream and its fords — only the stretches you've actually found
  // (rivers, and one day ponds, are discoveries, not free intelligence)
  if (g.streams.length) {
    ctx.strokeStyle = '#6D9DC5'
    ctx.lineWidth = 3
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    for (const s of g.streams) {
      ctx.beginPath()
      let pen = false
      for (let i = 0; i + 1 < s.pts.length; i++) {
        const a = s.pts[i], b = s.pts[i + 1]
        // walk each leg in fog-cell-sized steps so the reveal hugs the fog line
        for (let k = 0; k < 3; k++) {
          const t0 = k / 3, t1 = (k + 1) / 3
          const mx = a.x + (b.x - a.x) * (t0 + t1) / 2
          const my = a.y + (b.y - a.y) * (t0 + t1) / 2
          if (g.fog.explored[fogIndex(g, mx, my)] === 1) {
            if (!pen) { ctx.moveTo((a.x + (b.x - a.x) * t0) * sx, (a.y + (b.y - a.y) * t0) * sy); pen = true }
            ctx.lineTo((a.x + (b.x - a.x) * t1) * sx, (a.y + (b.y - a.y) * t1) * sy)
          } else {
            pen = false
          }
        }
      }
      ctx.stroke()
    }
    ctx.fillStyle = '#D8C89C'
    for (const f of g.fords) {
      if (g.fog.explored[fogIndex(g, f.x, f.y)] !== 1) continue
      ctx.beginPath(); ctx.arc(f.x * sx, f.y * sy, 2.2, 0, Math.PI * 2); ctx.fill()
    }
  }
  // the land and the villages (enemy buildings once seen, units in live sight)
  for (const e of g.ents) {
    const fi = fogIndex(g, e.x, e.y)
    const seen = g.fog.explored[fi] === 1
    const lit = g.fog.visible[fi] === 1
    const mx = e.x * sx, my = e.y * sy
    if (e.kind === 'tree') {
      if (seen && (e.amount ?? 0) > 0) { ctx.fillStyle = '#3E5A34'; ctx.fillRect(mx - 1, my - 1, 2, 2) }
    } else if (e.kind === 'crag') {
      if (seen) { ctx.fillStyle = '#8E8A7C'; ctx.fillRect(mx - 1.5, my - 1.5, 3, 3) }
    } else if (e.kind === 'goldmine') {
      if (seen && (e.amount ?? 0) > 0) { ctx.fillStyle = '#E9B44C'; ctx.fillRect(mx - 1.5, my - 1.5, 3, 3) }
    } else if (e.kind === 'stonequarry') {
      if (seen && (e.amount ?? 0) > 0) { ctx.fillStyle = '#BDB8AA'; ctx.fillRect(mx - 1.5, my - 1.5, 3, 3) }
    } else if (e.kind === 'berrybush') {
      if (seen && (e.amount ?? 0) > 0) { ctx.fillStyle = '#C9525E'; ctx.fillRect(mx - 1, my - 1, 2, 2) }
    } else if (isBuilding(e)) {
      if (e.team === 0 || seen) {
        ctx.fillStyle = e.team === 0 ? '#6D9DC5' : '#C4746B'
        const s = e.kind === 'towncenter' ? 5 : 3.4
        ctx.fillRect(mx - s / 2, my - s / 2, s, s)
        if (e.kind === 'towncenter') {
          ctx.strokeStyle = '#FBF3E4'
          ctx.lineWidth = 1
          ctx.strokeRect(mx - s / 2, my - s / 2, s, s)
        }
      }
    } else if (isUnit(e) && !e.hidden) {
      if (e.team === 0 || lit) {
        ctx.fillStyle = e.team === 0 ? '#BFD8EC' : '#E5A79F'
        ctx.fillRect(mx - 1, my - 1, 2, 2)
      }
    }
  }
  // under attack: pulsing rings
  for (const p of g.pings) {
    const age = g.t - p.t
    if (age > 3.6) continue
    const k = (age % 1.2) / 1.2
    ctx.globalAlpha = (1 - k) * 0.9
    ctx.strokeStyle = '#E25B4A'
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.arc(p.x * sx, p.y * sy, 2.5 + k * 6.5, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  // the camera's window on the world
  const gc = document.getElementById('game') as HTMLCanvasElement
  const halfW = gc.clientWidth / 2 / g.camera.zoom
  const halfH = gc.clientHeight / 2 / g.camera.zoom
  ctx.strokeStyle = 'rgba(251, 243, 228, 0.9)'
  ctx.lineWidth = 1.4
  ctx.strokeRect(
    (g.camera.x - halfW) * sx, (g.camera.y - halfH) * sy,
    halfW * 2 * sx, halfH * 2 * sy)
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
  syncProdPanel(g)
  drawMinimap(g)
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
      const choices = (Object.keys(LANDMARKS) as LandmarkKind[])
        .filter(k => LANDMARKS[k].toAge === nextAge && LANDMARKS[k].civ === g.civs[0])
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
      if (!rising && g.age[0] < 3) {
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
      }
  } else if (first && (first.kind === 'lumbercamp' || first.kind === 'miningcamp' || first.kind === 'mill') &&
    first.complete && first.team === 0) {
    researchDock(g, dock, first)
  } else if (first && first.kind === 'cavalryschool' && first.complete && first.team === 0) {
    dock.appendChild(iconButton(
      { cmd: 'train-scout', label: 'Train scout', icon: spriteIcon('scout'), cost: UNITS.scout.cost },
      () => tryTrain(g, first, 'scout')))
    dock.appendChild(iconButton(
      { cmd: 'train-knight', label: "Muster knight — a chevalier's discount", icon: spriteIcon('knight'),
        cost: SCHOOL_KNIGHT_COST, locked: g.age[0] < unitAgeReq(g, 0, 'knight') },
      () => tryTrain(g, first, 'knight')))
    champDock(g, dock, first)
  } else if (first && (first.kind === 'watchtower' || first.kind === 'whitekeep' || first.kind === 'redpalace') && first.complete && first.team === 0 && (first.garrison ?? 0) > 0) {
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
  } else if (first && first.kind === 'archeryrange' && first.complete && first.team === 0) {
    dock.appendChild(iconButton(
      { cmd: 'train-archer', label: 'Train longbowman', icon: spriteIcon('archer'), cost: UNITS.archer.cost },
      () => tryTrain(g, first, 'archer')))
    champDock(g, dock, first)
  } else if (first && first.kind === 'stable' && first.complete && first.team === 0) {
    dock.appendChild(iconButton(
      { cmd: 'train-scout', label: 'Train scout', icon: spriteIcon('scout'), cost: UNITS.scout.cost },
      () => tryTrain(g, first, 'scout')))
    dock.appendChild(iconButton(
      { cmd: 'train-knight', label: `Train knight (${AGE_NAMES[unitAgeReq(g, 0, 'knight')]})`, icon: spriteIcon('knight'),
        cost: UNITS.knight.cost, locked: g.age[0] < unitAgeReq(g, 0, 'knight') },
      () => tryTrain(g, first, 'knight')))
    champDock(g, dock, first)
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
