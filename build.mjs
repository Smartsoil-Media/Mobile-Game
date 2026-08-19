// Bundle src/ into two single-file outputs:
//   dist/index.html    — full HTML document for local dev / any static host
//   dist/artifact.html — body-content fragment for publishing as a Claude Artifact
import { build } from 'esbuild'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

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
</head>
<body>
${fragment}</body>
</html>
`

mkdirSync('dist', { recursive: true })
writeFileSync('dist/artifact.html', fragment)
writeFileSync('dist/index.html', fullDoc)
console.log(`built dist/index.html (${(fullDoc.length / 1024).toFixed(1)} kB) and dist/artifact.html`)
