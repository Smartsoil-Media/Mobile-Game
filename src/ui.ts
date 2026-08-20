// DOM HUD: resource pills, contextual command dock, hints, toasts, overlays.
import { Game, Ent, UNITS, BUILDINGS, isUnit, isBuilding } from './data'
import { pop, canAfford, pay, toast, ringBell, openDoors } from './world'
import { selectArmy } from './input'
import { GARRISON_CAP } from './data'

const ICON = {
  wood: `<svg viewBox="0 0 24 24" width="17" height="17"><rect x="3" y="9" width="15" height="7" rx="3.5" fill="#8B6A4A"/><circle cx="18" cy="12.5" r="3.5" fill="#C89B6E"/><circle cx="18" cy="12.5" r="1.6" fill="#8B6A4A"/><path d="M6 11.5h7M6 14h5" stroke="#6F5238" stroke-width="1.2" stroke-linecap="round"/></svg>`,
  gold: `<svg viewBox="0 0 24 24" width="17" height="17"><circle cx="12" cy="12" r="8" fill="#E9B44C"/><circle cx="12" cy="12" r="5.4" fill="#F5D584"/><path d="M12 8.5v7M9.8 10.4h3.4a1.7 1.7 0 0 1 0 3.4H10" stroke="#B8842E" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>`,
  pop: `<svg viewBox="0 0 24 24" width="17" height="17"><circle cx="12" cy="8" r="4.2" fill="#F6CFA0"/><path d="M4.5 20c.8-4.4 3.9-6.5 7.5-6.5s6.7 2.1 7.5 6.5z" fill="#6D9DC5"/></svg>`,
  sword: `<svg viewBox="0 0 24 24" width="20" height="20"><path d="M5 19 15.5 8.5M15.5 8.5 19 5l-1 4.5L14.5 13" stroke="#FBF3E4" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M7.5 14.5l2 2M5 19l-1.2 1.2" stroke="#E9B44C" stroke-width="2.2" stroke-linecap="round"/></svg>`,
  bell: `<svg viewBox="0 0 24 24" width="15" height="15"><path d="M12 4a6 6 0 0 1 6 6v4l1.5 2.5H4.5L6 14v-4a6 6 0 0 1 6-6z" fill="#B8842E"/><path d="M12 4a6 6 0 0 1 6 6v4H6v-4a6 6 0 0 1 6-6z" fill="#E9B44C"/><circle cx="12" cy="19.5" r="2" fill="#B8842E"/><circle cx="12" cy="3.5" r="1.5" fill="#8B6A4A"/></svg>`,
}

function el<T extends HTMLElement>(id: string): T { return document.getElementById(id) as T }

export function initUI(g: Game): void {
  el('army-btn').innerHTML = ICON.sword + '<span>Army</span>'
  const canvas = document.getElementById('game') as HTMLCanvasElement
  el('army-btn').addEventListener('click', () => selectArmy(g, canvas))
  el('p-wood').insertAdjacentHTML('afterbegin', ICON.wood)
  el('p-gold').insertAdjacentHTML('afterbegin', ICON.gold)
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

function trainCostLabel(kind: 'villager' | 'swordsman'): string {
  const c = UNITS[kind].cost
  const parts: string[] = []
  if (c.wood) parts.push(`${c.wood} ${ICON.wood}`)
  if (c.gold) parts.push(`${c.gold} ${ICON.gold}`)
  return parts.join(' ')
}

function queueLen(g: Game): number {
  let n = 0
  for (const e of g.ents) if (e.team === 0 && e.queue) n += e.queue.length
  return n
}

function tryTrain(g: Game, b: Ent, kind: 'villager' | 'swordsman'): void {
  const s = UNITS[kind]
  const p = pop(g, 0)
  if (p.used + queueLen(g) >= p.cap) { toast(g, 'Population full — build a House!'); return }
  if (!canAfford(g, 0, s.cost)) {
    toast(g, s.cost.gold ? 'Not enough gold — mine some!' : 'Not enough wood!')
    return
  }
  if ((b.queue?.length ?? 0) >= 5) { toast(g, 'Training queue is full.'); return }
  pay(g, 0, s.cost)
  b.queue!.push({ kind, t: s.time, total: s.time })
  g.uiDirty = true
}

function button(html: string, onClick: () => void, cls = ''): HTMLButtonElement {
  const b = document.createElement('button')
  b.className = 'cmd ' + cls
  b.innerHTML = html
  b.addEventListener('click', onClick)
  return b
}

export function syncUI(g: Game): void {
  const p = pop(g, 0)
  el('wood-n').textContent = String(Math.floor(g.res[0].wood))
  el('gold-n').textContent = String(Math.floor(g.res[0].gold))
  el('pop-n').textContent = `${p.used}/${p.cap}`

  if (!g.uiDirty) return
  g.uiDirty = false

  // hint bubble
  const hint = el('hint')
  if (g.hint && !g.over) { hint.textContent = g.hint; hint.classList.remove('hidden') }
  else hint.classList.add('hidden')

  // toasts
  el('toasts').innerHTML = g.toasts.map(t => `<div class="toast">${t.text}</div>`).join('')

  // end-of-game overlays (before any dock early-returns)
  if (g.over === 'win') {
    el('end-title').textContent = 'Victory!'
    el('end-text').textContent = 'The enemy town hall has crumbled. Peace returns to the meadow.'
    el('end-overlay').classList.remove('hidden')
  } else if (g.over === 'lose') {
    el('end-title').textContent = 'Defeat…'
    el('end-text').textContent = 'Your town hall has fallen. The meadow will remember your stand.'
    el('end-overlay').classList.remove('hidden')
  }

  // dock: contextual — only on screen while something is selected or placing
  const info = el('sel-info')
  const dock = el('dock-buttons')
  dock.innerHTML = ''
  const sel = selectedEnts(g)

  if (!sel.length && !g.placing) {
    el('dock').classList.add('hidden')
    return
  }
  el('dock').classList.remove('hidden')

  if (g.placing) {
    const b = BUILDINGS[g.placing]
    info.innerHTML = `<b>Placing ${b.name}</b><span>Tap open grass to build</span>`
    dock.appendChild(button('Cancel', () => { g.placing = null; g.uiDirty = true }, 'ghost'))
    return
  }

  const first = sel[0]
  const sameKind = sel.every(e => e.kind === first.kind)
  const name = sameKind
    ? (isUnit(first) ? UNITS[first.kind].name : BUILDINGS[first.kind]?.name ?? first.kind)
    : 'Group'
  const count = sel.length > 1 ? ` ×${sel.length}` : ''
  let sub = ''

  if (first.kind === 'towncenter' && first.complete) {
    const garrison = first.garrison ?? 0
    sub = garrison > 0 ? `${garrison} villager${garrison > 1 ? 's' : ''} sheltering inside` : 'Trains villagers'
    dock.appendChild(button(`Train Villager<i>${trainCostLabel('villager')}</i>`, () => tryTrain(g, first, 'villager')))
    if (garrison > 0) {
      dock.appendChild(button(`${ICON.bell} Open the Doors<i>arrows: ${Math.min(garrison, GARRISON_CAP)}</i>`, () => openDoors(g, first)))
    } else {
      dock.appendChild(button(`${ICON.bell} Ring the Bell<i>shelter villagers</i>`, () => ringBell(g, first)))
    }
    if (first.queue?.length) {
      const q = document.createElement('div')
      q.className = 'queue'
      const t0 = first.queue[0]
      q.innerHTML = `<div class="qring"><div style="width:${(1 - t0.t / t0.total) * 100}%"></div></div><span>training ×${first.queue.length}</span>`
      dock.appendChild(q)
    }
  } else if (first.kind === 'barracks' && first.complete && first.team === 0) {
    sub = 'Trains swordsmen'
    dock.appendChild(button(`Train Swordsman<i>${trainCostLabel('swordsman')}</i>`, () => tryTrain(g, first, 'swordsman')))
    if (first.queue?.length) {
      const q = document.createElement('div')
      q.className = 'queue'
      const t0 = first.queue[0]
      q.innerHTML = `<div class="qring"><div style="width:${(1 - t0.t / t0.total) * 100}%"></div></div><span>training ×${first.queue.length}</span>`
      dock.appendChild(q)
    }
  } else if (isBuilding(first) && !first.complete) {
    sub = 'Under construction — send villagers to help'
  } else if (sameKind && first.kind === 'villager') {
    sub = 'Tap a tree/mine to gather, a site to build'
    dock.appendChild(button(`Build House<i>${BUILDINGS.house.cost.wood} ${ICON.wood}</i>`, () => { g.placing = 'house'; g.uiDirty = true }))
    dock.appendChild(button(`Build Barracks<i>${BUILDINGS.barracks.cost.wood} ${ICON.wood}</i>`, () => { g.placing = 'barracks'; g.uiDirty = true }))
  } else if (sameKind && first.kind === 'swordsman') {
    sub = 'Tap the map to move, tap a foe to attack'
  }

  info.innerHTML = `<b>${name}${count}</b><span>${sub}</span>`
}
