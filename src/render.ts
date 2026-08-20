// Camera + world rendering.
import { Game, Ent, BUILDINGS, WORLD_W, WORLD_H, isUnit, isBuilding } from './data'
import { isVisibleToPlayer, canPlaceAt } from './world'
import {
  drawTree, drawMine, drawBush, drawQuarry, drawTC, drawHouse, drawBarracks,
  drawLumberCamp, drawMiningCamp, drawMill, drawFarm, drawWatchtower, drawArcheryRange, drawSite,
  drawVillager, drawSwordsman, drawSpearman, drawArcher, drawScout,
} from './sprites'

let groundPattern: CanvasPattern | null = null
let fogCanvas: HTMLCanvasElement | null = null

// Fog overlay drawn from a tiny grid canvas, scaled up so the bilinear
// filtering gives soft cloudy edges. Cosy deep-forest dark, not pure black.
function drawFog(ctx: CanvasRenderingContext2D, g: Game): void {
  const { w, h, explored, visible } = g.fog
  if (!fogCanvas) {
    fogCanvas = document.createElement('canvas')
    fogCanvas.width = w
    fogCanvas.height = h
  }
  const fctx = fogCanvas.getContext('2d')!
  const img = fctx.createImageData(w, h)
  const d = img.data
  for (let i = 0; i < w * h; i++) {
    const o = i * 4
    d[o] = 30; d[o + 1] = 42; d[o + 2] = 26
    d[o + 3] = explored[i] ? (visible[i] ? 0 : 118) : 255
  }
  fctx.putImageData(img, 0, 0)
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(fogCanvas, 0, 0, w, h, 0, 0, w * 32, h * 32)
}

function makeGroundPattern(ctx: CanvasRenderingContext2D): CanvasPattern {
  const c = document.createElement('canvas')
  c.width = c.height = 384
  const g = c.getContext('2d')!
  g.fillStyle = '#A9C97E'
  g.fillRect(0, 0, 384, 384)
  // soft meadow patches
  const rnd = (() => { let s = 7; return () => { s = (s * 16807) % 2147483647; return s / 2147483647 } })()
  for (let i = 0; i < 16; i++) {
    g.fillStyle = i % 2 ? 'rgba(190, 214, 140, 0.5)' : 'rgba(150, 184, 104, 0.45)'
    g.beginPath()
    g.ellipse(rnd() * 384, rnd() * 384, 24 + rnd() * 46, 16 + rnd() * 30, rnd() * 3, 0, Math.PI * 2)
    g.fill()
  }
  // grass tufts
  g.strokeStyle = 'rgba(110, 148, 78, 0.55)'
  g.lineWidth = 1.6
  for (let i = 0; i < 44; i++) {
    const x = rnd() * 384, y = rnd() * 384
    g.beginPath()
    g.moveTo(x, y); g.quadraticCurveTo(x + 1.5, y - 4, x + 3, y - 6)
    g.moveTo(x + 3, y); g.quadraticCurveTo(x + 3.5, y - 3.5, x + 5.5, y - 5)
    g.stroke()
  }
  // tiny flowers
  for (let i = 0; i < 10; i++) {
    const x = rnd() * 384, y = rnd() * 384
    g.fillStyle = i % 2 ? '#F7F1DE' : '#F0C9CF'
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2
      g.beginPath(); g.arc(x + Math.cos(a) * 2.4, y + Math.sin(a) * 2.4, 1.5, 0, Math.PI * 2); g.fill()
    }
    g.fillStyle = '#E9B44C'
    g.beginPath(); g.arc(x, y, 1.6, 0, Math.PI * 2); g.fill()
  }
  return ctx.createPattern(c, 'repeat')!
}

export function render(g: Game, canvas: HTMLCanvasElement, time: number): void {
  const ctx = canvas.getContext('2d')!
  const dpr = window.devicePixelRatio || 1
  const vw = canvas.width / dpr, vh = canvas.height / dpr
  ctx.save()
  ctx.scale(dpr, dpr)

  // beyond-the-map backdrop matches the fog dark so unexplored map blends out
  ctx.fillStyle = '#1E2A1A'
  ctx.fillRect(0, 0, vw, vh)

  const cam = g.camera
  ctx.translate(vw / 2, vh / 2)
  ctx.scale(cam.zoom, cam.zoom)
  ctx.translate(-cam.x, -cam.y)

  // meadow
  if (!groundPattern) groundPattern = makeGroundPattern(ctx)
  ctx.fillStyle = groundPattern
  ctx.beginPath()
  const cr = 46
  ctx.moveTo(cr, 0)
  ctx.arcTo(WORLD_W, 0, WORLD_W, WORLD_H, cr)
  ctx.arcTo(WORLD_W, WORLD_H, 0, WORLD_H, cr)
  ctx.arcTo(0, WORLD_H, 0, 0, cr)
  ctx.arcTo(0, 0, WORLD_W, 0, cr)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(70, 92, 48, 0.5)'
  ctx.lineWidth = 6
  ctx.stroke()

  // selection rings under everything else
  for (const id of g.selection) {
    const e = g.byId.get(id)
    if (!e) continue
    ctx.strokeStyle = 'rgba(255, 252, 240, 0.95)'
    ctx.lineWidth = 2.6
    ctx.beginPath()
    ctx.ellipse(e.x, e.y + (isBuilding(e) ? e.r * 0.45 : 5), e.r + 6, (e.r + 6) * 0.5, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(233, 180, 76, 0.9)'
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.ellipse(e.x, e.y + (isBuilding(e) ? e.r * 0.45 : 5), e.r + 9, (e.r + 9) * 0.5, 0, 0, Math.PI * 2)
    ctx.stroke()
  }

  // entities, painter's order (garrisoned units inside, enemy units in fog unseen)
  const sorted = g.ents
    .filter(e => !e.hidden && !(isUnit(e) && e.team === 1 && !isVisibleToPlayer(g, e)))
    .sort((a, b) => (a.y + a.r) - (b.y + b.r))
  for (const e of sorted) {
    switch (e.kind) {
      case 'tree': drawTree(ctx, e, time); break
      case 'goldmine': drawMine(ctx, e); break
      case 'berrybush': drawBush(ctx, e, time); break
      case 'stonequarry': drawQuarry(ctx, e); break
      case 'farm': e.complete ? drawFarm(ctx, e, time) : drawSite(ctx, e); break
      case 'towncenter': e.complete ? drawTC(ctx, e, time) : drawSite(ctx, e); break
      case 'house': e.complete ? drawHouse(ctx, e, time) : drawSite(ctx, e); break
      case 'barracks': e.complete ? drawBarracks(ctx, e, time) : drawSite(ctx, e); break
      case 'watchtower': e.complete ? drawWatchtower(ctx, e, time) : drawSite(ctx, e); break
      case 'archeryrange': e.complete ? drawArcheryRange(ctx, e, time) : drawSite(ctx, e); break
      case 'lumbercamp': e.complete ? drawLumberCamp(ctx, e) : drawSite(ctx, e); break
      case 'miningcamp': e.complete ? drawMiningCamp(ctx, e) : drawSite(ctx, e); break
      case 'mill': e.complete ? drawMill(ctx, e, time) : drawSite(ctx, e); break
      case 'villager': drawVillager(ctx, e, time); break
      case 'swordsman': drawSwordsman(ctx, e, time); break
      case 'spearman': drawSpearman(ctx, e, time); break
      case 'archer': drawArcher(ctx, e, time); break
      case 'scout': drawScout(ctx, e, time); break
    }
    // health bar when hurt
    if ((isUnit(e) || isBuilding(e)) && e.hp < e.maxHp && e.hp > 0 && (e.complete !== false)) {
      const w = isBuilding(e) ? 40 : 18
      const y = e.y - e.r - (isBuilding(e) ? e.r * 0.8 : 22)
      ctx.fillStyle = 'rgba(60, 46, 30, 0.45)'
      rrFill(ctx, e.x - w / 2 - 1, y - 1, w + 2, 5, 2.5)
      ctx.fillStyle = e.team === 0 ? '#8FBF6A' : '#D98A7F'
      rrFill(ctx, e.x - w / 2, y, Math.max(2, w * (e.hp / e.maxHp)), 3, 1.5)
    }
  }

  // arrows
  for (const p of g.projectiles) {
    const dx = p.tx - p.x, dy = p.ty - p.y
    const d = Math.hypot(dx, dy) || 1
    const nx = dx / d, ny = dy / d
    ctx.strokeStyle = '#6F5238'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(p.x - nx * 6, p.y - ny * 6)
    ctx.lineTo(p.x + nx * 4, p.y + ny * 4)
    ctx.stroke()
    ctx.fillStyle = '#FBF3E4'
    ctx.beginPath()
    ctx.arc(p.x + nx * 5, p.y + ny * 5, 1.6, 0, Math.PI * 2)
    ctx.fill()
  }

  // particles
  for (const p of g.particles) {
    const a = 1 - p.life / p.maxLife
    ctx.globalAlpha = Math.max(0, a * 0.85)
    ctx.fillStyle = p.color
    ctx.beginPath()
    if (p.kind === 'leaf') {
      ctx.ellipse(p.x, p.y, p.size * 0.8, p.size * 0.45, p.life * 4, 0, Math.PI * 2)
    } else {
      ctx.arc(p.x, p.y, p.size * (p.kind === 'puff' ? 0.6 + p.life : 1), 0, Math.PI * 2)
    }
    ctx.fill()
  }
  ctx.globalAlpha = 1

  drawFog(ctx, g)

  // placement ghost rides above the fog so it's always legible
  if (g.placing && g.placePos) {
    const b = BUILDINGS[g.placing]
    const { x, y } = g.placePos
    const ok = canPlaceAt(g, g.placing, x, y)
    // square footprint, squashed to sit on the ground plane
    const f = b.foot
    const fh = f * 0.72
    ctx.fillStyle = ok ? 'rgba(143, 191, 106, 0.28)' : 'rgba(201, 82, 94, 0.32)'
    rrFill(ctx, x - f, y - fh + b.r * 0.2, f * 2, fh * 2, 8)
    ctx.strokeStyle = ok ? 'rgba(251, 243, 228, 0.95)' : 'rgba(201, 82, 94, 0.95)'
    ctx.lineWidth = 2.4
    ctx.setLineDash([7, 6])
    ctx.beginPath()
    ctx.moveTo(x - f + 8, y - fh + b.r * 0.2)
    ctx.arcTo(x + f, y - fh + b.r * 0.2, x + f, y - fh + b.r * 0.2 + fh * 2, 8)
    ctx.arcTo(x + f, y - fh + b.r * 0.2 + fh * 2, x - f, y - fh + b.r * 0.2 + fh * 2, 8)
    ctx.arcTo(x - f, y - fh + b.r * 0.2 + fh * 2, x - f, y - fh + b.r * 0.2, 8)
    ctx.arcTo(x - f, y - fh + b.r * 0.2, x + f, y - fh + b.r * 0.2, 8)
    ctx.closePath()
    ctx.stroke()
    ctx.setLineDash([])
    // half-opacity preview of the building itself
    ctx.globalAlpha = 0.55
    const ghost: any = {
      id: 0, kind: g.placing, team: 0, x, y, r: b.r, hp: 1, maxHp: 1, seed: 7,
      complete: true, garrison: 0, queue: [],
    }
    switch (g.placing) {
      case 'towncenter': drawTC(ctx, ghost, time); break
      case 'house': drawHouse(ctx, ghost, time); break
      case 'farm': drawFarm(ctx, ghost, time); break
      case 'barracks': drawBarracks(ctx, ghost, time); break
      case 'archeryrange': drawArcheryRange(ctx, ghost, time); break
      case 'watchtower': drawWatchtower(ctx, ghost, time); break
      case 'lumbercamp': drawLumberCamp(ctx, ghost); break
      case 'miningcamp': drawMiningCamp(ctx, ghost); break
      case 'mill': drawMill(ctx, ghost, time); break
    }
    ctx.globalAlpha = 1
  }

  ctx.restore()
}

function rrFill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
  ctx.fill()
}
