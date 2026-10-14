// Простой конечный автомат поведения питомца: idle ⇄ walk, drag, react.
// Время подаётся снаружи (tick), случайность — через инъекцию, поэтому всё тестируется.

export type PetMode = 'idle' | 'walk' | 'drag' | 'react'

export interface BrainTimings {
  idleMin: number
  idleMax: number
  walkMin: number
  walkMax: number
  walkChance: number
}

export const DEFAULT_TIMINGS: BrainTimings = {
  idleMin: 8000,
  idleMax: 30000,
  walkMin: 2000,
  walkMax: 6000,
  walkChance: 0.55
}

export class PetBrain {
  mode: PetMode = 'idle'
  direction: -1 | 1 = 1
  /** Сколько мс осталось в текущем состоянии (для drag — Infinity). */
  timeLeft: number
  reaction: string | null = null
  walking = true
  paused = false
  /** Номер текущего состояния: меняется при каждом входе в новое состояние (даже в такое же). */
  epoch = 0

  constructor(
    private readonly random: () => number = Math.random,
    private readonly timings: BrainTimings = DEFAULT_TIMINGS
  ) {
    this.timeLeft = this.idleDuration()
  }

  get canWalk(): boolean {
    return this.walking && !this.paused
  }

  private between(min: number, max: number): number {
    return min + this.random() * (max - min)
  }

  private idleDuration(): number {
    return this.between(this.timings.idleMin, this.timings.idleMax)
  }

  private enterIdle(): void {
    this.epoch += 1
    this.mode = 'idle'
    this.reaction = null
    this.timeLeft = this.idleDuration()
  }

  private enterWalk(): void {
    this.epoch += 1
    this.mode = 'walk'
    this.reaction = null
    this.direction = this.random() < 0.5 ? -1 : 1
    this.timeLeft = this.between(this.timings.walkMin, this.timings.walkMax)
  }

  /** Продвигает время. Возвращает true, если сменилось состояние. */
  tick(dt: number): boolean {
    if (this.mode === 'drag') return false
    this.timeLeft -= dt
    if (this.timeLeft > 0) return false
    if (this.mode === 'idle' && this.canWalk && this.random() < this.timings.walkChance) {
      this.enterWalk()
      return true
    }
    const changed = this.mode !== 'idle'
    this.enterIdle()
    return changed
  }

  /** Сброс в idle (например, при смене персонажа). */
  reset(): void {
    this.enterIdle()
  }

  startDrag(): void {
    this.epoch += 1
    this.mode = 'drag'
    this.reaction = null
    this.timeLeft = Infinity
  }

  endDrag(): void {
    if (this.mode === 'drag') this.enterIdle()
  }

  /** Реакция на клик. Во время перетаскивания игнорируется. */
  react(name: string, durationMs: number): boolean {
    if (this.mode === 'drag') return false
    this.epoch += 1
    this.mode = 'react'
    this.reaction = name
    this.timeLeft = durationMs
    return true
  }

  /** Идти в заданную сторону (например, к краю экрана), пока не упрётся или не выйдет время. */
  /** force — по команде человека: идёт, даже если самостоятельные прогулки выключены (но не на паузе). */
  walkTo(direction: -1 | 1, durationMs: number, force = false): boolean {
    if (this.mode === 'drag' || this.paused || (!force && !this.walking)) return false
    this.epoch += 1
    this.mode = 'walk'
    this.reaction = null
    this.direction = direction
    this.timeLeft = durationMs
    return true
  }

  setWalking(enabled: boolean): void {
    this.walking = enabled
    if (!this.canWalk && this.mode === 'walk') this.enterIdle()
  }

  setPaused(paused: boolean): void {
    this.paused = paused
    if (!this.canWalk && this.mode === 'walk') this.enterIdle()
  }

  /** Питомец упёрся в край: разворачивается или останавливается. */
  hitEdge(side: 'left' | 'right'): void {
    if (this.mode !== 'walk') return
    if (this.random() < 0.5) {
      this.enterIdle()
      return
    }
    this.direction = side === 'left' ? 1 : -1
  }
}
