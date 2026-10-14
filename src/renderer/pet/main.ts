// Окно питомца: только рисует состояние из main и сообщает о вводе мыши.
// Кадр выбирается по состоянию; при его смене кадры плавно перетекают друг в друга.
// Пока идёт перетекание или автоанимация — цикл requestAnimationFrame с частотой экрана (браузер сам
// останавливает его, когда окно скрыто); в остальное время — перерисовка только при смене кадра.
// Дыхание — CSS-анимация холста на видеокарте, без перерисовки.

import { frameIndexAt, msUntilNextFrame, resolveAnimation } from '../../shared/frames'
import { BLINK_FADE_MS, Blinker, FADE_MS, blinkFrame, easeOut, stepFade } from '../../shared/smooth'
import type { Direction, PetConfig, PetView } from '../../shared/types'
import { SpriteSheets, fitCanvas } from '../common/sprite'
import type { BlackCatRig } from '../common/rigs/blackCat'
import { RIGS } from '../common/rigs'

const api = window.petApi
const canvas = document.getElementById('pet') as HTMLCanvasElement
const ctx = canvas.getContext('2d', { willReadFrequently: true })!
// Холсты для перетекания: старый и новый кадр рисуются отдельно и смешиваются.
const layerA = document.createElement('canvas')
const layerB = document.createElement('canvas')

const DRAG_THRESHOLD = 4
const ALPHA_THRESHOLD = 24
const SQUASH: Keyframe[] = [
  { transform: 'scale(1, 1)', easing: 'ease-in' },
  { transform: 'scale(1.08, 0.88)', offset: 0.18, easing: 'ease-out' },
  { transform: 'scale(0.96, 1.06)', offset: 0.45, easing: 'ease-in-out' },
  { transform: 'scale(1.02, 0.98)', offset: 0.72, easing: 'ease-in-out' },
  { transform: 'scale(1, 1)' }
]

let config: PetConfig | null = null
let sheets: SpriteSheets | null = null
let view: PetView | null = null
let gaze: Direction = 'center'
let startedAt = performance.now()
let frameTimer: number | null = null
let rafId: number | null = null
let loadToken = 0
let blinker: Blinker | null = null
/** Персонаж-«кукла»: рисуется кодом каждый кадр. */
let rig: BlackCatRig | null = null
let cursorPos: { x: number; y: number } | null = null
let lastRigDraw = 0

interface FrameRef {
  sheet: string
  frame: number
  flip: boolean
}

/** Что сейчас на экране и откуда перетекаем. */
let shown: FrameRef | null = null
let previous: FrameRef | null = null
let fadeStart = 0
let fadeMs = 0

const same = (a: FrameRef | null, b: FrameRef | null): boolean =>
  !!a && !!b && a.sheet === b.sheet && a.frame === b.frame && a.flip === b.flip

/** Кадр для текущего момента и длительность перетекания к нему. */
function targetFrame(now: number): { ref: FrameRef; fade: number } | null {
  if (!sheets || !view) return null
  const manifest = sheets.character.manifest
  const smooth = config?.smooth ?? true
  if (view.look !== null && manifest.look) {
    const direction = view.gaze ? gaze : view.look
    const blink = smooth && blinker && direction === 'center' && view.mode === 'idle' ? blinkFrame(manifest) : null
    if (blink && blinker!.closed(now)) return { ref: { ...blink, flip: false }, fade: BLINK_FADE_MS }
    // Глаза открываются так же быстро, как закрывались.
    const fade = blink && shown && shown.sheet === blink.sheet && shown.frame === blink.frame ? BLINK_FADE_MS : FADE_MS
    return { ref: { sheet: manifest.look.sheet, frame: manifest.look.frames[direction], flip: false }, fade: smooth ? fade : 0 }
  }
  const { animation } = resolveAnimation(manifest, view.animation)
  const elapsed = now - startedAt
  const ref = { sheet: animation.sheet, frame: animation.frames[frameIndexAt(animation, elapsed)], flip: view.flip }
  // Внутри анимации — короткое перетекание; при смене состояния — обычное.
  const inside = shown && shown.sheet === ref.sheet && elapsed > 1
  const fade = !smooth ? 0 : inside ? stepFade(animation.fps, manifest.pixelArt) : manifest.pixelArt ? 0 : FADE_MS
  return { ref, fade }
}

function sizeLayer(layer: HTMLCanvasElement): CanvasRenderingContext2D {
  if (layer.width !== canvas.width || layer.height !== canvas.height) {
    layer.width = canvas.width
    layer.height = canvas.height
  }
  return layer.getContext('2d')!
}

function drawRig(now: number): void {
  if (!rig || !view) return
  canvas.classList.remove('breathing')
  rig.draw(ctx, now, {
    mode: view.mode,
    animation: view.animation,
    seq: view.seq,
    flip: view.flip,
    pointer: cursorPos,
    view: { width: canvas.clientWidth, height: canvas.clientHeight },
    walkSpeed: view.speed ?? config?.speed,
    baseSpeed: config?.speed,
    stopAt: view.stopAt
  })
  lastRigDraw = now
  // Живая анимация рисуется постоянно, частота — по ситуации (см. tick).
  if (rafId === null) {
    rafId = requestAnimationFrame(function tick(time) {
      rafId = null
      // 60 к/с при быстром движении, 30 — в покое, ~20 — без «плавности».
      const interval = !(config?.smooth ?? true) ? 50 : rig?.fast ? 0 : 33
      if (time - lastRigDraw < interval) {
        rafId = requestAnimationFrame(tick)
        return
      }
      draw()
    })
  }
}

function draw(): void {
  if (frameTimer !== null) window.clearTimeout(frameTimer)
  frameTimer = null
  fitCanvas(canvas)
  const now = performance.now()
  if (rig) return drawRig(now)
  const target = targetFrame(now)
  if (!sheets || !view || !target) {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    return
  }
  const current = target.ref
  if (!same(current, shown)) {
    previous = shown && target.fade > 0 ? shown : null
    shown = current
    fadeStart = now
    fadeMs = target.fade
  }
  const smooth = config?.smooth ?? true
  // Дыхание покадровых персонажей — CSS-анимацией холста (см. pet.html), без перерисовки.
  canvas.classList.toggle('breathing', smooth && !sheets.character.manifest.pixelArt && view.mode !== 'drag')
  const t = previous ? easeOut((now - fadeStart) / Math.max(1, fadeMs)) : 1
  if (previous && t < 1) {
    // Перетекание: сложение «lighter» с весами (1−t) и t даёт честную смесь без провала прозрачности.
    sheets.drawFrame(sizeLayer(layerA), previous.sheet, previous.frame, previous.flip)
    sheets.drawFrame(sizeLayer(layerB), current.sheet, current.frame, current.flip)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 1 - t
    ctx.drawImage(layerA, 0, 0)
    ctx.globalAlpha = t
    ctx.drawImage(layerB, 0, 0)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  } else {
    previous = null
    sheets.drawFrame(ctx, current.sheet, current.frame, current.flip)
  }
  schedule(now, previous !== null)
}

/** Следующая перерисовка: непрерывно, пока что-то движется, иначе — к смене кадра анимации. */
function schedule(now: number, moving: boolean): void {
  if (moving) {
    if (rafId === null) {
      rafId = requestAnimationFrame(() => {
        rafId = null
        // С частотой экрана (60, на ProMotion — 120 к/с).
        draw()
      })
    }
    return
  }
  if (!sheets || !view) return
  const waits: number[] = []
  if (view.look === null) {
    const { animation } = resolveAnimation(sheets.character.manifest, view.animation)
    const wait = msUntilNextFrame(animation, now - startedAt)
    if (wait !== null) waits.push(wait)
  }
  if (blinker && (config?.smooth ?? true)) waits.push(blinker.msUntilChange(now))
  if (waits.length > 0) frameTimer = window.setTimeout(draw, Math.max(1, Math.min(...waits)))
}

async function applyConfig(next: PetConfig): Promise<void> {
  const token = ++loadToken
  const changed = !config || config.character.id !== next.character.id || config.character.baseUrl !== next.character.baseUrl
  config = next
  if (!changed) {
    draw()
    return
  }
  const loading = new SpriteSheets(next.character)
  try {
    await loading.load()
  } catch (error) {
    console.error('Не удалось загрузить листы персонажа', error)
  }
  if (token !== loadToken) return
  sheets = loading
  shown = null
  previous = null
  rig = next.character.manifest.rig ? new RIGS[next.character.manifest.rig]() : null
  blinker = blinkFrame(next.character.manifest) ? new Blinker(performance.now()) : null
  draw()
}

function applyView(next: PetView): void {
  if (!view || view.seq !== next.seq) startedAt = performance.now()
  view = next
  canvas.classList.toggle('dragging', next.mode === 'drag')
  draw()
}

// ---------- клики сквозь прозрачные области ----------

let interactive = false

function setInteractive(value: boolean): void {
  if (value === interactive) return
  interactive = value
  api.setInteractive(value)
}

function opaqueAt(clientX: number, clientY: number): boolean {
  const ratio = canvas.width / Math.max(1, canvas.clientWidth)
  const x = Math.floor(clientX * ratio)
  const y = Math.floor(clientY * ratio)
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return false
  try {
    return ctx.getImageData(x, y, 1, 1).data[3] > ALPHA_THRESHOLD
  } catch {
    // Безопасный запасной вариант: если пиксель прочитать нельзя, окно кликабельно целиком.
    return true
  }
}

window.addEventListener('mousemove', (event) => {
  if (!config?.clickThrough || pointer) return
  setInteractive(opaqueAt(event.clientX, event.clientY))
})
document.addEventListener('mouseleave', () => {
  if (config?.clickThrough && !pointer) setInteractive(false)
})

// ---------- перетаскивание и клик ----------

let pointer: { id: number; x: number; y: number; dragging: boolean } | null = null

canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return
  canvas.setPointerCapture(event.pointerId)
  pointer = { id: event.pointerId, x: event.screenX, y: event.screenY, dragging: false }
})

canvas.addEventListener('pointermove', (event) => {
  if (!pointer || pointer.id !== event.pointerId || pointer.dragging) return
  if (Math.hypot(event.screenX - pointer.x, event.screenY - pointer.y) >= DRAG_THRESHOLD) {
    pointer.dragging = true
    api.dragStart()
  }
})

function endPointer(event: PointerEvent, cancelled: boolean): void {
  if (!pointer || pointer.id !== event.pointerId) return
  const wasDragging = pointer.dragging
  pointer = null
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
  if (wasDragging) {
    api.dragEnd()
  } else if (!cancelled) {
    api.click()
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      canvas.animate(SQUASH, { duration: 420, easing: 'linear' })
    }
  }
}

canvas.addEventListener('pointerup', (event) => endPointer(event, false))
canvas.addEventListener('pointercancel', (event) => endPointer(event, true))
canvas.addEventListener('lostpointercapture', (event) => endPointer(event, true))

canvas.addEventListener('contextmenu', (event) => {
  event.preventDefault()
  api.contextMenu()
})

window.addEventListener('resize', draw)

// ---------- старт ----------

api.onConfig((next) => void applyConfig(next))
api.onView(applyView)
api.onPointer((next) => {
  cursorPos = next
})
api.onLook((direction) => {
  gaze = direction
  if (view?.gaze) draw()
})

void api.init().then(async ({ config: initial, view: initialView, look }) => {
  gaze = look
  view = initialView
  await applyConfig(initial)
  applyView(initialView)
})
