import { describe, expect, it } from 'vitest'
import type { CharacterManifest } from '../src/shared/types'
import { BLINK_HOLD_MS, Blinker, FADE_MS, blinkFrame, easeOut, stepFade } from '../src/shared/smooth'

describe('плавность', () => {
  it('кривая перетекания от 0 до 1, монотонная', () => {
    expect(easeOut(0)).toBe(0)
    expect(easeOut(1)).toBe(1)
    expect(easeOut(2)).toBe(1)
    expect(easeOut(0.5)).toBeGreaterThan(0.5)
    expect(easeOut(0.3)).toBeLessThan(easeOut(0.6))
  })

  it('внутри анимации перетекание не дольше половины кадра, у пиксель-арта — нет', () => {
    expect(stepFade(2, false)).toBe(FADE_MS)
    expect(stepFade(10, false)).toBeCloseTo(45)
    expect(stepFade(10, true)).toBe(0)
  })

  it('моргание: закрыто ~130 мс раз в 2,5–6 с', () => {
    const b = new Blinker(0, () => 0) // первое моргание через 2,5 с
    expect(b.closed(2000)).toBe(false)
    expect(b.msUntilChange(2000)).toBe(500)
    expect(b.closed(2500)).toBe(true)
    expect(b.closed(2500 + BLINK_HOLD_MS - 1)).toBe(true)
    expect(b.closed(2500 + BLINK_HOLD_MS + 1)).toBe(false)
    expect(b.closed(2500 + BLINK_HOLD_MS + 100)).toBe(false)
  })

  it('кадр моргания: первый кадр анимации blink', () => {
    const sheet = { file: 'r.png', frameWidth: 100, frameHeight: 100, columns: 3, rows: 3 }
    const m: CharacterManifest = {
      formatVersion: 1,
      name: 'x',
      facing: 'right',
      pixelArt: false,
      sheets: { reactions: sheet },
      animations: { idle: { sheet: 'reactions', frames: [4], fps: 1, loop: true }, blink: { sheet: 'reactions', frames: [0], fps: 1, loop: false } }
    }
    expect(blinkFrame(m)).toEqual({ sheet: 'reactions', frame: 0 })
    expect(blinkFrame({ ...m, animations: { idle: m.animations.idle } })).toBeNull()
  })
})
