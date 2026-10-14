// Выбор кадров анимации и их прямоугольников в листе.

import type { AnimationDef, CharacterManifest, SheetDef } from './types'

export interface FrameRect {
  sx: number
  sy: number
  sw: number
  sh: number
}

export function animationDuration(animation: AnimationDef): number {
  return (animation.frames.length / animation.fps) * 1000
}

/** Позиция в массиве frames для момента elapsedMs от начала анимации. */
export function frameIndexAt(animation: AnimationDef, elapsedMs: number): number {
  const count = animation.frames.length
  const step = Math.floor(Math.max(0, elapsedMs) / (1000 / animation.fps))
  return animation.loop ? step % count : Math.min(step, count - 1)
}

/** Номер кадра в листе для момента elapsedMs. */
export function sheetFrameAt(animation: AnimationDef, elapsedMs: number): number {
  return animation.frames[frameIndexAt(animation, elapsedMs)]
}

/** Сколько миллисекунд до смены кадра; null — кадр больше не изменится. */
export function msUntilNextFrame(animation: AnimationDef, elapsedMs: number): number | null {
  if (animation.frames.length < 2) return null
  const frameMs = 1000 / animation.fps
  if (!animation.loop && elapsedMs >= frameMs * (animation.frames.length - 1)) return null
  const intoFrame = Math.max(0, elapsedMs) % frameMs
  return Math.max(1, Math.ceil(frameMs - intoFrame))
}

export function frameRect(sheet: SheetDef, frame: number): FrameRect {
  const column = frame % sheet.columns
  const row = Math.floor(frame / sheet.columns)
  return { sx: column * sheet.frameWidth, sy: row * sheet.frameHeight, sw: sheet.frameWidth, sh: sheet.frameHeight }
}

/** Возвращает анимацию с запасными вариантами: walk/drag → idle, неизвестная → idle. */
export function resolveAnimation(manifest: CharacterManifest, name: string): { name: string; animation: AnimationDef } {
  const animation = manifest.animations[name]
  if (animation) return { name, animation }
  return { name: 'idle', animation: manifest.animations.idle }
}
