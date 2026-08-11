import { copyFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const output = resolve(root, 'miniprogram/assets')
await mkdir(output, { recursive: true })

const assets = [
  ['prototype/mobile-v2/public/app-assets/logo.png', 'logo.png'],
  ['prototype/mobile-v2/public/app-assets/main-glyph-overlay.png', 'main-glyph-overlay.png'],
  ['prototype/mobile-v2/public/app-assets/growth-chart.png', 'growth-chart.png']
]
for (const [source, target] of assets) await copyFile(resolve(root, source), resolve(output, target))
console.log(`synced ${assets.length} approved raster assets`)
