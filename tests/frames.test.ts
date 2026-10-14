import { describe, expect, it } from 'vitest'
import { animationDuration, frameIndexAt, frameRect, msUntilNextFrame, resolveAnimation, sheetFrameAt } from '../src/shared/frames'
import type { AnimationDef, CharacterManifest } from '../src/shared/types'

const loop: AnimationDef = { sheet: 'main', frames: [3, 4, 5], fps: 10, loop: true }
const once: AnimationDef = { ...loop, loop: false }

describe('frames', () => {
  it('зацикленная анимация возвращается к началу', () => {
    expect(frameIndexAt(loop, 0)).toBe(0)
    expect(frameIndexAt(loop, 99)).toBe(0)
    expect(frameIndexAt(loop, 100)).toBe(1)
    expect(frameIndexAt(loop, 300)).toBe(0)
    expect(sheetFrameAt(loop, 250)).toBe(5)
  })

  it('незацикленная останавливается на последнем кадре', () => {
    expect(frameIndexAt(once, 10_000)).toBe(2)
    expect(msUntilNextFrame(once, 250)).toBeNull()
    expect(msUntilNextFrame(once, 150)).toBe(50)
  })

  it('время до следующего кадра; для одного кадра — null', () => {
    expect(msUntilNextFrame(loop, 130)).toBe(70)
    expect(msUntilNextFrame({ ...loop, frames: [1] }, 0)).toBeNull()
    expect(animationDuration(loop)).toBe(300)
  })

  it('прямоугольник кадра в сетке', () => {
    const sheet = { file: 'a.png', frameWidth: 32, frameHeight: 16, columns: 4, rows: 2 }
    expect(frameRect(sheet, 0)).toEqual({ sx: 0, sy: 0, sw: 32, sh: 16 })
    expect(frameRect(sheet, 5)).toEqual({ sx: 32, sy: 16, sw: 32, sh: 16 })
  })

  it('отсутствующая walk заменяется на idle', () => {
    const manifest = { animations: { idle: loop } } as unknown as CharacterManifest
    expect(resolveAnimation(manifest, 'walk').name).toBe('idle')
    expect(resolveAnimation(manifest, 'idle').animation).toBe(loop)
  })
})
