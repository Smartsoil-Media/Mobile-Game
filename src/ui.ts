// DOM HUD: resource pills, icon command dock, toasts, overlays.
import { Game, Ent, Buildable, Cost, UNITS, BUILDINGS, isUnit } from './data'
import { pop, canAfford, pay, toast, ringBell, openDoors } from './world'
import { selectArmy, tryPlaceBuilding } from './input'
import { drawTC, drawHouse, drawBarracks, drawLumberCamp, drawMiningCamp, drawFarm, drawWatchtower, drawArcheryRange, drawVillager, drawSwordsman, drawSpearman, drawArcher } from './sprites'

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
  bell: `<svg viewBox="0 0 24 24" width="30" height="30"><circle cx="12" cy="12" r="11.5" fill="#FBF3E4"/><path d="M12 4a6 6 0 0 1 6 6v4l1.5 2.5H4.5L6 14v-4a6 6 0 0 1 6-6z" fill="#B8842E"/><path d="M12 4a6 6 0 0 1 6 6v4H6v-4a6 6 0 0 1 6-6z" fill="#E9B44C"/><circle cx="12" cy="19.5" r="2" fill="#B8842E"/><circle cx="12" cy="3.5" r="1.5" fill="#8B6A4A"/></svg>`,
}

function el<T extends HTMLElement>(id: string): T { return document.getElementById(id) as T }

// Menu icons are miniatures of the real in-game sprites, drawn fresh onto
// tiny canvases so the build menu always matches the world's art.
function spriteIcon(kind: string): HTMLCanvasElement {
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
    house: { scale: 1.0, cx: 0, cy: -5.5 },
    barracks: { scale: 0.72, cx: 0, cy: -7.5 },
    lumbercamp: { scale: 0.72, cx: 3, cy: -2.5 },
    miningcamp: { scale: 0.78, cx: 4.5, cy: -2.5 },
    villager: { scale: 1.6, cx: 0, cy: -6.5 },
    swordsman: { scale: 1.45, cx: 0, cy: -8 },
    spearman: { scale: 1.4, cx: 0, cy: -8 },
    archer: { scale: 1.45, cx: 0, cy: -7 },
  }
  const k = conf[kind] ?? { scale: 1, cx: 0, cy: 0 }
  ctx.scale(2, 2)
  ctx.translate(24, 24)
  ctx.scale(k.scale, k.scale)
  ctx.translate(-k.cx, -k.cy)
  switch (kind) {
    case 'towncenter': drawTC(ctx, fake, 0.2); break
    case 'farm': drawFarm(ctx, fake, 0.2); break
    case 'watchtower': drawWatchtower(ctx, fake, 0.2); break
    case 'archeryrange': drawArcheryRange(ctx, fake, 0.2); break
    case 'house': drawHouse(ctx, fake, 0.2); break
    case 'barracks': drawBarracks(ctx, fake, 0.2); break
    case 'lumbercamp': drawLumberCamp(ctx, fake); break
    case 'miningcamp': drawMiningCamp(ctx, fake); break
    case 'villager': drawVillager(ctx, fake, 0); break
    case 'swordsman': drawSwordsman(ctx, fake, 0); break
    case 'spearman': drawSpearman(ctx, fake, 0); break
    case 'archer': drawArcher(ctx, fake, 0); break
  }
  return c
}

export function initUI(g: Game): void {
  el('army-btn').innerHTML = ICON.sword + '<span>Army</span>'
  const canvas = document.getElementById('game') as HTMLCanvasElement
  el('army-btn').addEventListener('click', () => selectArmy(g, canvas))
  el('p-wood').insertAdjacentHTML('afterbegin', ICON.wood)
  el('p-food').insertAdjacentHTML('afterbegin', ICON.food)
  el('p-gold').insertAdjacentHTML('afterbegin', ICON.gold)
  el('p-stone').insertAdjacentHTML('afterbegin', ICON.stone)
  el('p-pop').insertAdjacentHTML('afterbegin', ICON.pop)

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

function tryTrain(g: Game, b: Ent, kind: 'villager' | 'swordsman' | 'spearman' | 'archer'): void {
  const s = UNITS[kind]
  const p = pop(g, 0)
  if (p.used + queueLen(g) >= p.cap) { toast(g, 'Population full — build a House!'); return }
  if (!canAfford(g, 0, s.cost)) {
    const r = g.res[0]
    const missing =
      r.food < s.cost.food ? 'Not enough food — forage berries or work a farm!' :
      r.gold < s.cost.gold ? 'Not enough gold — mine some!' :
      r.stone < s.cost.stone ? 'Not enough stone — quarry some!' :
      'Not enough wood!'
    toast(g, missing)
    return
  }
  if ((b.queue?.length ?? 0) >= 5) { toast(g, 'Training queue is full.'); return }
  pay(g, 0, s.cost)
  b.queue!.push({ kind, t: s.time, total: s.time })
  g.uiDirty = true
}

interface IconBtn {
  cmd: string
  label: string
  icon: HTMLElement | string
  cost?: Cost
  badge?: string
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
let lastSelKey = ''

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

export function syncUI(g: Game): void {
  const p = pop(g, 0)
  el('wood-n').textContent = String(Math.floor(g.res[0].wood))
  el('food-n').textContent = String(Math.floor(g.res[0].food))
  el('gold-n').textContent = String(Math.floor(g.res[0].gold))
  el('stone-n').textContent = String(Math.floor(g.res[0].stone))
  el('pop-n').textContent = `${p.used}/${p.cap}`
  updateAffordability(g)

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
  if (selKey !== lastSelKey) { lastSelKey = selKey; buildCat = null }

  if (g.placing) {
    const cross = document.createElement('button')
    cross.className = 'cmd ghost'
    cross.dataset.cmd = 'cancel-place'
    cross.setAttribute('aria-label', 'Cancel placement')
    cross.textContent = '✕'
    cross.addEventListener('click', () => { g.placing = null; g.placePos = null; g.uiDirty = true })
    dock.appendChild(cross)
    const b = BUILDINGS[g.placing]
    const tick = iconButton(
      { cmd: 'confirm', label: `Place ${b.name}`, icon: `<span class="tick">✓</span>`, cost: b.cost },
      () => {
        if (g.placePos) tryPlaceBuilding(g, g.placing!, g.placePos.x, g.placePos.y)
      })
    dock.appendChild(tick)
  } else if (first && first.kind === 'towncenter' && first.complete) {
    dock.appendChild(iconButton(
      { cmd: 'train-villager', label: 'Train villager', icon: spriteIcon('villager'), cost: UNITS.villager.cost },
      () => tryTrain(g, first, 'villager')))
    const garrison = first.garrison ?? 0
    if (garrison > 0) {
      dock.appendChild(iconButton(
        { cmd: 'doors', label: 'Open the doors', icon: ICON.bell, badge: `×${garrison}` },
        () => openDoors(g, first)))
    } else {
      dock.appendChild(iconButton(
        { cmd: 'bell', label: 'Ring the bell — shelter villagers', icon: ICON.bell },
        () => ringBell(g, first)))
    }
    if (first.queue?.length) dock.appendChild(queuePill(first))
  } else if (first && first.kind === 'watchtower' && first.complete && first.team === 0 && (first.garrison ?? 0) > 0) {
    dock.appendChild(iconButton(
      { cmd: 'doors', label: 'Open the doors', icon: ICON.bell, badge: `×${first.garrison}` },
      () => openDoors(g, first)))
  } else if (first && first.kind === 'barracks' && first.complete && first.team === 0) {
    dock.appendChild(iconButton(
      { cmd: 'train-swordsman', label: 'Train swordsman', icon: spriteIcon('swordsman'), cost: UNITS.swordsman.cost },
      () => tryTrain(g, first, 'swordsman')))
    dock.appendChild(iconButton(
      { cmd: 'train-spearman', label: 'Train spearman', icon: spriteIcon('spearman'), cost: UNITS.spearman.cost },
      () => tryTrain(g, first, 'spearman')))
    if (first.queue?.length) dock.appendChild(queuePill(first))
  } else if (first && first.kind === 'archeryrange' && first.complete && first.team === 0) {
    dock.appendChild(iconButton(
      { cmd: 'train-archer', label: 'Train archer', icon: spriteIcon('archer'), cost: UNITS.archer.cost },
      () => tryTrain(g, first, 'archer')))
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
        economy: ['house', 'farm', 'lumbercamp', 'miningcamp', 'towncenter'],
        military: ['barracks', 'archeryrange', 'watchtower'],
      }
      // symbolic icons where a miniature would be muddy
      const symbolIcons: Partial<Record<Buildable, string>> = {
        barracks: ICON.swordspear,
        archeryrange: ICON.target,
      }
      for (const kind of lists[buildCat]) {
        const b = BUILDINGS[kind]
        dock.appendChild(iconButton(
          { cmd: `build-${kind}`, label: `Build ${b.name}`, icon: symbolIcons[kind] ?? spriteIcon(kind), cost: b.cost },
          () => {
            g.placing = kind
            g.placePos = { x: g.camera.x, y: g.camera.y } // ghost starts under your thumb
            g.uiDirty = true
          }))
      }
    }
  }

  el('dock').classList.toggle('hidden', dock.children.length === 0)
  updateAffordability(g)
}
