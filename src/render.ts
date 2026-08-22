// Camera + world rendering.
import { Game, Ent, BUILDINGS, dist, isUnit, isBuilding } from './data'
import { isVisibleToPlayer, canPlaceAt, wallLinePoints, fogIndex } from './world'
import { inWater } from './nav'
import {
  drawTree, drawMine, drawBush, drawQuarry, drawDeer, drawCrag, drawCroc, drawTC, drawHouse, drawBarracks,
  drawLumberCamp, drawMiningCamp, drawMill, drawStable, drawFarm, drawWatchtower, drawArcheryRange, drawSite,
  drawWall, drawGate,
  drawAbbeyMill, drawKingsBarracks, drawGuildhall, drawWhiteKeep,
  drawChamberOfCommerce, drawCavalrySchool, drawRoyalVineyard, drawRedPalace,
  drawVillager, drawSwordsman, drawSpearman, drawArcher, drawScout, drawKnight,
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

interface View { x0: number; y0: number; x1: number; y1: number }

// ---- terrain character: broad, soft ground zones so the land reads as
// PLACES — lush hollows, dry golden grass, mossy shade, scree aprons, and
// gentle rises — instead of one repeating meadow tile ----
interface Zone { x: number; y: number; r: number; kind: 'lush' | 'dry' | 'moss' | 'scree' | 'rise'; seed: number }
let zones: Zone[] | null = null
let zoneKey = ''
function makeZones(g: Game): Zone[] {
  const rnd = (() => {
    let s = 91 + ((g.mapSeed >>> 0) % 1000000)
    return () => { s = (s * 16807) % 2147483647; return s / 2147483647 }
  })()
  const out: Zone[] = []
  const count = Math.round(26 * (g.world.w * g.world.h) / (1920 * 1280))
  const kinds: Zone['kind'][] = ['lush', 'lush', 'dry', 'dry', 'moss', 'scree', 'rise', 'rise']
  for (let i = 0; i < count; i++) {
    out.push({
      x: 120 + rnd() * (g.world.w - 240),
      y: 120 + rnd() * (g.world.h - 240),
      r: 90 + rnd() * 130,
      kind: kinds[Math.floor(rnd() * kinds.length)],
      seed: Math.floor(rnd() * 1000),
    })
  }
  return out
}

function drawZones(ctx: CanvasRenderingContext2D, g: Game, view: View): void {
  const key = `${g.mapSeed}:${g.world.w}x${g.world.h}`
  if (!zones || zoneKey !== key) { zones = makeZones(g); zoneKey = key }
  for (const z of zones) {
    if (z.x + z.r * 1.6 < view.x0 || z.x - z.r * 1.6 > view.x1 ||
      z.y + z.r * 1.2 < view.y0 || z.y - z.r * 1.2 > view.y1) continue
    const blob = (ox: number, oy: number, rx: number, ry: number, fill: string) => {
      ctx.fillStyle = fill
      ctx.beginPath()
      ctx.ellipse(z.x + ox, z.y + oy, rx, ry, (z.seed + ox) * 0.1, 0, Math.PI * 2)
      ctx.fill()
    }
    const o = (k: number) => ((z.seed >> k) % 5 - 2) * z.r * 0.14
    if (z.kind === 'lush') {
      blob(o(0), o(1), z.r, z.r * 0.66, 'rgba(122, 168, 82, 0.18)')
      blob(o(2) + z.r * 0.3, o(3), z.r * 0.7, z.r * 0.5, 'rgba(122, 168, 82, 0.14)')
      blob(o(4) - z.r * 0.3, o(5) + z.r * 0.2, z.r * 0.55, z.r * 0.4, 'rgba(140, 181, 106, 0.14)')
    } else if (z.kind === 'dry') {
      blob(o(0), o(1), z.r, z.r * 0.62, 'rgba(205, 193, 118, 0.20)')
      blob(o(2) - z.r * 0.25, o(3) + z.r * 0.15, z.r * 0.6, z.r * 0.42, 'rgba(214, 199, 128, 0.16)')
      // a few straw tufts
      ctx.strokeStyle = 'rgba(178, 162, 92, 0.6)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      for (let i = 0; i < 5; i++) {
        const a = z.seed + i * 2.3
        const tx = z.x + Math.cos(a) * z.r * 0.5, ty = z.y + Math.sin(a) * z.r * 0.35
        ctx.moveTo(tx, ty); ctx.quadraticCurveTo(tx + 2, ty - 6, tx + 4, ty - 9)
        ctx.moveTo(tx + 4, ty); ctx.quadraticCurveTo(tx + 5, ty - 5, tx + 8, ty - 7)
      }
      ctx.stroke()
    } else if (z.kind === 'moss') {
      blob(o(0), o(1), z.r * 0.9, z.r * 0.6, 'rgba(92, 138, 84, 0.15)')
      blob(o(2) + z.r * 0.2, o(3) + z.r * 0.1, z.r * 0.55, z.r * 0.4, 'rgba(80, 124, 76, 0.12)')
    } else if (z.kind === 'scree') {
      blob(o(0), o(1), z.r * 0.8, z.r * 0.5, 'rgba(172, 166, 148, 0.18)')
      for (let i = 0; i < 6; i++) {
        const a = z.seed * 0.7 + i * 1.9
        ctx.fillStyle = i % 2 ? 'rgba(150, 144, 126, 0.55)' : 'rgba(190, 184, 166, 0.6)'
        ctx.beginPath()
        ctx.ellipse(z.x + Math.cos(a) * z.r * 0.45, z.y + Math.sin(a) * z.r * 0.3,
          3.6 - (i % 3), 2.4 - (i % 3) * 0.5, a, 0, Math.PI * 2)
        ctx.fill()
      }
    } else { // rise: a gentle hill swell — soft light on its brow, soft shade below
      blob(0, z.r * 0.12, z.r, z.r * 0.62, 'rgba(66, 84, 44, 0.10)')
      blob(-z.r * 0.08, -z.r * 0.1, z.r * 0.88, z.r * 0.52, 'rgba(255, 252, 235, 0.13)')
      blob(-z.r * 0.16, -z.r * 0.22, z.r * 0.5, z.r * 0.3, 'rgba(255, 252, 235, 0.12)')
    }
  }
}

// ---- streams: winding water with sandy fords, drifting glints, bank reeds ----
function drawStreams(ctx: CanvasRenderingContext2D, g: Game, time: number): void {
  if (!g.streams.length) return
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  for (const s of g.streams) {
    const path = () => {
      ctx.beginPath()
      ctx.moveTo(s.pts[0].x, s.pts[0].y)
      for (let i = 1; i < s.pts.length; i++) ctx.lineTo(s.pts[i].x, s.pts[i].y)
    }
    path(); ctx.strokeStyle = '#C9BC94'; ctx.lineWidth = s.w + 16; ctx.stroke() // muddy banks
    path(); ctx.strokeStyle = '#6D9DC5'; ctx.lineWidth = s.w; ctx.stroke()
    path(); ctx.strokeStyle = '#7FB2D6'; ctx.lineWidth = Math.max(8, s.w - 14); ctx.stroke()
    // glints drifting downstream
    path(); ctx.strokeStyle = 'rgba(232, 244, 252, 0.7)'; ctx.lineWidth = 2.4
    ctx.setLineDash([14, 96]); ctx.lineDashOffset = -time * 26; ctx.stroke()
    ctx.lineWidth = 1.8
    ctx.setLineDash([9, 138]); ctx.lineDashOffset = -time * 18 + 60; ctx.stroke()
    ctx.setLineDash([])
  }
  // one clump of reeds with cattail heads (shared by banks and ford framing)
  const reedClump = (bx: number, by: number, seed: number, sc = 1) => {
    const sway = Math.sin(time * 1.1 + seed) * 1.6 * sc
    ctx.strokeStyle = '#5E8A4E'
    ctx.lineWidth = 1.6 * sc
    ctx.beginPath()
    ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx - 2 * sc, by - 9 * sc, bx - 3 * sc + sway, by - 15 * sc)
    ctx.moveTo(bx + 3 * sc, by); ctx.quadraticCurveTo(bx + 3 * sc, by - 10 * sc, bx + 5 * sc + sway, by - 17 * sc)
    ctx.moveTo(bx - 3 * sc, by); ctx.quadraticCurveTo(bx - 5 * sc, by - 7 * sc, bx - 8 * sc + sway, by - 11 * sc)
    ctx.stroke()
    ctx.fillStyle = '#8B6A4A'
    ctx.beginPath(); ctx.ellipse(bx - 3 * sc + sway, by - 15 * sc, 1.6 * sc, 3.4 * sc, 0.15, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.ellipse(bx + 5 * sc + sway, by - 17 * sc, 1.4 * sc, 3 * sc, -0.1, 0, Math.PI * 2); ctx.fill()
  }
  // the stream's direction where it passes a point (for framing the fords)
  const tangentAt = (x: number, y: number): { tx: number; ty: number } => {
    let best = Infinity, tx = 0, ty = 1
    for (const s of g.streams) {
      for (let i = 0; i + 1 < s.pts.length; i++) {
        const p = s.pts[i], q = s.pts[i + 1]
        const d = Math.hypot(x - (p.x + q.x) / 2, y - (p.y + q.y) / 2)
        if (d < best) {
          best = d
          const dl = Math.hypot(q.x - p.x, q.y - p.y) || 1
          tx = (q.x - p.x) / dl; ty = (q.y - p.y) / dl
        }
      }
    }
    return { tx, ty }
  }
  // fords: the stream itself turns shallow — the sandy bed glows up through
  // clear pale water (no land bridge), and stepping stones march across
  for (const f of g.fords) {
    const { tx: ftx, ty: fty } = tangentAt(f.x, f.y)
    const sw = g.streams[0]?.w ?? 46
    const seg = (len: number) => {
      ctx.beginPath()
      ctx.moveTo(f.x - ftx * len, f.y - fty * len)
      ctx.lineTo(f.x + ftx * len, f.y + fty * len)
    }
    ctx.lineCap = 'round'
    // layered bed strokes feather the shallows into the deep water at each end
    ctx.strokeStyle = 'rgba(219, 205, 162, 0.35)'
    ctx.lineWidth = sw - 2
    seg(f.r * 1.2); ctx.stroke()
    ctx.strokeStyle = 'rgba(219, 205, 162, 0.55)'
    seg(f.r * 0.95); ctx.stroke()
    ctx.strokeStyle = 'rgba(224, 211, 168, 0.65)'
    ctx.lineWidth = sw - 6
    seg(f.r * 0.72); ctx.stroke()
    // and a wash of pale water so the crossing still reads wet
    ctx.strokeStyle = 'rgba(168, 208, 228, 0.4)'
    ctx.lineWidth = sw - 4
    seg(f.r * 1.05); ctx.stroke()
    // stepping stones in a line across the current
    const nx = -fty, ny = ftx
    for (let i = -2; i <= 2; i++) {
      const jig = Math.sin(f.x * 0.11 + i * 3.7)
      const sx = f.x + nx * i * sw * 0.18 + ftx * jig * 5
      const sy = f.y + ny * i * sw * 0.18 + fty * jig * 5
      ctx.fillStyle = (i + 2) % 2 ? '#B8B2A0' : '#CFC9B8'
      ctx.beginPath()
      ctx.ellipse(sx, sy, 5.4, 3.8, jig * 0.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)' // a wet glint on each stone
      ctx.beginPath()
      ctx.ellipse(sx - 1.2, sy - 1.2, 2, 1.1, jig * 0.5, 0, Math.PI * 2)
      ctx.fill()
    }
    // ripple feathers where the current meets the shallows
    ctx.strokeStyle = 'rgba(240, 248, 252, 0.5)'
    ctx.lineWidth = 1.3
    for (const dir of [-1, 1]) {
      const cx = f.x + ftx * dir * f.r * 0.8
      const cy = f.y + fty * dir * f.r * 0.8
      ctx.beginPath()
      ctx.moveTo(cx - nx * sw * 0.24, cy - ny * sw * 0.24)
      ctx.quadraticCurveTo(cx + ftx * dir * 5, cy + fty * dir * 5, cx + nx * sw * 0.24, cy + ny * sw * 0.24)
      ctx.stroke()
    }
    // rich reed beds frame the crossing up- and downstream, where the
    // shallows meet deep water — the walking lane between stays open
    const { tx, ty } = tangentAt(f.x, f.y)
    for (const dir of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const along = f.r * (0.72 + k * 0.3)
        const aside = (k - 1) * 14
        reedClump(
          f.x + tx * dir * along - ty * aside,
          f.y + ty * dir * along + tx * aside,
          f.x * 0.03 + dir * 7 + k, 1 + (k === 1 ? 0.25 : 0))
      }
      // a lily pad or two resting just off the shallows
      const lx = f.x + tx * dir * f.r * 1.15 + ty * dir * 6
      const ly = f.y + ty * dir * f.r * 1.15 - tx * dir * 6
      const bob = Math.sin(time * 0.9 + dir + f.x * 0.01) * 1.2
      ctx.fillStyle = '#6F9C55'
      ctx.beginPath()
      ctx.ellipse(lx + bob, ly, 6.5, 4.2, 0.3 * dir, 0.35, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#82AF66'
      ctx.beginPath()
      ctx.ellipse(lx + bob - 4, ly + 5, 4.6, 3, -0.2 * dir, 0.35, Math.PI * 2)
      ctx.fill()
      if (dir > 0) { // one shy blossom
        ctx.fillStyle = '#F0C9CF'
        ctx.beginPath(); ctx.arc(lx + bob + 2, ly - 2, 2, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#E9B44C'
        ctx.beginPath(); ctx.arc(lx + bob + 2, ly - 2, 0.9, 0, Math.PI * 2); ctx.fill()
      }
    }
  }
  // reeds and cattails scattered along the banks between crossings
  for (const s of g.streams) {
    for (let i = 2; i + 1 < s.pts.length; i += 3) {
      const p = s.pts[i], q = s.pts[i + 1]
      const dl = Math.hypot(q.x - p.x, q.y - p.y) || 1
      const nx = -(q.y - p.y) / dl, ny = (q.x - p.x) / dl
      const side = i % 2 ? 1 : -1
      const bx = p.x + nx * side * (s.w / 2 + 10)
      const by = p.y + ny * side * (s.w / 2 + 10)
      if (g.fords.some(f => Math.hypot(bx - f.x, by - f.y) < f.r + 30)) continue
      reedClump(bx, by, i)
    }
  }
}

// Little touches of life scattered over the meadow: pebble clusters, toadstool
// rings, clover patches. Purely decorative, fixed per map, drawn under everything.
interface Decor { x: number; y: number; kind: 'pebbles' | 'mushrooms' | 'clover'; seed: number }
let decor: Decor[] | null = null
let decorKey = ''
function makeDecor(g: Game): Decor[] {
  const rnd = (() => { let s = 4242; return () => { s = (s * 16807) % 2147483647; return s / 2147483647 } })()
  const out: Decor[] = []
  const kinds: Decor['kind'][] = ['pebbles', 'mushrooms', 'clover']
  const count = Math.round(46 * (g.world.w * g.world.h) / (1920 * 1280)) // same density on any map
  for (let i = 0; i < count; i++) {
    out.push({
      x: 70 + rnd() * (g.world.w - 140),
      y: 70 + rnd() * (g.world.h - 140),
      kind: kinds[Math.floor(rnd() * 3)],
      seed: Math.floor(rnd() * 1000),
    })
  }
  return out
}

function drawDecor(ctx: CanvasRenderingContext2D, g: Game, view: View): void {
  const key = `${g.world.w}x${g.world.h}`
  if (!decor || decorKey !== key) { decor = makeDecor(g); decorKey = key }
  for (const d of decor) {
    if (d.x < view.x0 - 30 || d.x > view.x1 + 30 || d.y < view.y0 - 30 || d.y > view.y1 + 30) continue
    if (d.kind === 'pebbles') {
      ctx.fillStyle = 'rgba(160, 152, 130, 0.8)'
      for (let i = 0; i < 3; i++) {
        const a = (d.seed + i * 2.2)
        ctx.beginPath()
        ctx.ellipse(d.x + Math.cos(a) * 7, d.y + Math.sin(a) * 4, 3.4 - i * 0.6, 2.4 - i * 0.4, a, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.fillStyle = 'rgba(206, 198, 176, 0.85)'
      ctx.beginPath(); ctx.ellipse(d.x + 2, d.y - 1.5, 2, 1.4, 0.4, 0, Math.PI * 2); ctx.fill()
    } else if (d.kind === 'mushrooms') {
      for (let i = 0; i < 3; i++) {
        const mx = d.x + Math.cos(d.seed + i * 2.1) * 6
        const my = d.y + Math.sin(d.seed + i * 2.1) * 4
        ctx.fillStyle = '#EFE6D2'
        ctx.fillRect(mx - 1, my - 3, 2, 3.4)
        ctx.fillStyle = i % 2 ? '#C9525E' : '#D98E4A'
        ctx.beginPath(); ctx.ellipse(mx, my - 3.4, 3, 1.9, 0, Math.PI, 0); ctx.fill()
        ctx.fillStyle = 'rgba(251, 243, 228, 0.9)'
        ctx.beginPath(); ctx.arc(mx - 1, my - 4.2, 0.55, 0, Math.PI * 2); ctx.fill()
      }
    } else {
      ctx.fillStyle = 'rgba(122, 160, 88, 0.6)'
      for (let i = 0; i < 5; i++) {
        const a = d.seed + i * 1.3
        ctx.beginPath()
        ctx.ellipse(d.x + Math.cos(a) * 8, d.y + Math.sin(a) * 5, 2.6, 1.7, a, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.fillStyle = '#F7F1DE'
      ctx.beginPath(); ctx.arc(d.x + 3, d.y - 2, 1.3, 0, Math.PI * 2); ctx.fill()
    }
  }
}

// worn earth under the village: buildings press a ring of trodden dirt into
// the grass, so a settlement reads as lived-in rather than dropped-on
function drawWornEarth(ctx: CanvasRenderingContext2D, g: Game): void {
  for (const e of g.ents) {
    if (!isBuilding(e) || !e.complete) continue
    if (e.kind === 'wall' || e.kind === 'gate' || e.kind === 'farm') continue
    const f = BUILDINGS[e.kind].foot
    ctx.fillStyle = 'rgba(197, 174, 126, 0.42)'
    ctx.beginPath()
    ctx.ellipse(e.x, e.y + e.r * 0.32, f * 1.35, f * 0.8, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(172, 148, 100, 0.4)'
    for (let i = 0; i < 4; i++) {
      const a = e.seed * 0.7 + i * 1.7
      ctx.beginPath()
      ctx.ellipse(e.x + Math.cos(a) * f * 1.05, e.y + e.r * 0.32 + Math.sin(a) * f * 0.55, 4, 2.4, a, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

// a few butterflies looping lazily over the meadow — pure ambience
function drawButterflies(ctx: CanvasRenderingContext2D, g: Game, time: number): void {
  const anchors = [
    { fx: 0.29, fy: 0.65, c: '#F7F1DE' }, { fx: 0.51, fy: 0.44, c: '#F0C9CF' },
    { fx: 0.75, fy: 0.33, c: '#F7F1DE' }, { fx: 0.4, fy: 0.84, c: '#E9B44C' },
    { fx: 0.65, fy: 0.69, c: '#F0C9CF' }, { fx: 0.18, fy: 0.22, c: '#F7F1DE' },
    { fx: 0.86, fy: 0.8, c: '#F0C9CF' },
  ]
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i]
    const t = time * 0.5 + i * 2.1
    const x = a.fx * g.world.w + Math.sin(t) * 60 + Math.sin(t * 2.3) * 22
    const y = a.fy * g.world.h + Math.cos(t * 0.8) * 42 + Math.sin(t * 3.1) * 10
    if (g.fog.visible[fogIndex(g, x, y)] !== 1) continue // they live in the sunlight
    const flap = Math.abs(Math.sin(time * 10 + i))
    ctx.fillStyle = a.c
    ctx.beginPath()
    ctx.ellipse(x - 1.6, y, 2.6 * (0.35 + 0.65 * flap), 1.8, -0.4, 0, Math.PI * 2)
    ctx.ellipse(x + 1.6, y, 2.6 * (0.35 + 0.65 * flap), 1.8, 0.4, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(90, 70, 50, 0.8)'
    ctx.fillRect(x - 0.5, y - 1.6, 1, 3.2)
  }
}

// The meadow fades into fog-dark at the world's rim, so the edge of the map
// reads as unexplored gloom rolling in — never a hard border.
function drawEdgeFade(ctx: CanvasRenderingContext2D, g: Game): void {
  const { w: WW, h: WH } = g.world
  const F = 46
  const dark = (a: number) => `rgba(30, 42, 26, ${a})`
  let gr = ctx.createLinearGradient(0, 0, 0, F)
  gr.addColorStop(0, dark(1)); gr.addColorStop(1, dark(0))
  ctx.fillStyle = gr; ctx.fillRect(0, 0, WW, F)
  gr = ctx.createLinearGradient(0, WH, 0, WH - F)
  gr.addColorStop(0, dark(1)); gr.addColorStop(1, dark(0))
  ctx.fillStyle = gr; ctx.fillRect(0, WH - F, WW, F)
  gr = ctx.createLinearGradient(0, 0, F, 0)
  gr.addColorStop(0, dark(1)); gr.addColorStop(1, dark(0))
  ctx.fillStyle = gr; ctx.fillRect(0, 0, F, WH)
  gr = ctx.createLinearGradient(WW, 0, WW - F, 0)
  gr.addColorStop(0, dark(1)); gr.addColorStop(1, dark(0))
  ctx.fillStyle = gr; ctx.fillRect(WW - F, 0, F, WH)
  // opaque frame overlapping the boundary — buries the meadow's antialiased
  // edge so not even a hairline of the world rect survives
  const M = 600
  ctx.fillStyle = dark(1)
  ctx.fillRect(-M, -M, WW + M * 2, M + 2)
  ctx.fillRect(-M, WH - 2, WW + M * 2, M + 2)
  ctx.fillRect(-M, -M, M + 2, WH + M * 2)
  ctx.fillRect(WW - 2, -M, M + 2, WH + M * 2)
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
  const { w: WW, h: WH } = g.world
  ctx.moveTo(cr, 0)
  ctx.arcTo(WW, 0, WW, WH, cr)
  ctx.arcTo(WW, WH, 0, WH, cr)
  ctx.arcTo(0, WH, 0, 0, cr)
  ctx.arcTo(0, 0, WW, 0, cr)
  ctx.closePath()
  ctx.fill()

  // what the camera can see, for culling the ground dressing
  const view: View = {
    x0: cam.x - vw / 2 / cam.zoom - 60, x1: cam.x + vw / 2 / cam.zoom + 60,
    y0: cam.y - vh / 2 / cam.zoom - 60, y1: cam.y + vh / 2 / cam.zoom + 60,
  }
  drawZones(ctx, g, view)
  drawStreams(ctx, g, time)
  drawDecor(ctx, g, view)
  drawWornEarth(ctx, g)

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

  // entities, painter's order (garrisoned units inside, enemy units in fog
  // unseen; deer, like anything that moves, only exist in live sight)
  const sorted = g.ents
    .filter(e => !e.hidden && !(isUnit(e) && e.team === 1 && !isVisibleToPlayer(g, e)) &&
      !((e.kind === 'deer' || e.kind === 'croc') && g.fog.visible[fogIndex(g, e.x, e.y)] !== 1))
    .sort((a, b) => (a.y + a.r) - (b.y + b.r))
  for (const e of sorted) {
    switch (e.kind) {
      case 'tree': drawTree(ctx, e, time); break
      case 'deer': drawDeer(ctx, e, time); break
      case 'croc': drawCroc(ctx, e, time, e.hp > 0 && inWater(g, e.x, e.y)); break
      case 'crag': drawCrag(ctx, e); break
      case 'goldmine': drawMine(ctx, e); break
      case 'berrybush': drawBush(ctx, e, time); break
      case 'stonequarry': drawQuarry(ctx, e); break
      case 'farm': e.complete ? drawFarm(ctx, e, time) : drawSite(ctx, e); break
      case 'towncenter': e.complete ? drawTC(ctx, e, time, g.age[e.team] ?? 1) : drawSite(ctx, e); break
      case 'house': e.complete ? drawHouse(ctx, e, time, g.age[e.team] ?? 1) : drawSite(ctx, e); break
      case 'barracks': e.complete ? drawBarracks(ctx, e, time, g.age[e.team] ?? 1) : drawSite(ctx, e); break
      case 'watchtower': e.complete ? drawWatchtower(ctx, e, time) : drawSite(ctx, e); break
      case 'archeryrange': e.complete ? drawArcheryRange(ctx, e, time) : drawSite(ctx, e); break
      case 'lumbercamp': e.complete ? drawLumberCamp(ctx, e) : drawSite(ctx, e); break
      case 'miningcamp': e.complete ? drawMiningCamp(ctx, e) : drawSite(ctx, e); break
      case 'mill': e.complete ? drawMill(ctx, e, time, g.age[e.team] ?? 1) : drawSite(ctx, e); break
      case 'stable': e.complete ? drawStable(ctx, e, time) : drawSite(ctx, e); break
      case 'abbeymill': e.complete ? drawAbbeyMill(ctx, e, time) : drawSite(ctx, e); break
      case 'kingsbarracks': e.complete ? drawKingsBarracks(ctx, e, time) : drawSite(ctx, e); break
      case 'guildhall': e.complete ? drawGuildhall(ctx, e, time) : drawSite(ctx, e); break
      case 'whitekeep': e.complete ? drawWhiteKeep(ctx, e, time) : drawSite(ctx, e); break
      case 'chamberofcommerce': e.complete ? drawChamberOfCommerce(ctx, e, time) : drawSite(ctx, e); break
      case 'cavalryschool': e.complete ? drawCavalrySchool(ctx, e, time) : drawSite(ctx, e); break
      case 'royalvineyard': e.complete ? drawRoyalVineyard(ctx, e, time) : drawSite(ctx, e); break
      case 'redpalace': e.complete ? drawRedPalace(ctx, e, time) : drawSite(ctx, e); break
      case 'wall': e.complete ? drawWall(ctx, e) : drawSite(ctx, e); break
      case 'gate': e.complete
        ? drawGate(ctx, e, time, g.ents.some(u =>
            isUnit(u) && !u.hidden && u.team === e.team && dist(u.x, u.y, e.x, e.y) < 42))
        : drawSite(ctx, e)
        break
      case 'villager': drawVillager(ctx, e, time); break
      case 'swordsman': drawSwordsman(ctx, e, time, g.champs[e.team]?.infantry); break
      case 'spearman': drawSpearman(ctx, e, time, g.champs[e.team]?.infantry); break
      case 'archer': drawArcher(ctx, e, time, g.champs[e.team]?.ranged); break
      case 'scout': drawScout(ctx, e, time); break
      case 'knight': drawKnight(ctx, e, time, g.champs[e.team]?.cavalry); break
    }
    // health bar when hurt (hunted wildlife shows its last strength too)
    if ((isUnit(e) || isBuilding(e) || e.kind === 'deer' || e.kind === 'croc') && e.hp < e.maxHp && e.hp > 0 && (e.complete !== false)) {
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

  drawButterflies(ctx, g, time)

  drawFog(ctx, g)
  drawEdgeFade(ctx, g)

  // placement ghost rides above the fog so it's always legible
  if (g.placing === 'wall' && g.placePos && g.placeEnd) {
    // a dragged fence line: one little square per post, ends are grab handles
    const pts = wallLinePoints(g)
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]
      ctx.fillStyle = p.ok ? 'rgba(143, 191, 106, 0.3)' : 'rgba(201, 82, 94, 0.34)'
      rrFill(ctx, p.x - 8, p.y - 5, 16, 12, 3)
      if (p.ok) {
        ctx.globalAlpha = 0.55
        drawWall(ctx, { x: p.x, y: p.y, seed: i } as any)
        ctx.globalAlpha = 1
      }
    }
    ctx.strokeStyle = 'rgba(251, 243, 228, 0.95)'
    ctx.lineWidth = 2.4
    ctx.setLineDash([5, 4])
    for (const h of [g.placePos, g.placeEnd]) {
      ctx.beginPath(); ctx.arc(h.x, h.y, 16, 0, Math.PI * 2); ctx.stroke()
    }
    ctx.setLineDash([])
  } else if (g.placing && g.placePos) {
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
      case 'towncenter': drawTC(ctx, ghost, time, g.age[0]); break
      case 'house': drawHouse(ctx, ghost, time, g.age[0]); break
      case 'farm': drawFarm(ctx, ghost, time); break
      case 'barracks': drawBarracks(ctx, ghost, time, g.age[0]); break
      case 'archeryrange': drawArcheryRange(ctx, ghost, time); break
      case 'watchtower': drawWatchtower(ctx, ghost, time); break
      case 'lumbercamp': drawLumberCamp(ctx, ghost); break
      case 'miningcamp': drawMiningCamp(ctx, ghost); break
      case 'mill': drawMill(ctx, ghost, time, g.age[0]); break
      case 'stable': drawStable(ctx, ghost, time); break
      case 'gate': drawGate(ctx, ghost, time, false); break
      case 'abbeymill': drawAbbeyMill(ctx, ghost, time); break
      case 'kingsbarracks': drawKingsBarracks(ctx, ghost, time); break
      case 'guildhall': drawGuildhall(ctx, ghost, time); break
      case 'whitekeep': drawWhiteKeep(ctx, ghost, time); break
      case 'chamberofcommerce': drawChamberOfCommerce(ctx, ghost, time); break
      case 'cavalryschool': drawCavalrySchool(ctx, ghost, time); break
      case 'royalvineyard': drawRoyalVineyard(ctx, ghost, time); break
      case 'redpalace': drawRedPalace(ctx, ghost, time); break
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
