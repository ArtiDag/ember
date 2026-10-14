// Плавность для покадровых персонажей: перетекание кадров и моргание (дыхание — CSS в pet.html).
// Чистая логика — время подаётся снаружи.

import type { CharacterManifest } from './types'

/** Длительность перетекания при смене взгляда, реакции, засыпании, мс. */
export const FADE_MS = 140
/** Моргание: перетекание короче, чтобы глаза закрывались «быстро». */
export const BLINK_FADE_MS = 60
export const BLINK_HOLD_MS = 130

/** Плавная кривая 0..1 → 0..1 (быстрый старт, мягкое окончание). */
export function easeOut(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return 1 - (1 - x) * (1 - x) * (1 - x)
}

/** Длительность перетекания между двумя кадрами одной анимации: не дольше половины кадра. */
export function stepFade(fps: number, pixelArt: boolean): number {
  if (pixelArt) return 0
  return Math.min(FADE_MS, (1000 / fps) * 0.45)
}

/** Какой кадр показывать при моргании: первый кадр анимации blink. */
export function blinkFrame(manifest: CharacterManifest): { sheet: string; frame: number } | null {
  const blink = manifest.animations.blink
  if (blink) return { sheet: blink.sheet, frame: blink.frames[0] }
  return null
}

/** Расписание морганий: раз в 2,5–6 с на ~130 мс. */
export class Blinker {
  private next: number

  constructor(
    now: number,
    private readonly random: () => number = Math.random
  ) {
    this.next = now + this.delay()
  }

  private delay(): number {
    return 2500 + this.random() * 3500
  }

  /** true — глаза сейчас закрыты. */
  closed(now: number): boolean {
    if (now < this.next) return false
    if (now < this.next + BLINK_HOLD_MS) return true
    this.next = now + this.delay()
    return false
  }

  /** Сколько мс до следующего изменения (для планирования перерисовки). */
  msUntilChange(now: number): number {
    if (now < this.next) return this.next - now
    return Math.max(1, this.next + BLINK_HOLD_MS - now)
  }
}
