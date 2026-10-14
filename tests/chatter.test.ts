import { describe, expect, it } from 'vitest'
import { ActivityTracker, CHATTER_TIMING, PhrasePicker, applyVoice, bubbleDuration, dayPart, formatDuration, randomDelay } from '../src/shared/chatter'
import { bubblePlacement } from '../src/shared/geometry'
import { setLang, setMac } from '../src/shared/i18n'
import { PHRASES, PHRASES_BY_LANG } from '../src/shared/phrases'
import { DEFAULT_SETTINGS, sanitizePatch, sanitizeSettings } from '../src/shared/settings'

const MIN = 60_000
/** Пользователь выбрал род — звучат все фразы. */
const ANY = () => ({ user: 'm' as const, pet: 'm' as const })
/** Фразы так, как их видит пользователь без выбранного рода (мужской род персонажа). */
const shown = (list: readonly string[]): string[] => list.map((p) => applyVoice(p, { user: null, pet: 'm' }))
const VOICES = [
  { user: 'm' as const, pet: 'm' as const },
  { user: 'f' as const, pet: 'f' as const }
]

describe('реплики', () => {
  const all = Object.values(PHRASES_BY_LANG).flatMap((set) => Object.values(set).flat())

  it('ни одной реплики с вопросом', () => {
    for (const phrase of all) expect(phrase, phrase).not.toMatch(/[?？¿]/)
  })

  it('реплики непустые, без лишних пробелов и не слишком длинные', () => {
    for (const raw of all) {
      for (const phrase of VOICES.map((v) => applyVoice(raw, v))) {
        expect(phrase.trim()).toBe(phrase)
        expect(phrase.length).toBeGreaterThan(2)
        expect(phrase.length).toBeLessThanOrEqual(110)
      }
    }
  })

  it('нет одинаковых реплик', () => {
    expect(new Set(all).size).toBe(all.length)
  })

  it('языки не смешиваются: в русских нет латиницы и иероглифов, в английских — кириллицы и иероглифов, в китайских — кириллицы и латиницы', () => {
    // сочетания клавиш и общеизвестное (F5, Wi-Fi, имя файла) — допустимы в любом языке
    const strip = (p: string): string => applyVoice(p, VOICES[1]).replace(/\{key:[^}]+\}|\{time\}|\bF5\b|Wi-Fi|final_final_v3/g, '')
    const foreign = { ru: /[A-Za-z\u4e00-\u9fff]/, en: /[А-Яа-яЁё\u4e00-\u9fff]/, zh: /[А-Яа-яЁёA-Za-z]/ }
    for (const [lang, set] of Object.entries(PHRASES_BY_LANG) as [keyof typeof foreign, Record<string, readonly string[]>][]) {
      for (const p of Object.values(set).flat()) expect(foreign[lang].test(strip(p)), `${lang}: ${p}`).toBe(false)
    }
  })

  it('во всех языках одни и те же категории', () => {
    const kinds = Object.keys(PHRASES).sort()
    for (const set of Object.values(PHRASES_BY_LANG)) expect(Object.keys(set).sort()).toEqual(kinds)
  })

  it('сочетания клавиш — по системе, время — на языке реплик', () => {
    const picker = new PhrasePicker(() => 0)
    setMac(true)
    const mac = Array.from({ length: PHRASES.random.length }, () => picker.pick('random')).find((p) => p.includes('S.'))
    expect(mac).toMatch(/^⌘S\./)
    setMac(false)
    setLang('en')
    expect(formatDuration(80 * MIN)).toBe('1 h 20 min')
    expect(formatDuration(1 * MIN)).toBe('1 minute')
    expect(PHRASES_BY_LANG.en.random).toContain(new PhrasePicker(() => 0.5).pick('random').replace('Ctrl+S', '{key:S}').replace('Ctrl+Z', '{key:Z}'))
    setLang('zh')
    expect(formatDuration(80 * MIN)).toBe('1小时20分钟')
    setLang('ru')
  })

  it('реплики про день недели и ночь', () => {
    const always = new PhrasePicker(() => 0)
    expect(shown(PHRASES.monday)).toContain(always.pickRandom(12, 1))
    expect(shown(PHRASES.friday)).toContain(always.pickRandom(12, 5))
    expect(shown(PHRASES.weekend)).toContain(always.pickRandom(12, 0))
    // суббота: то «выходная» реплика, то про саму субботу
    const seq = (vals: number[]): (() => number) => {
      let i = 0
      return () => vals[i++ % vals.length]
    }
    expect(shown(PHRASES.saturday)).toContain(new PhrasePicker(seq([0.1, 0.7])).pickRandom(12, 6))
    expect(shown(PHRASES.wednesday)).toContain(always.pickRandom(12, 3))
    expect(shown(PHRASES.night)).toContain(always.pickRandom(2, 3))
    expect(shown(PHRASES.random)).toContain(new PhrasePicker(() => 0.9).pickRandom(12, 3))
    expect(shown(PHRASES.random)).toContain(new PhrasePicker(() => 0.9).pickRandom(12, 5))
  })

  it('круг: все фразы категории звучат по одному разу, потом новый круг', () => {
    const picker = new PhrasePicker(Math.random, {}, ANY)
    const n = PHRASES.random.length
    const first = Array.from({ length: n }, () => picker.pick('random'))
    expect(new Set(first).size).toBe(n)
    expect(picker.remaining('random')).toBe(0)
    const second = Array.from({ length: n }, () => picker.pick('random'))
    expect(new Set(second).size).toBe(n)
    // Новый круг не начинается с последней фразы прошлого.
    expect(second[0]).not.toBe(first[n - 1])
  })

  it('много кругов подряд — ни одного повтора двух фраз подряд', () => {
    const picker = new PhrasePicker()
    let previous = ''
    for (let i = 0; i < PHRASES.click.length * 20; i++) {
      const phrase = picker.pick('click')
      expect(phrase).not.toBe(previous)
      previous = phrase
    }
  })

  it('прогресс круга сохраняется и восстанавливается после перезапуска', () => {
    const before = new PhrasePicker(Math.random, {}, ANY)
    const said = Array.from({ length: 10 }, () => before.pick('random'))
    const saved = JSON.parse(JSON.stringify(before.state()))
    const after = new PhrasePicker(Math.random, saved, ANY)
    expect(after.remaining('random')).toBe(PHRASES.random.length - 10)
    const rest = Array.from({ length: PHRASES.random.length - 10 }, () => after.pick('random'))
    expect(rest.some((p) => said.includes(p))).toBe(false)
  })

  it('мусор и удалённые фразы в сохранённом состоянии игнорируются', () => {
    const picker = new PhrasePicker(Math.random, { random: ['нет такой фразы', 42, PHRASES.random[0]], hacker: ['x'] }, ANY)
    expect(picker.remaining('random')).toBe(PHRASES.random.length - 1)
    expect(Object.keys(picker.state())).toEqual(['random'])
    expect(new PhrasePicker(Math.random, 'garbage', ANY).remaining('click')).toBe(PHRASES.click.length)
  })

  it('род: персонаж говорит о себе в своём роде, к пользователю — как он выбрал', () => {
    expect(applyVoice('Я {p:рад|рада}, ты {u:вернулся|вернулась}.', { user: 'f', pet: 'm' })).toBe('Я рад, ты вернулась.')
    expect(applyVoice('Я {p:рад|рада}, ты {u:вернулся|вернулась}.', { user: 'm', pet: 'f' })).toBe('Я рада, ты вернулся.')
    // в готовой фразе не остаётся разметки
    for (const raw of all) for (const v of VOICES) expect(applyVoice(raw, v), raw).not.toMatch(/\{[up]:|\|/)
  })

  it('род пользователя не выбран — фразы с обращением по роду не звучат, но в каждой категории что-то есть', () => {
    const picker = new PhrasePicker(Math.random, {}, () => ({ user: null, pet: 'f' }))
    for (const kind of Object.keys(PHRASES) as (keyof typeof PHRASES)[]) {
      const neutral = PHRASES[kind].filter((p) => !p.includes('{u:')).length
      expect(neutral, kind).toBeGreaterThan(0)
      expect(picker.remaining(kind), kind).toBe(neutral)
    }
    for (let i = 0; i < 40; i++) expect(picker.pick('welcomeBack')).not.toMatch(/ты (вернулся|вернулась|пришёл|пришла)/)
  })

  it('подставляет время в напоминания о перерыве', () => {
    const picker = new PhrasePicker(() => 0)
    const text = picker.pick('longWork', { time: '1 ч 5 мин' })
    expect(text).toContain('1 ч 5 мин')
    expect(text).not.toContain('{time}')
  })
})

describe('время и частота', () => {
  it('formatDuration по-русски', () => {
    expect(formatDuration(1 * MIN)).toBe('1 минуту')
    expect(formatDuration(3 * MIN)).toBe('3 минуты')
    expect(formatDuration(50 * MIN)).toBe('50 минут')
    expect(formatDuration(21 * MIN)).toBe('21 минуту')
    expect(formatDuration(12 * MIN)).toBe('12 минут')
    expect(formatDuration(60 * MIN)).toBe('1 ч')
    expect(formatDuration(85 * MIN)).toBe('1 ч 25 мин')
  })

  it('время суток', () => {
    expect(dayPart(7)).toBe('morning')
    expect(dayPart(13)).toBe('day')
    expect(dayPart(20)).toBe('evening')
    expect(dayPart(2)).toBe('lateNight')
    expect(dayPart(23)).toBe('lateNight')
  })

  it('частота задаёт интервал', () => {
    expect(randomDelay('often', () => 0)).toBe(2 * MIN)
    expect(randomDelay('rare', () => 1)).toBe(25 * MIN)
    expect(bubbleDuration('коротко')).toBeGreaterThanOrEqual(3000)
    expect(bubbleDuration('x'.repeat(1000))).toBe(9000)
  })
})

describe('ActivityTracker', () => {
  it('напоминает о перерыве после 50 минут, затем каждые 40', () => {
    const tracker = new ActivityTracker()
    expect(tracker.update(0, 0).event).toBeNull()
    expect(tracker.update(49 * MIN, 1000).event).toBeNull()
    const first = tracker.update(50 * MIN, 1000)
    expect(first.event).toBe('break')
    expect(first.workedMs).toBe(50 * MIN)
    expect(tracker.update(80 * MIN, 1000).event).toBeNull()
    expect(tracker.update(90 * MIN, 1000).event).toBe('break')
  })

  it('отошёл больше чем на 5 минут — сессия сбрасывается, при возвращении — приветствие', () => {
    const tracker = new ActivityTracker()
    tracker.update(0, 0)
    expect(tracker.update(30 * MIN, CHATTER_TIMING.awayAfterMs).event).toBeNull()
    const back = tracker.update(40 * MIN, 2000)
    expect(back.event).toBe('back')
    expect(back.workedMs).toBe(2000)
    // Счётчик перерыва начался заново.
    expect(tracker.update(40 * MIN + 49 * MIN, 1000).event).toBeNull()
  })

  it('не напоминает о перерыве, если человек уже отошёл', () => {
    const tracker = new ActivityTracker()
    tracker.update(0, 0)
    expect(tracker.update(51 * MIN, 3 * MIN).event).toBeNull()
  })

  it('первый запуск — не «с возвращением»', () => {
    expect(new ActivityTracker().update(0, 0).event).toBeNull()
  })
})

describe('bubblePlacement', () => {
  const area = { x: 0, y: 0, width: 1000, height: 800 }
  const size = { width: 300, height: 170 }

  it('над питомцем по центру', () => {
    expect(bubblePlacement({ centerX: 500, top: 600, bottom: 700 }, size, area)).toEqual({ x: 350, y: 428, placement: 'above', tailOffset: 0 })
  })

  it('под питомцем, если сверху нет места', () => {
    const p = bubblePlacement({ centerX: 500, top: 50, bottom: 150 }, size, area)
    expect(p.placement).toBe('below')
    expect(p.y).toBe(152)
  })

  it('у края экрана облачко прижимается, а хвостик смещается к питомцу', () => {
    const p = bubblePlacement({ centerX: 960, top: 600, bottom: 700 }, size, area)
    expect(p.x).toBe(700)
    expect(p.tailOffset).toBe(110)
    expect(bubblePlacement({ centerX: 995, top: 600, bottom: 700 }, size, area).tailOffset).toBe(126)
  })
})

describe('настройки реплик', () => {
  it('значения по умолчанию и очистка', () => {
    expect(DEFAULT_SETTINGS.chatter).toBe(true)
    expect(sanitizeSettings({ chatterFrequency: 'always' }).chatterFrequency).toBe('normal')
    expect(sanitizePatch({ chatterFrequency: 'often', chatter: false }, DEFAULT_SETTINGS)).toEqual({ chatterFrequency: 'often', chatter: false })
  })
})
