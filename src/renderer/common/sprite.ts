// Загрузка листов персонажа через pet-asset:// и отрисовка кадров на canvas.

import { frameRect, resolveAnimation, sheetFrameAt } from '../../shared/frames'
import { extensionOf } from '../../shared/paths'
import type { CharacterSummary, Direction } from '../../shared/types'

export function assetUrl(character: CharacterSummary, file: string): string {
  return character.baseUrl + file.split('/').map(encodeURIComponent).join('/')
}

export class SpriteSheets {
  private images = new Map<string, HTMLImageElement>()

  constructor(readonly character: CharacterSummary) {}

  async load(): Promise<void> {
    const entries = Object.entries(this.character.manifest.sheets)
    await Promise.all(
      entries.map(async ([name, sheet]) => {
        const image = new Image()
        // crossOrigin + CORS-заголовок протокола: canvas не «загрязняется», работает alpha hit-testing.
        image.crossOrigin = 'anonymous'
        image.src = assetUrl(this.character, sheet.file)
        await image.decode()
        this.images.set(name, image)
      })
    )
  }

  /**
   * Рисует кадр frame листа sheetName, вписывая его в canvas с сохранением пропорций (низ по краю).
   */
  drawFrame(ctx: CanvasRenderingContext2D, sheetName: string, frame: number, flip: boolean): void {
    const manifest = this.character.manifest
    const sheet = manifest.sheets[sheetName]
    const image = this.images.get(sheetName)
    const { width, height } = ctx.canvas
    ctx.clearRect(0, 0, width, height)
    if (!sheet || !image) return
    const rect = frameRect(sheet, frame)
    // SVG может иметь собственный внутренний размер — пересчитываем сетку в его координаты.
    if (extensionOf(sheet.file) === '.svg' && image.naturalWidth > 0) {
      const k = image.naturalWidth / (sheet.columns * sheet.frameWidth)
      rect.sx *= k
      rect.sy *= k
      rect.sw *= k
      rect.sh *= k
    }
    const box = { x: 0, y: 0, width, height }
    const scale = Math.min(box.width / rect.sw, box.height / rect.sh)
    const dw = rect.sw * scale
    const dh = rect.sh * scale
    const dx = box.x + (box.width - dw) / 2
    const dy = box.y + box.height - dh
    ctx.imageSmoothingEnabled = !manifest.pixelArt
    ctx.imageSmoothingQuality = 'high'
    ctx.save()
    if (flip) {
      ctx.translate(dx + dw / 2, 0)
      ctx.scale(-1, 1)
      ctx.translate(-(dx + dw / 2), 0)
    }
    ctx.drawImage(image, rect.sx, rect.sy, rect.sw, rect.sh, dx, dy, dw, dh)
    // Плавное растворение низа (в тех же трансформациях, что и кадр — градиент едет вместе с ним).
    const fade = manifest.fadeBottom
    if (fade) {
      const h = dh * fade
      const top = dy + dh - h
      const gradient = ctx.createLinearGradient(0, top, 0, dy + dh)
      gradient.addColorStop(0, 'rgba(0,0,0,0)')
      gradient.addColorStop(0.55, 'rgba(0,0,0,0.45)')
      gradient.addColorStop(1, 'rgba(0,0,0,1)')
      ctx.globalCompositeOperation = 'destination-out'
      ctx.fillStyle = gradient
      ctx.fillRect(dx - 2, top, dw + 4, h + 2)
      ctx.globalCompositeOperation = 'source-over'
    }
    ctx.restore()
  }

  drawAnimation(ctx: CanvasRenderingContext2D, name: string, elapsedMs: number, flip: boolean): void {
    const { animation } = resolveAnimation(this.character.manifest, name)
    this.drawFrame(ctx, animation.sheet, sheetFrameAt(animation, elapsedMs), flip)
  }

  drawLook(ctx: CanvasRenderingContext2D, direction: Direction): boolean {
    const look = this.character.manifest.look
    if (!look) return false
    this.drawFrame(ctx, look.sheet, look.frames[direction], false)
    return true
  }
}

/** Подгоняет внутреннее разрешение canvas под размер на экране и DPI. */
export function fitCanvas(canvas: HTMLCanvasElement): boolean {
  const ratio = window.devicePixelRatio || 1
  const width = Math.max(1, Math.round(canvas.clientWidth * ratio))
  const height = Math.max(1, Math.round(canvas.clientHeight * ratio))
  if (canvas.width === width && canvas.height === height) return false
  canvas.width = width
  canvas.height = height
  return true
}
