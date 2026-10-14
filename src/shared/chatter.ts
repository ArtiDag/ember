// Логика реплик: когда говорить и что. Чистые функции и класс без таймеров — время подаётся снаружи.

import { keyCombo, lang } from './i18n'
import { phrases, PHRASES_BY_LANG, type PhraseKind } from './phrases'
import type { Gender } from './types'

export type ChatterFrequency = 'rare' | 'normal' | 'often'

/** Пауза между случайными репликами, мс: [мин, макс]. */
export const FREQUENCY_DELAY: Record<ChatterFrequency, [number, number]> = {
  rare: [15 * 60_000, 25 * 60_000],
  normal: [6 * 60_000, 12 * 60_000],
  often: [2 * 60_000, 5 * 60_000]
}

export const CHATTER_TIMING = {
  /** Простой дольше этого — человек отошёл, сессия работы сбрасывается. */
  awayAfterMs: 5 * 60_000,
  /** Простой меньше этого — человек сейчас за компьютером. */
  activeIdleMs: 2 * 60_000,
  /** Первое напоминание о перерыве и интервал следующих. */
  firstBreakMs: 50 * 60_000,
  nextBreakMs: 40 * 60_000,
  /** Минимальный интервал между репликами на клики и перетаскивание. */
  reactionGapMs: 8_000,
  /** Реплика про музыку — не чаще раза в 10 минут. */
  musicGapMs: 10 * 60_000,
  clickChance: 0.3,
  dropChance: 0.35
} as const

export function formatDuration(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000))
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (lang() === 'en') {
    if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
    return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
  }
  if (lang() === 'zh') {
    if (minutes < 60) return `${minutes}分钟`
    return rest === 0 ? `${hours}小时` : `${hours}小时${rest}分钟`
  }
  if (minutes < 60) return `${minutes} ${plural(minutes, 'минуту', 'минуты', 'минут')}`
  return rest === 0 ? `${hours} ч` : `${hours} ч ${rest} мин`
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

/** Категория реплик про день недели (индекс — как у Date.getDay: 0 — воскресенье). */
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const

export type DayPart = 'morning' | 'day' | 'evening' | 'lateNight'

export function dayPart(hour: number): DayPart {
  if (hour >= 5 && hour < 11) return 'morning'
  if (hour >= 11 && hour < 17) return 'day'
  if (hour >= 17 && hour < 23) return 'evening'
  return 'lateNight'
}

export function randomDelay(frequency: ChatterFrequency, random: () => number = Math.random): number {
  const [min, max] = FREQUENCY_DELAY[frequency]
  return min + random() * (max - min)
}

/** Что уже сказано в текущем круге каждой категории. Сохраняется между запусками. */
export type PhraseCycles = Partial<Record<PhraseKind, string[]>>

/**
 * Выбирает реплики «по кругу»: в каждой категории ни одна фраза не повторяется,
 * пока не прозвучат все остальные. Новый круг не начинается с фразы, которой закончился прошлый.
 */
/** Род в репликах: пользователь (null — не указан, тогда фразы с {u:…} пропускаются) и персонаж. */
export interface Voice {
  user: Gender | null
  pet: Gender
}

const NEUTRAL: Voice = { user: null, pet: 'm' }

/** Подставить род: {p:рад|рада} — по персонажу, {u:вернулся|вернулась} — по пользователю. */
export function applyVoice(phrase: string, voice: Voice): string {
  return phrase.replace(/\{([up]):([^|}]*)\|([^}]*)\}/g, (_, who: string, m: string, f: string) =>
    (who === 'p' ? voice.pet : (voice.user ?? 'm')) === 'f' ? f : m
  )
}

export class PhrasePicker {
  private cycles: PhraseCycles

  constructor(
    private readonly random: () => number = Math.random,
    saved: unknown = {},
    private readonly voice: () => Voice = () => NEUTRAL
  ) {
    this.cycles = PhrasePicker.restore(saved)
  }

  /** Принимает только известные категории и фразы, которые всё ещё есть в списках. */
  static restore(saved: unknown): PhraseCycles {
    const cycles: PhraseCycles = {}
    if (typeof saved !== 'object' || saved === null) return cycles
    for (const kind of Object.keys(PHRASES_BY_LANG.ru) as PhraseKind[]) {
      const used = (saved as Record<string, unknown>)[kind]
      if (!Array.isArray(used)) continue
      // фразы на любом из языков — круг сохраняется и при смене языка
      const pool: readonly string[] = Object.values(PHRASES_BY_LANG).flatMap((set) => set[kind])
      cycles[kind] = [...new Set(used.filter((p): p is string => typeof p === 'string' && pool.includes(p)))]
    }
    return cycles
  }

  /** Состояние для сохранения на диск. */
  state(): PhraseCycles {
    return structuredClone(this.cycles)
  }

  /** Фразы категории, которые можно сказать: без обращения по роду, если пользователь род не выбрал. */
  private pool(kind: PhraseKind): readonly string[] {
    const all: readonly string[] = phrases()[kind]
    return this.voice().user ? all : all.filter((p) => !p.includes('{u:'))
  }

  pick(kind: PhraseKind, vars: { time?: string } = {}): string {
    const pool = this.pool(kind)
    let used = this.cycles[kind] ?? []
    let left = pool.filter((p) => !used.includes(p))
    if (left.length === 0) {
      // Круг пройден: начинаем новый, но не с той фразы, что прозвучала последней.
      const last = used[used.length - 1]
      used = []
      left = pool.length > 1 ? pool.filter((p) => p !== last) : [...pool]
    }
    const phrase = left[Math.floor(this.random() * left.length) % left.length]
    this.cycles[kind] = [...used, phrase]
    return applyVoice(phrase, this.voice())
      .replace('{time}', vars.time ?? '')
      .replace(/\{key:(\w)\}/g, (_, key: string) => keyCombo(key))
  }

  /** Сколько фраз категории осталось до конца круга. */
  remaining(kind: PhraseKind): number {
    const used = this.cycles[kind] ?? []
    return this.pool(kind).filter((p) => !used.includes(p)).length
  }

  /**
   * Случайная реплика; поздно ночью иногда — ночная, иногда — про сегодняшний день недели (0 — воскресенье).
   * В субботу и воскресенье — то про сам день, то общая «выходная».
   */
  pickRandom(hour: number, weekday: number): string {
    if (dayPart(hour) === 'lateNight' && this.random() < 0.4) return this.pick('night')
    if (this.random() < 0.2) {
      const day = WEEKDAYS[weekday]
      if (weekday === 0 || weekday === 6) return this.pick(this.random() < 0.5 ? 'weekend' : day)
      return this.pick(day)
    }
    return this.pick('random')
  }
}

/** Отслеживает непрерывную работу по времени простоя системы. */
export class ActivityTracker {
  private sessionStart: number | null = null
  private away = false
  private nextBreakAt = Infinity

  /**
   * idleMs — сколько система простаивает (из powerMonitor).
   * Возвращает событие: 'back' — вернулся после отсутствия, 'break' — пора напомнить о перерыве.
   */
  update(now: number, idleMs: number): { event: 'back' | 'break' | null; workedMs: number } {
    if (idleMs >= CHATTER_TIMING.awayAfterMs) {
      if (this.sessionStart !== null) this.away = true
      this.sessionStart = null
      this.nextBreakAt = Infinity
      return { event: null, workedMs: 0 }
    }
    let event: 'back' | 'break' | null = null
    if (this.sessionStart === null) {
      this.sessionStart = now - idleMs
      this.nextBreakAt = this.sessionStart + CHATTER_TIMING.firstBreakMs
      if (this.away && idleMs < CHATTER_TIMING.activeIdleMs) event = 'back'
      this.away = false
    }
    const workedMs = now - this.sessionStart
    if (event === null && now >= this.nextBreakAt && idleMs < CHATTER_TIMING.activeIdleMs) {
      event = 'break'
      this.nextBreakAt = now + CHATTER_TIMING.nextBreakMs
    }
    return { event, workedMs }
  }

  isActive(idleMs: number): boolean {
    return idleMs < CHATTER_TIMING.activeIdleMs
  }
}

/** Сколько показывать облачко: зависит от длины текста. */
export function bubbleDuration(text: string): number {
  return Math.min(9000, 3000 + text.length * 55)
}
