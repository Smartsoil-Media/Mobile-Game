// Bundle src/ into two single-file outputs plus the PWA shell:
//   dist/index.html          — full HTML document for GitHub Pages / any static host
//   dist/artifact.html       — body-content fragment for publishing as a Claude Artifact
//   dist/manifest.webmanifest, dist/sw.js, dist/icon-*.png — home-screen app bits
import { build } from 'esbuild'
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'

const result = await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify: true,
  write: false,
})
const js = result.outputFiles[0].text
const css = readFileSync('src/style.css', 'utf8')
const page = readFileSync('src/page.html', 'utf8')

// content hash keys the service-worker cache, so each deploy refreshes it
function djb2(s) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0
  return h.toString(36)
}
const hash = djb2(js + css + page)

const fragment = `${page}
<style>
${css}</style>
<script>
${js}</script>
`

const fullDoc = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Bramblewick">
<meta name="theme-color" content="#75935A">
<title>Bramblewick</title>
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icon-180.png">
<link rel="icon" type="image/png" href="icon-192.png">
</head>
<body>
${fragment}</body>
</html>
`

const manifest = {
  name: 'Bramblewick',
  short_name: 'Bramblewick',
  description: 'A tiny cosy real-time strategy game',
  start_url: '.',
  scope: '.',
  display: 'fullscreen',
  orientation: 'any',
  background_color: '#75935A',
  theme_color: '#75935A',
  icons: [
    { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
  ],
}

const sw = `// Bramblewick service worker — network-first, cache fallback for offline play.
const CACHE = 'bramblewick-${hash}'
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()))
})
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone()
      caches.open(CACHE).then(c => c.put(e.request, copy))
      return res
    }).catch(() => caches.match(e.request))
  )
})
`

mkdirSync('dist', { recursive: true })
writeFileSync('dist/artifact.html', fragment)
writeFileSync('dist/index.html', fullDoc)
writeFileSync('dist/manifest.webmanifest', JSON.stringify(manifest, null, 2))
writeFileSync('dist/sw.js', sw)
for (const size of [512, 192, 180]) copyFileSync(`assets/icon-${size}.png`, `dist/icon-${size}.png`)
console.log(`built dist/index.html (${(fullDoc.length / 1024).toFixed(1)} kB), artifact.html, manifest, sw.js (cache ${hash}), icons`)
