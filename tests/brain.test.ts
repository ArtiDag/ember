import { describe, expect, it } from 'vitest'
import { PetBrain } from '../src/shared/brain'
import { ClickCounter } from '../src/shared/reactions'
import type { CharacterManifest } from '../src/shared/types'

/** Детерминированный «случай»: возвращает значения по очереди. */
function seq(...values: number[]): () => number {
  let i = 0
  return () => values[i++ % values.length]
}

const timings = { idleMin: 1000, idleMax: 1000, walkMin: 2000, walkMax: 2000, walkChance: 0.5 }

describe('PetBrain', () => {
  it('idle → walk → idle по таймерам', () => {
    const brain = new PetBrain(seq(0.1), timings)
    expect(brain.mode).toBe('idle')
    expect(brain.tick(500)).toBe(false)
    expect(brain.tick(500)).toBe(true)
    expect(brain.mode).toBe('walk')
    expect(brain.direction).toBe(-1)
    brain.tick(2000)
    expect(brain.mode).toBe('idle')
  })

  it('walkTo: идёт в заданную сторону, но не во время перетаскивания и не при выключенных прогулках', () => {
    const brain = new PetBrain(seq(0.9), timings)
    expect(brain.walkTo(1, 5000)).toBe(true)
    expect(brain.mode).toBe('walk')
    expect(brain.direction).toBe(1)
    expect(brain.timeLeft).toBe(5000)
    brain.startDrag()
    expect(brain.walkTo(-1, 5000)).toBe(false)
    brain.endDrag()
    brain.setWalking(false)
    expect(brain.walkTo(-1, 5000)).toBe(false)
    expect(brain.mode).toBe('idle')
  })

  it('остаётся в idle, если прогулки выключены или пауза', () => {
    const brain = new PetBrain(seq(0.1), timings)
    brain.setWalking(false)
    brain.tick(1000)
    expect(brain.mode).toBe('idle')
    brain.setWalking(true)
    brain.setPaused(true)
    brain.tick(1000)
    expect(brain.mode).toBe('idle')
  })

  it('пауза во время прогулки останавливает питомца', () => {
    const brain = new PetBrain(seq(0.1), timings)
    brain.tick(1000)
    expect(brain.mode).toBe('walk')
    brain.setPaused(true)
    expect(brain.mode).toBe('idle')
  })

  it('drag не завершается по времени и сбрасывается в idle', () => {
    const brain = new PetBrain(seq(0.1), timings)
    brain.startDrag()
    brain.tick(1e9)
    expect(brain.mode).toBe('drag')
    expect(brain.react('heart', 500)).toBe(false)
    brain.endDrag()
    expect(brain.mode).toBe('idle')
  })

  it('реакция длится заданное время', () => {
    const brain = new PetBrain(seq(0.9), timings)
    expect(brain.react('heart', 600)).toBe(true)
    expect(brain.mode).toBe('react')
    brain.tick(599)
    expect(brain.mode).toBe('react')
    brain.tick(1)
    expect(brain.mode).toBe('idle')
    expect(brain.reaction).toBeNull()
  })

  it('у края разворачивается или останавливается', () => {
    const turn = new PetBrain(seq(0.5, 0.1, 0.1, 0.5, 0.9), timings)
    // вызовы random: длительность idle, шанс прогулки, направление, длительность walk, решение у края
    turn.tick(1000)
    turn.hitEdge('left')
    expect(turn.mode).toBe('walk')
    expect(turn.direction).toBe(1)
    const stop = new PetBrain(seq(0.5, 0.1, 0.1, 0.5, 0.2), timings)
    stop.tick(1000)
    stop.hitEdge('left')
    expect(stop.mode).toBe('idle')
  })
})

describe('ClickCounter', () => {
  const manifest = {
    animations: { idle: {}, heart: {}, sparkle: {}, dizzy: {} },
    reactions: { click: ['heart', 'sparkle'], rapidClick: 'dizzy' }
  } as unknown as CharacterManifest

  it('чередует реакции и после 4 быстрых кликов даёт rapidClick', () => {
    const c = new ClickCounter()
    expect(c.register(manifest, 0)).toBe('heart')
    expect(c.register(manifest, 100)).toBe('sparkle')
    expect(c.register(manifest, 200)).toBe('heart')
    expect(c.register(manifest, 300)).toBe('dizzy')
    expect(c.register(manifest, 5000)).toBe('sparkle')
  })

  it('без реакций возвращает null', () => {
    expect(new ClickCounter().register({ animations: { idle: {} } } as unknown as CharacterManifest, 0)).toBeNull()
  })
})
