// Тестовые изображения и манифесты, создаваемые на лету.

import { deflateSync } from 'node:zlib'

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc(buf: Buffer): number {
  let c = 0xffffffff
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const sum = Buffer.alloc(4)
  sum.writeUInt32BE(crc(body))
  return Buffer.concat([len, body, sum])
}

/** Прозрачный PNG width×height. */
export function png(width: number, height: number): Uint8Array {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const raw = Buffer.alloc((width * 4 + 1) * height)
  return new Uint8Array(
    Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
  )
}

/** Заголовок WebP (VP8X) — для проверки чтения размеров, без реального изображения. */
export function webpHeader(width: number, height: number): Uint8Array {
  const b = new Uint8Array(30)
  b.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0)
  b.set([...'WEBPVP8X'].map((c) => c.charCodeAt(0)), 8)
  const w = width - 1
  const h = height - 1
  b.set([w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff], 24)
  b.set([h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff], 27)
  return b
}

/** Покадровый персонаж: лист 4×2 по 32 px, idle/walk/drag/happy. */
export function spriteManifest(file = 'sheet.png') {
  return {
    formatVersion: 1,
    name: 'Спрайтик',
    facing: 'right',
    pixelArt: true,
    sheets: { main: { file, frameWidth: 32, frameHeight: 32, columns: 4, rows: 2 } },
    animations: {
      idle: { sheet: 'main', frames: [0, 1], fps: 3, loop: true },
      walk: { sheet: 'main', frames: [4, 5, 6, 7], fps: 8, loop: true },
      drag: { sheet: 'main', frames: [2], fps: 1, loop: true },
      happy: { sheet: 'main', frames: [3, 2, 3], fps: 10, loop: false }
    },
    reactions: { click: ['happy'] }
  }
}
