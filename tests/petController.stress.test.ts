// Стресс-тест поведения питомца: настоящий PetController с подменённым Electron гоняется часами
// виртуального времени. Случайно (но воспроизводимо) — клики, перетаскивания, команды меню, реплики,
// музыка, сон, пауза, скрытие, смена размера и мониторов. После каждого шага проверяются инварианты.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CharacterSummary, PetView, Rect, Settings } from '../src/shared/types'

interface FakeDisplay {
  id: number
  bounds: Rect
  workArea: Rect
}

const env = vi.hoisted(() => ({
  cursor: { x: 700, y: 500 },
  idleSeconds: 0,
  displays: [] as FakeDisplay[],
  windows: [] as unknown[]
}))

vi.mock('electron', () => {
  class BrowserWindow {
    bounds: Rect
    visible = false
    destroyed = false
    views: PetView[] = []
    private handlers = new Map<string, () => void>()
    webContents = {
      id: 1,
      send: (channel: string, payload: unknown) => {
        if (channel === 'pet:view') this.views.push(payload as PetView)
      },
      on: () => {}
    }
    constructor(opts: Rect) {
      this.bounds = { x: opts.x, y: opts.y, width: opts.width, height: opts.height }
      env.windows.push(this)
    }
    setAlwaysOnTop(): void {}
    setVisibleOnAllWorkspaces(): void {}
    setOpacity(): void {}
    setIgnoreMouseEvents(): void {}
    on(name: string, cb: () => void): void {
      this.handlers.set(name, cb)
    }
    once(name: string, cb: () => void): void {
      this.handlers.set(name, cb)
    }
    emit(name: string): void {
      this.handlers.get(name)?.()
    }
    isDestroyed(): boolean {
      return this.destroyed
    }
    destroy(): void {
      this.destroyed = true
    }
    setBounds(b: Rect): void {
      this.bounds = { ...b }
    }
    showInactive(): void {
      this.visible = true
    }
    hide(): void {
      this.visible = false
    }
  }
  const nearest = (p: { x: number; y: number }): FakeDisplay =>
    env.displays.find((d) => p.x >= d.bounds.x && p.x < d.bounds.x + d.bounds.width && p.y >= d.bounds.y && p.y < d.bounds.y + d.bounds.height) ??
    env.displays[0]
  return {
    BrowserWindow,
    powerMonitor: { getSystemIdleTime: () => env.idleSeconds },
    screen: {
      getAllDisplays: () => env.displays,
      getPrimaryDisplay: () => env.displays[0],
      getCursorScreenPoint: () => ({ ...env.cursor }),
      getDisplayNearestPoint: nearest
    }
  }
})

vi.mock('../src/main/env', () => ({
  loadPage: () => Promise.resolve(),
  paths: { preload: () => '' },
  secureWebPreferences: () => ({}),
  keepOnTop: () => {},
  raiseOnTop: () => {}
}))

const { PetController } = await import('../src/main/petController')
const { validateManifest, characterKind } = await import('../src/shared/manifest')
const { animationDuration } = await import('../src/shared/frames')
const { DEFAULT_SETTINGS } = await import('../src/shared/settings')

function loadCharacter(id: string): CharacterSummary {
  const raw = JSON.parse(readFileSync(join(__dirname, '../resources/characters', id, 'character.json'), 'utf8'))
  const result = validateManifest(raw)
  if (!result.ok) throw new Error(result.errors.join('; '))
  return { id, name: result.manifest.name, builtin: true, kind: characterKind(result.manifest), baseUrl: '', manifest: result.manifest }
}

/** Воспроизводимый генератор случайных чисел. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const PRIMARY: FakeDisplay = { id: 1, bounds: { x: 0, y: 0, width: 1440, height: 900 }, workArea: { x: 0, y: 25, width: 1440, height: 875 } }
const SECOND: FakeDisplay = { id: 2, bounds: { x: 1440, y: 0, width: 1920, height: 1080 }, workArea: { x: 1440, y: 0, width: 1920, height: 1040 } }

/** Тест заглядывает во внутреннее состояние контроллера (таймеры, сон, автомат). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Pet = Record<string, any>

function run(seed: number, hours: number): { stats: Record<string, number>; problems: string[] } {
  const rnd = mulberry32(seed)
  vi.spyOn(Math, 'random').mockImplementation(mulberry32(seed * 7 + 1))
  env.displays = [PRIMARY, SECOND]
  env.cursor = { x: 700, y: 500 }
  env.idleSeconds = 0
  env.windows = []

  let settings: Settings = { ...DEFAULT_SETTINGS }
  const store = {
    get settings() {
      return settings
    },
    update(patch: Partial<Settings>) {
      settings = { ...settings, ...patch }
      return settings
    }
  }
  const characters = { ugolek: loadCharacter('ugolek'), bunny: loadCharacter('bunny') }
  let character = characters.ugolek
  const pet = new PetController(store as never, character, () => {}) as unknown as Pet
  pet.create()
  const win = env.windows[0] as { bounds: Rect; views: PetView[]; emit(n: string): void; visible: boolean }
  win.emit('ready-to-show')

  const stats: Record<string, number> = {}
  const count = (k: string): void => {
    stats[k] = (stats[k] ?? 0) + 1
    if (!k.startsWith('mode:') && !k.startsWith('anim:')) log.push(`${(now() / 1000).toFixed(1)}s ${k}`)
  }
  const problems: string[] = []
  const log: string[] = []
  const seen = new Set<string>()
  const fail = (msg: string): void => {
    // одна и та же проблема подряд — один раз (с журналом последних событий)
    const kind = msg.replace(/[0-9.]+/g, 'N')
    if (seen.has(kind) || problems.length >= 30) return
    seen.add(kind)
    problems.push(`[seed ${seed}, t=${(now() / 1000).toFixed(1)}s] ${msg}\n      ← ${log.slice(-6).join(' | ')}`)
  }
  const start = Date.now()
  const now = (): number => Date.now() - start

  let lastSeq = 0
  let checkedViews = 0
  let walkMs = 0
  let lastCheck = 0
  let reactSince: { seq: number; at: number } | null = null
  let musicSince: number | null = null
  let dragging = false
  let hiddenAt: Rect | null = null
  let lastX = win.bounds.x
  let walkStill = 0

  const animations = (): Record<string, unknown> => character.manifest.animations

  const check = (): void => {
    const brain = pet.brain
    // все отправленные в окно виды — корректны
    for (; checkedViews < win.views.length; checkedViews++) {
      const v = win.views[checkedViews]
      if (!animations()[v.animation]) fail(`вид с несуществующей анимацией ${v.animation}`)
      if (v.seq < lastSeq) fail(`seq пошёл назад: ${lastSeq} → ${v.seq}`)
      lastSeq = v.seq
      const top = settings.speed * (character.manifest.pace ?? 1) * 3.2
      // окно идёт целыми пикселями за тик (16 мс) — скорость округляется вверх максимум на полпикселя
      const max = (Math.round((top * 16) / 1000) + 0.5) * (1000 / 16)
      if (!Number.isFinite(v.speed ?? 0) || (v.speed ?? 0) < 0 || (v.speed ?? 0) > max) fail(`странная скорость ${v.speed}`)
      if (v.mode !== 'walk' && (v.speed ?? 0) !== 0) fail(`скорость ${v.speed} не при ходьбе (${v.mode})`)
    }
    // последний отправленный вид совпадает с тем, что должно быть на экране
    const want = pet.view()
    const got = win.views[win.views.length - 1]
    if (settings.visible && got && (got.mode !== want.mode || got.animation !== want.animation || got.flip !== want.flip || got.look !== want.look))
      fail(`окно показывает ${got.mode}/${got.animation}${got.flip ? '/flip' : ''}, а должно ${want.mode}/${want.animation}${want.flip ? '/flip' : ''}`)

    const b = win.bounds
    if (![b.x, b.y, b.width, b.height].every(Number.isInteger)) fail(`нецелые bounds ${JSON.stringify(b)}`)
    if (!dragging && settings.visible) {
      const inside = env.displays.some(
        (d) => b.x >= d.workArea.x && b.y >= d.workArea.y && b.x + b.width <= d.workArea.x + d.workArea.width && b.y + b.height <= d.workArea.y + d.workArea.height
      )
      if (!inside) fail(`окно вне экрана ${JSON.stringify(b)}`)
    }
    if (!settings.visible && hiddenAt && (hiddenAt.x !== b.x || hiddenAt.y !== b.y)) fail('скрытый питомец двигается')

    // не застревает
    // время ходьбы копится только пока питомец на экране (скрытый стоит на месте)
    const since = now() - lastCheck
    lastCheck = now()
    if (brain.mode !== 'walk') walkMs = 0
    else if (settings.visible) {
      walkMs += since
      if (walkMs > 65_000) fail(`идёт уже ${(walkMs / 1000).toFixed(0)} с`)
      if (b.x === lastX && walkMs > 3000 && !pet.peekSide) walkStill += 1
    }
    lastX = b.x
    // время реакции считаем от её запуска (seq) и только пока питомец на экране
    if (brain.mode === 'react' && settings.visible) {
      if (!reactSince || reactSince.seq !== want.seq) reactSince = { seq: want.seq, at: now() }
      const limit = animationDuration(character.manifest.animations[brain.reaction]) + 200
      if (now() - reactSince.at > limit) fail(`реакция ${brain.reaction} дольше ${limit} мс`)
    } else reactSince = null
    if (want.animation === 'music') {
      musicSince ??= now()
      if (now() - musicSince > 18_500) fail('наушники дольше 18 с')
    } else musicSince = null
    if (settings.visible && brain.mode !== 'drag' && !pet.walkTimer && !pet.wakeTimer) fail(`нет таймера в режиме ${brain.mode} — автомат застрял`)
    if (settings.visible && brain.mode === 'walk' && !pet.walkTimer) fail('режим walk без таймера ходьбы')

    // правила
    if (pet.listening && want.mode === 'idle' && want.animation === 'talk' && animations().music) fail('снял наушники ради реплики')
    if (pet.sleeping && brain.mode === 'walk') fail('гуляет во сне')
    if (settings.paused && brain.mode === 'walk') fail('гуляет на паузе')
    if (settings.paused && brain.mode === 'idle' && Number.isFinite(brain.timeLeft) && pet.walkTimer) fail('таймер ходьбы на паузе')
    if (vi.getTimerCount() > 14) fail(`утечка таймеров: ${vi.getTimerCount()}`)
    if (pet.sleeping && want.mode === 'idle' && want.animation !== 'sleep' && want.animation !== 'talk' && want.animation !== 'music' && animations().sleep)
      fail(`спит, но показывает ${want.animation}`)
    count(`mode:${brain.mode}`)
    count(`anim:${want.animation}`)
  }

  const advance = (ms: number): void => {
    let left = ms
    while (left > 0) {
      const step = Math.min(left, 250)
      vi.advanceTimersByTime(step)
      left -= step
      check()
    }
  }

  const actions: [number, () => void][] = [
    [6, () => settings.visible && (count('click'), pet.click())],
    [2, () => {
      if (!settings.visible) return
      count('rapidClick')
      for (let i = 0; i < 6; i++) {
        pet.click()
        advance(120)
      }
    }],
    [3, () => {
      if (!settings.visible) return
      count('drag')
      env.cursor = { x: win.bounds.x + 40, y: win.bounds.y + 60 }
      // человек за компьютером — водит мышью
      env.idleSeconds = 0
      const wasSleeping = pet.sleeping
      pet.dragStart()
      if (pet.sleeping) fail('взяли в руку, а он спит')
      dragging = true
      for (let i = 0; i < 1 + Math.floor(rnd() * 20); i++) {
        env.cursor = { x: env.cursor.x + (rnd() - 0.5) * 300, y: env.cursor.y + (rnd() - 0.5) * 200 }
        advance(50 + rnd() * 200)
      }
      // иногда отпускают за краем экрана
      if (rnd() < 0.2) env.cursor = { x: -500, y: 2000 }
      dragging = false
      pet.dragEnd()
      if (pet.sleeping) fail('отпустили — снова лёг спать')
      if (wasSleeping) count('dragFromSleep')
    }],
    [5, () => {
      const name = pet.idleActs[Math.floor(rnd() * pet.idleActs.length)]
      // в меню команды доступны, только когда питомец виден и не на паузе
      if (!name || !settings.visible || settings.paused) return
      count(`act:${name}`)
      pet.act(name)
    }],
    [5, () => (count('talk'), pet.setTalking(1500 + rnd() * 4000))],
    [3, () => (count('music'), pet.setMusic(rnd() < 0.6))],
    [3, () => {
      env.idleSeconds = rnd() < 0.5 ? 200 + rnd() * 400 : 0
      count(env.idleSeconds ? 'away' : 'back')
    }],
    [6, () => {
      env.cursor = { x: rnd() * 3000, y: rnd() * 1000 }
      count('cursor')
    }],
    [2, () => {
      const prev = settings
      const patch: Partial<Settings>[] = [
        { walking: !settings.walking },
        { paused: !settings.paused },
        { size: [64, 96, 128, 200, 300][Math.floor(rnd() * 5)] },
        { speed: [20, 60, 120, 200][Math.floor(rnd() * 4)] },
        { followCursor: !settings.followCursor },
        { smooth: !settings.smooth },
        { clickThrough: !settings.clickThrough },
        { displayId: rnd() < 0.5 ? 1 : 2 }
      ]
      const p = patch[Math.floor(rnd() * patch.length)]
      count(`set:${Object.keys(p)[0]}`)
      settings = { ...settings, ...p }
      pet.applySettings(prev)
      if (!settings.visible) hiddenAt = { ...win.bounds }
    }],
    [1, () => {
      count('toggleVisible')
      pet.toggleVisible()
      hiddenAt = settings.visible ? null : { ...win.bounds }
    }],
    [1, () => (count('recenter'), pet.recenter(), (hiddenAt = null))],
    [1, () => {
      // отключили второй монитор / подключили обратно
      env.displays = env.displays.length === 2 ? [PRIMARY] : [PRIMARY, SECOND]
      count('displays')
      pet.ensureOnScreen()
      if (!settings.visible) hiddenAt = { ...win.bounds }
    }],
    [1, () => {
      if (rnd() > 0.15) return
      character = character.id === 'ugolek' ? characters.bunny : characters.ugolek
      count(`character:${character.id}`)
      pet.setCharacter(character)
      if (!settings.visible) hiddenAt = { ...win.bounds }
    }]
  ]
  const total = actions.reduce((s, [w]) => s + w, 0)

  const end = hours * 3600_000
  while (now() < end && problems.length < 30) {
    // в основном — спокойная жизнь, события редко
    advance(rnd() < 0.7 ? 2000 + rnd() * 30_000 : 100 + rnd() * 2000)
    if (rnd() < 0.6) {
      let r = rnd() * total
      for (const [w, f] of actions) {
        if ((r -= w) < 0) {
          f()
          break
        }
      }
      check()
    }
    // сон не должен длиться вечно: иногда человек возвращается
    if (env.idleSeconds && rnd() < 0.05) env.idleSeconds = 0
  }
  if (walkStill > 40) fail(`шёл, но окно стояло на месте ${walkStill} раз`)
  pet.destroy()
  return { stats, problems }
}

describe('PetController — стресс-тест поведения', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'Date'] })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const total: Record<string, number> = {}
  // STRESS_SEEDS=40 npx vitest run tests/petController.stress.test.ts — долгий прогон
  const seeds = Array.from({ length: Number(process.env.STRESS_SEEDS) || 8 }, (_, i) => i + 1)
  for (const seed of seeds) {
    it(`сид ${seed}: 3 часа случайной жизни без нарушений`, () => {
      const { stats, problems } = run(seed, 3)
      for (const [k, v] of Object.entries(stats)) total[k] = (total[k] ?? 0) + v
      expect(problems).toEqual([])
    }, 120_000)
  }

  it('за все прогоны побывал во всех состояниях и выполнил все команды', () => {
    if (process.env.STRESS_VERBOSE) console.log(total)
    for (const key of ['mode:walk', 'mode:react', 'mode:drag', 'anim:sleep', 'anim:music', 'anim:talk', 'anim:peek', 'anim:scratch', 'anim:yawn', 'anim:dizzy', 'act:peek', 'act:run', 'act:scratch', 'act:sleep', 'character:bunny', 'dragFromSleep'])
      expect(total[key] ?? 0, key).toBeGreaterThan(0)
  })
})
