// Выбор реакции на клик: по кругу из reactions.click, после быстрой серии — rapidClick.

import type { CharacterManifest } from './types'

export const RAPID_CLICKS = 4
export const RAPID_WINDOW_MS = 1600

export class ClickCounter {
  private count = 0
  private at = -Infinity
  private cursor = 0

  /** Регистрирует клик и возвращает имя анимации или null. */
  register(manifest: CharacterManifest, now: number): string | null {
    this.count = now - this.at < RAPID_WINDOW_MS ? this.count + 1 : 1
    this.at = now
    const reactions = manifest.reactions
    if (reactions?.rapidClick && this.count >= RAPID_CLICKS) {
      this.count = 0
      return reactions.rapidClick
    }
    const list = reactions?.click ?? (manifest.animations.react ? ['react'] : [])
    if (list.length === 0) return null
    const name = list[this.cursor % list.length]
    this.cursor += 1
    return name
  }
}
