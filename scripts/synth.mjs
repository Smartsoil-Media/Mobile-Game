// Renders the Bramblewick sound bank as 22.05kHz mono WAVs.
//
// These are stand-ins built from modal synthesis and shaped noise: a struck
// object is a handful of decaying sine partials, so wood, stone, metal and
// bells all fall out of the same little toolkit. Anything dropped into
// audio-src/ by hand wins over the synthesised version of the same name.
import { writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'audio-src')
const SR = 22050

// ---------------------------------------------------------------- primitives

// Seeded so a rebuild that changed nothing produces byte-identical files and
// the service worker cache hash stays put.
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const buf = (secs) => new Float32Array(Math.ceil(secs * SR))

function mix(dst, src, gain = 1, atSec = 0) {
  const off = Math.round(atSec * SR)
  for (let i = 0; i < src.length; i++) {
    const j = i + off
    if (j >= 0 && j < dst.length) dst[j] += src[i] * gain
  }
  return dst
}

// A struck body: partials that ring on after the hit. Inharmonic ratios read
// as metal or stone, near-harmonic ones as wood.
function modal(secs, partials, seedPhase = 0) {
  const out = buf(secs)
  for (const p of partials) {
    const w = 2 * Math.PI * p.f / SR
    const k = 1 / (p.decay * SR)
    const ph = p.phase ?? seedPhase
    for (let i = 0; i < out.length; i++) {
      out[i] += p.amp * Math.sin(w * i + ph) * Math.exp(-k * i)
    }
  }
  return out
}

function noise(secs, seed) {
  const r = rng(seed)
  const out = buf(secs)
  for (let i = 0; i < out.length; i++) out[i] = r() * 2 - 1
  return out
}

// Simple state-variable filter, swept by a per-sample frequency function.
const SVF_MAX = SR / 6.4 // this topology goes unstable above roughly SR/6

function svf(src, freqAt, q = 1.2, mode = 'bp') {
  const out = new Float32Array(src.length)
  let low = 0, band = 0
  for (let i = 0; i < src.length; i++) {
    const t = i / src.length
    const want = typeof freqAt === 'function' ? freqAt(t) : freqAt
    const f = Math.max(20, Math.min(want, SVF_MAX))
    const g = 2 * Math.sin(Math.PI * f / SR)
    const damp = 1 / Math.max(0.55, q)
    const high = src[i] - low - damp * band
    band += g * high
    low += g * band
    if (!Number.isFinite(band) || !Number.isFinite(low)) { band = 0; low = 0 }
    out[i] = mode === 'lp' ? low : mode === 'hp' ? high : band
  }
  return out
}

// Attack/decay shape. `curve` above 1 leans the decay later, below 1 earlier.
function env(src, attack, decay, curve = 1) {
  const n = src.length
  const a = Math.max(1, Math.round(attack * SR))
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const rise = i < a ? i / a : 1
    const t = Math.max(0, i - a) / SR
    out[i] = src[i] * rise * Math.pow(Math.exp(-t / decay), curve)
  }
  return out
}

// Horn-ish tone: a stack of harmonics rolling off, with a touch of vibrato.
function horn(secs, f, { amp = 1, harm = 7, roll = 1.1, vib = 0.004 } = {}) {
  const out = buf(secs)
  for (let i = 0; i < out.length; i++) {
    const t = i / SR
    const bend = 1 + vib * Math.sin(2 * Math.PI * 5.2 * t)
    let s = 0
    for (let h = 1; h <= harm; h++) s += Math.sin(2 * Math.PI * f * bend * h * t) / Math.pow(h, roll)
    out[i] = s * amp * 0.42
  }
  return out
}

// Struck skin: a sine that drops in pitch as it decays.
function drum(secs, f0, f1, decay, amp = 1) {
  const out = buf(secs)
  let ph = 0
  for (let i = 0; i < out.length; i++) {
    const t = i / SR
    const f = f1 + (f0 - f1) * Math.exp(-t / (decay * 0.35))
    ph += 2 * Math.PI * f / SR
    out[i] = Math.sin(ph) * Math.exp(-t / decay) * amp
  }
  return out
}

// Scatter short bursts through a window — rubble, rustling leaves, coins.
function grains(secs, count, seed, { fLo = 600, fHi = 2400, len = 0.03, spread = 1 } = {}) {
  const r = rng(seed)
  const out = buf(secs)
  for (let n = 0; n < count; n++) {
    const at = r() * secs * spread
    const f = fLo + r() * (fHi - fLo)
    const g = env(svf(noise(len, seed + n * 977), f, 3.5), 0.0006, len * 0.35)
    mix(out, g, 0.5 + r() * 0.5, at)
  }
  return out
}

// ------------------------------------------------------------------ mastering

function normalise(x, peak = 0.89) {
  let m = 0
  for (let i = 0; i < x.length; i++) {
    if (!Number.isFinite(x[i])) x[i] = 0
    m = Math.max(m, Math.abs(x[i]))
  }
  if (m < 1e-6) return x
  const k = peak / m
  for (let i = 0; i < x.length; i++) x[i] *= k
  return x
}

// Trim silence, then fade the very edges so nothing clicks on playback.
function tidy(x, gate = 0.0016) {
  let s = 0, e = x.length - 1
  while (s < e && Math.abs(x[s]) < gate) s++
  while (e > s && Math.abs(x[e]) < gate) e--
  const cut = x.slice(Math.max(0, s - 24), Math.min(x.length, e + 220))
  const f = Math.min(64, Math.floor(cut.length / 8))
  for (let i = 0; i < f; i++) {
    cut[i] *= i / f
    cut[cut.length - 1 - i] *= i / f
  }
  return normalise(cut)
}

function wav(samples) {
  const n = samples.length
  const b = Buffer.alloc(44 + n * 2)
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8)
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20)
  b.writeUInt16LE(1, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28)
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34)
  b.write('data', 36); b.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]))
    b.writeInt16LE(Math.round(v * 32767), 44 + i * 2)
  }
  return b
}

// ---------------------------------------------------------------- the bank

const BANK = {
  // A villager's axe biting into a trunk.
  chop() {
    const o = buf(0.34)
    mix(o, env(svf(noise(0.05, 11), t => 2600 - 1400 * t, 1.1), 0.0004, 0.012), 0.8)
    mix(o, modal(0.34, [
      { f: 168, amp: 1.0, decay: 0.10 }, { f: 384, amp: 0.55, decay: 0.07 },
      { f: 712, amp: 0.30, decay: 0.045 }, { f: 1290, amp: 0.16, decay: 0.03 },
    ]), 0.9)
    mix(o, env(svf(noise(0.18, 23), 900, 2.2), 0.002, 0.05), 0.14)
    return o
  },

  // Pick on stone: brighter, drier, a little grit thrown off.
  mine() {
    const o = buf(0.3)
    mix(o, env(svf(noise(0.04, 31), 3400, 1.4), 0.0003, 0.008), 0.85)
    mix(o, modal(0.3, [
      { f: 214, amp: 0.9, decay: 0.055 }, { f: 497, amp: 0.5, decay: 0.04 },
      { f: 1130, amp: 0.35, decay: 0.03 }, { f: 2870, amp: 0.22, decay: 0.02 },
    ]), 0.85)
    mix(o, grains(0.22, 7, 37, { fLo: 1800, fHi: 5200, len: 0.018 }), 0.2, 0.03)
    return o
  },

  // Hands through a berry bush.
  forage() {
    const o = buf(0.4)
    mix(o, grains(0.36, 14, 53, { fLo: 1400, fHi: 4600, len: 0.035 }), 0.7)
    mix(o, env(svf(noise(0.3, 59), t => 2200 + 900 * Math.sin(t * 7), 1.6), 0.03, 0.11), 0.18)
    return o
  },

  // A scythe through standing wheat.
  harvest() {
    const o = buf(0.42)
    mix(o, env(svf(noise(0.3, 67), t => 700 + 2600 * Math.sin(Math.PI * t), 1.9), 0.02, 0.1), 0.75)
    mix(o, grains(0.34, 9, 71, { fLo: 900, fHi: 3000, len: 0.04 }), 0.35, 0.06)
    return o
  },

  // Resources tipped into the store: a soft sack, then a little jingle.
  drop() {
    const o = buf(0.46)
    mix(o, env(svf(noise(0.14, 83), 620, 1.1, 'lp'), 0.003, 0.05), 0.5)
    mix(o, modal(0.4, [
      { f: 2170, amp: 0.5, decay: 0.13 }, { f: 3190, amp: 0.34, decay: 0.1 },
      { f: 4610, amp: 0.2, decay: 0.08 }, { f: 6100, amp: 0.12, decay: 0.06 },
    ]), 0.55, 0.03)
    return o
  },

  // One blow of a builder's hammer.
  hammer() {
    const o = buf(0.22)
    mix(o, env(svf(noise(0.03, 97), 3000, 1.2), 0.0003, 0.007), 0.6)
    mix(o, modal(0.22, [
      { f: 292, amp: 1.0, decay: 0.045 }, { f: 660, amp: 0.5, decay: 0.03 },
      { f: 1180, amp: 0.28, decay: 0.022 },
    ]), 0.95)
    return o
  },

  // A stake driven in as the site is pegged out.
  place() {
    const o = buf(0.34)
    mix(o, drum(0.3, 190, 78, 0.1, 0.9), 0.8)
    mix(o, modal(0.3, [
      { f: 240, amp: 0.6, decay: 0.06 }, { f: 545, amp: 0.3, decay: 0.04 },
    ]), 0.7)
    mix(o, env(svf(noise(0.12, 103), 1500, 1.0, 'lp'), 0.002, 0.04), 0.2)
    return o
  },

  // The roof goes on: a drum and a warm open chord.
  built() {
    const o = buf(1.1)
    mix(o, drum(0.5, 120, 58, 0.22, 1), 0.7)
    for (const [i, f] of [261.63, 392.0, 523.25].entries()) {
      mix(o, env(horn(0.9, f, { harm: 5, roll: 1.5 }), 0.03, 0.34), 0.5, 0.04 + i * 0.045)
    }
    mix(o, modal(0.8, [{ f: 1046, amp: 0.3, decay: 0.3 }, { f: 1568, amp: 0.16, decay: 0.24 }]), 0.35, 0.09)
    return o
  },

  // A soldier steps out of the barracks.
  muster() {
    const o = buf(0.68)
    mix(o, env(horn(0.2, 329.63, { harm: 6 }), 0.02, 0.1), 0.75, 0)
    mix(o, env(horn(0.44, 440.0, { harm: 6 }), 0.02, 0.16), 0.8, 0.15)
    mix(o, env(svf(noise(0.1, 109), 1800, 1.4), 0.004, 0.03), 0.12)
    return o
  },

  // Blade on blade.
  sword() {
    const o = buf(0.42)
    mix(o, env(svf(noise(0.03, 127), 3300, 1.0), 0.0002, 0.006), 0.5)
    mix(o, modal(0.42, [
      { f: 1810, amp: 0.7, decay: 0.16 }, { f: 2680, amp: 0.55, decay: 0.13 },
      { f: 3930, amp: 0.4, decay: 0.1 }, { f: 5240, amp: 0.28, decay: 0.08 },
      { f: 7150, amp: 0.18, decay: 0.05 }, { f: 318, amp: 0.5, decay: 0.07 },
    ]), 0.85)
    return o
  },

  // Bowstring let go.
  bow() {
    const o = buf(0.3)
    mix(o, env(svf(noise(0.06, 131), t => 900 + 1800 * (1 - t), 2.6), 0.0006, 0.02), 0.7)
    mix(o, modal(0.2, [{ f: 148, amp: 0.7, decay: 0.035 }, { f: 430, amp: 0.3, decay: 0.025 }]), 0.6)
    mix(o, env(svf(noise(0.2, 137), t => 3200 - 2400 * t, 2.2), 0.01, 0.06), 0.3, 0.03)
    return o
  },

  // An arrow finding timber.
  arrowhit() {
    const o = buf(0.26)
    mix(o, env(svf(noise(0.03, 139), 2400, 1.3), 0.0003, 0.008), 0.45)
    mix(o, modal(0.26, [
      { f: 196, amp: 0.9, decay: 0.06 }, { f: 462, amp: 0.4, decay: 0.04 },
      { f: 880, amp: 0.2, decay: 0.028 },
    ]), 0.9)
    return o
  },

  // The trebuchet arm swings: rope, timber, then the counterweight drops.
  launch() {
    const o = buf(0.78)
    mix(o, env(svf(noise(0.26, 149), t => 320 + 640 * t, 5.5), 0.05, 0.12), 0.3)
    mix(o, modal(0.5, [
      { f: 94, amp: 1.0, decay: 0.2 }, { f: 218, amp: 0.55, decay: 0.14 },
      { f: 393, amp: 0.3, decay: 0.09 },
    ]), 0.85, 0.2)
    mix(o, env(svf(noise(0.36, 151), t => 1900 - 1500 * t, 1.8), 0.03, 0.12), 0.28, 0.24)
    return o
  },

  // Boulder finds its mark.
  boom() {
    const o = buf(0.85)
    mix(o, drum(0.7, 84, 34, 0.26, 1), 0.9)
    mix(o, env(svf(noise(0.4, 157), 430, 0.9, 'lp'), 0.001, 0.14), 0.55)
    mix(o, grains(0.6, 16, 163, { fLo: 500, fHi: 2600, len: 0.03 }), 0.3, 0.05)
    return o
  },

  // Timbers give way and the whole thing comes down.
  crumble() {
    const o = buf(1.25)
    mix(o, drum(0.9, 70, 30, 0.4, 0.8), 0.7)
    mix(o, grains(1.05, 34, 167, { fLo: 380, fHi: 2200, len: 0.045 }), 0.55, 0.04)
    mix(o, env(svf(noise(0.9, 173), t => 900 - 500 * t, 0.9, 'lp'), 0.02, 0.32), 0.3)
    return o
  },

  // Thumb on the HUD.
  tap() {
    const o = buf(0.14)
    mix(o, modal(0.14, [
      { f: 920, amp: 0.8, decay: 0.028 }, { f: 1840, amp: 0.35, decay: 0.02 },
      { f: 2760, amp: 0.14, decay: 0.014 },
    ]), 0.85)
    return o
  },

  // The town bell over the rooftops.
  bell() {
    const o = buf(1.9)
    const f = 523.25
    const parts = [
      [0.5, 0.55, 1.7], [1.0, 1.0, 1.15], [1.19, 0.65, 0.8], [1.56, 0.42, 0.6],
      [2.0, 0.34, 0.45], [2.51, 0.22, 0.32], [2.66, 0.18, 0.28], [3.01, 0.12, 0.2],
    ]
    mix(o, modal(1.9, parts.map(([r, a, d], i) => ({ f: f * r, amp: a, decay: d, phase: i * 0.7 }))), 0.75)
    mix(o, env(svf(noise(0.05, 179), 3100, 1.1), 0.0004, 0.012), 0.18)
    return o
  },

  // Gate leaves swinging open.
  gate() {
    const o = buf(0.9)
    mix(o, env(svf(noise(0.6, 181), t => 420 + 380 * Math.sin(t * 9) + 260 * t, 6.5), 0.06, 0.24), 0.42)
    mix(o, modal(0.5, [
      { f: 112, amp: 0.8, decay: 0.16 }, { f: 268, amp: 0.4, decay: 0.1 },
    ]), 0.6, 0.5)
    return o
  },

  // The realm comes of age.
  ageup() {
    const o = buf(1.9)
    const notes = [261.63, 329.63, 392.0, 523.25]
    notes.forEach((f, i) => {
      mix(o, env(horn(1.0, f, { harm: 7, roll: 1.15 }), 0.025, i === 3 ? 0.5 : 0.16), 0.55, i * 0.13)
    })
    mix(o, modal(1.4, [
      { f: 1046.5, amp: 0.45, decay: 0.6 }, { f: 1244, amp: 0.24, decay: 0.45 },
      { f: 1568, amp: 0.3, decay: 0.5 },
    ]), 0.45, 0.4)
    mix(o, drum(0.6, 110, 52, 0.24, 0.8), 0.45)
    return o
  },

  // Won.
  victory() {
    const o = buf(2.6)
    const motif = [[392.0, 0], [392.0, 0.16], [523.25, 0.32], [659.25, 0.6], [783.99, 0.92]]
    for (const [f, at] of motif) {
      mix(o, env(horn(1.3, f, { harm: 8, roll: 1.1 }), 0.02, at > 0.8 ? 0.62 : 0.19), 0.5, at)
    }
    for (const f of [392.0, 523.25, 783.99]) {
      mix(o, env(horn(1.4, f, { harm: 5, roll: 1.4 }), 0.05, 0.55), 0.28, 0.92)
    }
    mix(o, modal(1.9, [
      { f: 1568, amp: 0.4, decay: 0.7 }, { f: 2093, amp: 0.22, decay: 0.55 },
    ]), 0.4, 0.95)
    mix(o, drum(0.7, 118, 55, 0.28, 0.9), 0.45, 0.9)
    return o
  },

  // Lost.
  defeat() {
    const o = buf(2.5)
    const motif = [[329.63, 0], [293.66, 0.34], [246.94, 0.68], [196.0, 1.02]]
    for (const [f, at] of motif) {
      mix(o, env(horn(1.5, f, { harm: 6, roll: 1.35, vib: 0.007 }), 0.05, at > 0.9 ? 0.72 : 0.26), 0.55, at)
    }
    mix(o, drum(1.0, 78, 38, 0.42, 0.9), 0.5, 1.0)
    mix(o, env(svf(noise(1.2, 191), 320, 0.8, 'lp'), 0.15, 0.45), 0.1, 0.9)
    return o
  },
}

// ---------------------------------------------------------------------- run

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })
const only = process.argv.slice(2)
let wrote = 0
for (const [name, make] of Object.entries(BANK)) {
  if (only.length && !only.includes(name)) continue
  const path = join(OUT, `${name}.wav`)
  if (existsSync(join(OUT, `${name}.src.wav`))) {
    console.log(`  ${name.padEnd(10)} skipped — a hand-picked source is in place`)
    continue
  }
  const data = wav(tidy(make()))
  writeFileSync(path, data)
  wrote++
  console.log(`  ${name.padEnd(10)} ${(data.length / 1024).toFixed(1)} KB`)
}
console.log(`synth: ${wrote} sound${wrote === 1 ? '' : 's'} rendered`)
