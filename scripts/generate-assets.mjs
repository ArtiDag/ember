// Иконки трея и иконка приложения Ember — знак «тлеющий уголёк с глазами» (тлеет розовым, глаза без зрачков) (общий для всех персонажей).
// Без внешних зависимостей: простые фигуры растеризуются с суперсэмплингом, PNG кодируется через zlib.
//
//   node scripts/generate-assets.mjs

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// ---------- PNG ----------

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// ---------- фигуры (координаты в единицах 0..100) ----------

const ellipse = (cx, cy, rx, ry, angle = 0) => {
  const c = Math.cos((-angle * Math.PI) / 180)
  const s = Math.sin((-angle * Math.PI) / 180)
  return (x, y) => {
    const dx = x - cx
    const dy = y - cy
    const u = (dx * c - dy * s) / rx
    const v = (dx * s + dy * c) / ry
    return u * u + v * v <= 1
  }
}
function insidePolygon(poly, x, y) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

const BLACK = [0, 0, 0, 255]
const HOLE = [0, 0, 0, 0]
const INK = [20, 20, 22, 255]
const WHITE = [251, 251, 247, 255]
function rasterize(size, layers, ss = 4) {
  const out = new Uint8Array(size * size * 4)
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const x = ((px + (sx + 0.5) / ss) / size) * 100
          const y = ((py + (sy + 0.5) / ss) / size) * 100
          let color = null
          for (const [shape, c] of layers) if (shape(x, y)) color = typeof c === 'function' ? c(x, y) : c
          if (!color) continue
          const ca = color[3] / 255
          r += color[0] * ca
          g += color[1] * ca
          b += color[2] * ca
          a += ca
        }
      }
      const i = (py * size + px) * 4
      if (a > 0) {
        out[i] = Math.round(r / a)
        out[i + 1] = Math.round(g / a)
        out[i + 2] = Math.round(b / a)
        out[i + 3] = Math.round((a / (ss * ss)) * 255)
      }
    }
  }
  return out
}

function write(path, buffer) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, buffer)
  console.log('  ', path.replace(root + '/', ''))
}

// ---------- знак Ember: тлеющий уголёк с глазами ----------
// Не конкретный персонаж (кот, кролик…), а их общий «дух»: тёмный круглый уголёк, край снизу справа тлеет розовым,
// над ним — искра. Тот же знак рисует шапка настроек (src/renderer/settings/HeaderControls.tsx, EMBER).
const EMBER = { cx: 50, cy: 58, a: 32, b: 28, n: 2.6 }
const PINK = [255, 143, 163, 255]
/** «Радиус» точки в суперэллипсе угля: 0 — центр, 1 — край. */
const emberR = (x, y) => (Math.abs((x - EMBER.cx) / EMBER.a) ** EMBER.n + Math.abs((y - EMBER.cy) / EMBER.b) ** EMBER.n) ** (1 / EMBER.n)
const emberBody = (x, y) => emberR(x, y) <= 1
/** Цвет угля: тёмный, у края снизу справа — розовое свечение. */
const emberColor = (x, y) => {
  const edge = Math.min(1, Math.max(0, (emberR(x, y) - 0.78) / 0.22))
  const dx = (x - EMBER.cx) / EMBER.a
  const dy = (y - EMBER.cy) / EMBER.b
  const toward = Math.max(0, (dx * 0.55 + dy * 0.83) / Math.hypot(dx, dy || 1e-6))
  const w = edge * edge * toward ** 1.6 * 0.95
  return [0, 1, 2].map((k) => Math.round(INK[k] + (PINK[k] - INK[k]) * w)).concat(255)
}
/** Четырёхлучевая искра с центром (x, y), радиус r. */
const spark = (cx, cy, r) => {
  const pts = []
  for (let k = 0; k < 8; k++) {
    const ang = (k * Math.PI) / 4 - Math.PI / 2
    const rr = k % 2 ? r * 0.26 : r
    pts.push([cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr])
  }
  return (x, y) => insidePolygon(pts, x, y)
}
function emberLayers({ body, glow, white, pupil, sparkColor, sparkR = 7 }) {
  const layers = [[emberBody, glow ? emberColor : body]]
  for (const ex of [40, 60]) {
    layers.push([ellipse(ex, 57, 5.5, 6.6), white])
    if (pupil) {
      layers.push([ellipse(ex + 0.6, 58.2, 2.7, 2.7), pupil])
      layers.push([ellipse(ex + 1.5, 57, 0.9, 0.9), white])
    }
  }
  layers.push([spark(71, 23, sparkR), sparkColor])
  if (sparkR <= 7) layers.push([ellipse(78.5, 31, 1.6, 1.6), sparkColor])
  return layers
}

// Иконка приложения 1024×1024: только знак Ember на прозрачном фоне, без подложки (icns/ico electron-builder делает сам).
// Знак увеличен так, чтобы уголёк с искрой занимал почти весь квадрат.
const fit = (layers, k, cx, cy) => {
  const to = (f) => (x, y) => f(cx + (x - 50) / k, cy + (y - 50) / k)
  return layers.map(([shape, c]) => [to(shape), typeof c === 'function' ? to(c) : c])
}
const ICON = 1024
const appLayers = fit(emberLayers({ glow: true, white: WHITE, sparkColor: PINK }), 1.22, 51.5, 51)
write(join(root, 'build/icon.png'), encodePng(ICON, ICON, rasterize(ICON, appLayers, 2)))

// Windows-трей: тот же знак в миниатюре, 32×32 (16×16 Windows получит масштабированием).
const trayLayers = fit(emberLayers({ glow: true, white: WHITE, sparkColor: PINK }), 1.3, 51.5, 51)
write(join(root, 'resources/icons/tray.png'), encodePng(32, 32, rasterize(32, trayLayers, 6)))

// macOS: шаблонная иконка — чёрный уголёк с прозрачными глазами и искрой. 16 и 32 px (@2x).
// (координаты чуть растянуты, чтобы знак занимал почти всю высоту строки меню)
// (в строке меню искра крупнее — иначе в 16 px её не видно)
const templateLayers = emberLayers({ body: BLACK, white: HOLE, sparkColor: BLACK, sparkR: 10 }).map(([shape, c]) => [
  (x, y) => shape(12 + x * 0.78, 10 + y * 0.82),
  c
])
write(join(root, 'resources/icons/trayTemplate.png'), encodePng(16, 16, rasterize(16, templateLayers, 6)))
write(join(root, 'resources/icons/trayTemplate@2x.png'), encodePng(32, 32, rasterize(32, templateLayers, 6)))

console.log('Готово.')
