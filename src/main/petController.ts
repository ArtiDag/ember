// Окно питомца: позиция, поведение, перетаскивание, слежение за курсором.
// Окно маленькое (по размеру персонажа) и создаётся один раз; при движении меняются только bounds.

import { BrowserWindow, powerMonitor, screen, type Display } from 'electron'
import { PetBrain } from '../shared/brain'
import { animationDuration } from '../shared/frames'
import { pickGaze } from '../shared/gaze'
import { bestAreaFor, clampToArea, homePosition, walkStep } from '../shared/geometry'
import { IPC } from '../shared/ipc'
import { frameSize } from '../shared/manifest'
import { ClickCounter } from '../shared/reactions'
import type { CharacterSummary, Direction, Facing, PetConfig, PetView, Point, Rect, Settings } from '../shared/types'
import { keepOnTop, loadPage, paths, raiseOnTop, secureWebPreferences } from './env'
import type { BubbleAnchor } from './bubbleWindow'
import type { SettingsStore } from './store'

export interface PetEvents {
  moved(): void
  clicked(): void
  dropped(): void
}

const WALK_INTERVAL_MS = 16
const DRAG_INTERVAL_MS = 16
const CURSOR_INTERVAL_MS = 33
const MAX_ASPECT = 3
/** Через сколько простоя системы питомец засыпает (если у него есть анимация sleep). */
const SLEEP_AFTER_S = 120
const SLEEP_CHECK_MS = 20_000
/** «Вздремнуть» из меню: сон на это время (движение курсора не будит, клик — будит). */
const NAP_MS = 30_000
/** Редкие «фишки» в покое (царапает экран, выглядывает из-за края): не чаще раза в минуту. */
const ACT_MIN_GAP_MS = 60_000
const ACT_CHANCE = 0.35
/** Выглядывать из-за края — только если до края недалеко. */
const PEEK_MAX_DISTANCE = 700
/** Плавный старт прогулки: персонаж сначала поворачивается и встаёт, потом окно разгоняется. */
const WALK_START_DELAY_MS = 1080
const WALK_ACCEL_MS = 450
const WALK_DECEL_MS = 450
/** Развернулся у края — пауза перед шагом в другую сторону. «Кукла» разворачивается через анфас (2 поворота). */
const TURN_BACK_DELAY_MS = 260
const RIG_TURN_BACK_DELAY_MS = 900
/** Кот-«кукла» поворачивается и встаёт быстрее (0,38 + 0,28 с) — окно трогается сразу за ним. */
const CAT_WALK_START_DELAY_MS = 680
/**
 * Кролик поворачивается быстро (в прыжке, 0,3 с), приземляется сразу в присед и отталкивается — окно трогается
 * вместе с первым прыжком. Движется прыжками: разгон и торможение короткие (иначе первый и последний прыжки — как
 * в замедленной съёмке, а после последнего он «едет» в присяде).
 */
const BUNNY_WALK_START_DELAY_MS = 360
const BUNNY_TURN_BACK_DELAY_MS = 660
const BUNNY_ACCEL_MS = 220
const BUNNY_DECEL_MS = 240
/** Кролику — приземлиться к этому месту торможения (доля от его конца): дальше окно почти стоит. */
const BUNNY_LAND_AT = 0.4
/** Изредка — пробежка (только у «кукол»): в 3,2 раза быстрее, не чаще раза в 4 минуты. */
const RUN_CHANCE = 0.06
const RUN_MULT = 3.2
const RUN_MIN_GAP_MS = 240_000
const RUN_ACCEL_MS = 650
const RUN_DECEL_MS = 650
/** Сколько места нужно для пробежки и сколько она длится максимум. */
const RUN_MIN_ROOM = 420
const RUN_MAX_MS = 3000
/** Музыка: наушники на 12–18 с, потом обычное состояние; если играет дальше — снова через 3–6 мин. */
const LISTEN_MIN_MS = 12_000
const LISTEN_MAX_MS = 18_000
const LISTEN_AGAIN_MIN_MS = 180_000
const LISTEN_AGAIN_MAX_MS = 360_000

const ramp = (v: number): number => {
  const t = Math.min(1, Math.max(0, v))
  return t * t * (3 - 2 * t)
}
const between = (min: number, max: number): number => min + Math.random() * (max - min)
/** Доля тика: таймер может опоздать (тогда шаг чуть длиннее), но не больше двух шагов разом. */
const ticks = (v: number): number => Math.min(2, Math.max(1, Math.round(v)))

export class PetController {
  private win: BrowserWindow | null = null
  private readonly brain = new PetBrain()
  private readonly clicks = new ClickCounter()
  private x = 0
  private y = 0
  private width = 1
  private height = 1
  private facing: Facing = 'right'
  private seq = 0
  private lastMode = this.brain.mode
  private lastAnimation = ''
  private lastTick = Date.now()
  /** Для какого состояния автомата (brain.epoch) отсчитывается lastTick. */
  private armedEpoch = -1
  private walkTimer: NodeJS.Timeout | null = null
  private wakeTimer: NodeJS.Timeout | null = null
  private dragTimer: NodeJS.Timeout | null = null
  private cursorTimer: NodeJS.Timeout | null = null
  private dragOffset: Point | null = null
  private lastCursor: Point | null = null
  private gaze: { direction: Direction; sector: number } = { direction: 'center', sector: -1 }
  private interactive = false
  private sleeping = false
  /** Звук на компьютере; персонаж «слушает музыку» (если у него есть анимация music) до listenUntil. */
  private music = false
  private listenUntil = 0
  private musicTimer: NodeJS.Timeout | null = null
  /** Прогулка: когда началась (плавный старт), множитель скорости (бег) и текущая скорость окна. */
  private walkStartedAt = 0
  private runMul = 1
  private lastRunAt = Date.now()
  private speedNow = 0
  private sentSpeed = 0
  /** До какого момента персонаж «говорит» (показывает реплику). */
  private talkingUntil = 0
  private talkTimer: NodeJS.Timeout | null = null
  private sleepTimer: NodeJS.Timeout | null = null
  private napUntil = 0
  private napTimer: NodeJS.Timeout | null = null
  private lastActAt = Date.now()
  /** Идёт к этому краю, чтобы спрятаться за ним и выглядывать. */
  private peekSide: 'left' | 'right' | null = null
  /** Подписчики на события питомца (облачко с репликами). */
  events: PetEvents = { moved: () => {}, clicked: () => {}, dropped: () => {} }

  constructor(
    private readonly store: SettingsStore,
    private character: CharacterSummary,
    private readonly onChange: () => void
  ) {
    this.brain.setWalking(store.settings.walking)
    this.brain.setPaused(store.settings.paused)
    this.facing = character.manifest.facing
  }

  private get settings(): Settings {
    return this.store.settings
  }

  get webContentsId(): number | null {
    return this.win && !this.win.isDestroyed() ? this.win.webContents.id : null
  }

  get visible(): boolean {
    return this.settings.visible
  }

  // ---------- окно ----------

  create(): void {
    this.computeSize()
    const start = this.initialPosition()
    this.x = start.x
    this.y = start.y
    if (!this.settings.position) this.savePosition()
    const win = new BrowserWindow({
      ...this.bounds(),
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: false,
      alwaysOnTop: this.settings.alwaysOnTop,
      focusable: false,
      useContentSize: true,
      title: 'Ember',
      webPreferences: secureWebPreferences(paths.preload())
    })
    this.win = win
    keepOnTop(win, () => this.settings.alwaysOnTop)
    if (process.platform === 'darwin') win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false })
    win.setOpacity(this.settings.opacity)
    this.applyClickThrough()
    win.on('closed', () => {
      this.win = null
      this.stopTimers()
    })
    // Если renderer упал — перезагружаем, чтобы питомец не пропал.
    win.webContents.on('render-process-gone', () => {
      if (this.win && !this.win.isDestroyed()) void loadPage(this.win, 'pet')
    })
    win.once('ready-to-show', () => {
      if (this.settings.visible) this.show()
    })
    void loadPage(win, 'pet')
  }

  destroy(): void {
    this.stopTimers()
    if (this.musicTimer) clearTimeout(this.musicTimer)
    if (this.napTimer) clearTimeout(this.napTimer)
    this.musicTimer = this.napTimer = null
    if (this.win && !this.win.isDestroyed()) this.win.destroy()
    this.win = null
  }

  private bounds(): Rect {
    return { x: Math.round(this.x), y: Math.round(this.y), width: this.width, height: this.height }
  }

  /** setBounds вместо setPosition: на Windows со смешанным DPI размер окна иначе «плывёт». */
  private applyBounds(): void {
    if (!this.win || this.win.isDestroyed()) return
    this.win.setBounds(this.bounds())
    this.events.moved()
  }

  /** Где сейчас сама картинка персонажа — для облачка с репликой. */
  anchor(): BubbleAnchor | null {
    if (!this.win || this.win.isDestroyed() || !this.settings.visible) return null
    return {
      centerX: this.x + this.width / 2,
      top: Math.round(this.y),
      bottom: Math.round(this.y + this.height),
      area: this.currentDisplay().workArea
    }
  }

  private computeSize(): void {
    const frame = frameSize(this.character.manifest)
    const height = this.settings.size
    const width = Math.max(16, Math.min(Math.round((frame.width / frame.height) * height), height * MAX_ASPECT))
    this.width = width
    this.height = height
  }

  private displays(): Display[] {
    return screen.getAllDisplays()
  }

  private currentDisplay(): Display {
    const all = this.displays()
    const chosen = all.find((d) => d.id === this.settings.displayId)
    return chosen ?? bestAreaFor(this.bounds(), all, screen.getPrimaryDisplay())
  }

  private initialPosition(): Point {
    const all = this.displays()
    const saved = this.settings.position
    const chosen = all.find((d) => d.id === this.settings.displayId)
    if (saved && chosen) return clampToArea(saved, this.size(), chosen.workArea)
    if (saved) {
      const display = bestAreaFor({ ...saved, width: this.width, height: this.height }, all, screen.getPrimaryDisplay())
      return clampToArea(saved, this.size(), display.workArea)
    }
    return homePosition(this.size(), (chosen ?? screen.getPrimaryDisplay()).workArea)
  }

  private size(): { width: number; height: number } {
    return { width: this.width, height: this.height }
  }

  private savePosition(): void {
    const display = this.currentDisplay()
    this.store.update({ position: { x: Math.round(this.x), y: Math.round(this.y) }, displayId: display.id })
  }

  // ---------- видимость и команды ----------

  show(): void {
    if (!this.win || this.win.isDestroyed()) return
    // пока был скрыт, время не шло (таймеры стояли); если уже на экране — отсчёт не трогаем
    if (!this.settings.visible) {
      this.store.update({ visible: true })
      this.lastTick = Date.now()
    }
    this.ensureOnScreen()
    this.win.showInactive()
    raiseOnTop(this.win, this.settings.alwaysOnTop)
    this.schedule()
    this.updateCursorPolling()
    this.updateSleepPolling()
    this.onChange()
  }

  hide(): void {
    if (this.settings.visible) this.store.update({ visible: false })
    this.cancelDrag()
    this.stopTimers()
    this.win?.hide()
    this.onChange()
  }

  toggleVisible(): void {
    if (this.settings.visible) this.hide()
    else this.show()
  }

  /** Вернуть питомца в видимую область выбранного монитора и показать его. */
  recenter(): void {
    const area = this.currentDisplay().workArea
    const home = homePosition(this.size(), area)
    this.x = home.x
    this.y = home.y
    this.applyBounds()
    this.savePosition()
    this.show()
  }

  /** Вызывается при подключении/отключении мониторов и смене разрешения. */
  ensureOnScreen(): void {
    const all = this.displays()
    let display = all.find((d) => d.id === this.settings.displayId)
    if (!display) {
      display = bestAreaFor(this.bounds(), all, screen.getPrimaryDisplay())
    }
    const clamped = clampToArea({ x: this.x, y: this.y }, this.size(), display.workArea)
    const moved = Math.round(clamped.x) !== Math.round(this.x) || Math.round(clamped.y) !== Math.round(this.y)
    this.x = clamped.x
    this.y = clamped.y
    this.applyBounds()
    if (moved || display.id !== this.settings.displayId) this.savePosition()
  }

  moveToDisplay(id: number): void {
    const display = this.displays().find((d) => d.id === id)
    if (!display) return
    const home = homePosition(this.size(), display.workArea)
    this.x = home.x
    this.y = home.y
    this.store.update({ displayId: id, position: home })
    this.applyBounds()
  }

  setCharacter(character: CharacterSummary): void {
    this.character = character
    this.facing = character.manifest.facing
    this.resize()
    this.cancelDrag()
    this.brain.reset()
    this.sendConfig()
    this.pushView(true)
    this.schedule()
    this.updateCursorPolling()
    this.updateSleepPolling()
  }

  /** Пересчёт размера с сохранением точки «низ по центру». */
  resize(): void {
    const oldW = this.width
    const oldH = this.height
    this.computeSize()
    this.x += (oldW - this.width) / 2
    this.y += oldH - this.height
    this.ensureOnScreen()
  }

  applySettings(previous: Settings): void {
    const s = this.settings
    if (s.size !== previous.size) this.resize()
    if (s.opacity !== previous.opacity) this.win?.setOpacity(s.opacity)
    if (s.walking !== previous.walking) this.brain.setWalking(s.walking && !this.sleeping)
    if (s.paused !== previous.paused) this.brain.setPaused(s.paused)
    if (s.clickThrough !== previous.clickThrough) this.applyClickThrough()
    if (s.clickThrough !== previous.clickThrough || s.smooth !== previous.smooth || s.speed !== previous.speed) this.sendConfig()
    if (s.displayId !== previous.displayId && s.displayId !== null) this.moveToDisplay(s.displayId)
    if (s.followCursor !== previous.followCursor) this.updateCursorPolling()
    if (s.alwaysOnTop !== previous.alwaysOnTop && this.win) raiseOnTop(this.win, s.alwaysOnTop)
    this.pushView()
    this.schedule()
  }

  // ---------- связь с renderer ----------

  config(): PetConfig {
    return {
      character: this.character,
      clickThrough: this.settings.clickThrough,
      smooth: this.settings.smooth,
      speed: this.walkSpeed
    }
  }

  /** Скорость прогулки с учётом темпа персонажа, px/с. */
  private get walkSpeed(): number {
    return this.settings.speed * (this.character.manifest.pace ?? 1)
  }

  private sendConfig(): void {
    this.send(IPC.petConfig, this.config())
  }

  private send(channel: string, payload: unknown): void {
    if (this.win && !this.win.isDestroyed()) this.win.webContents.send(channel, payload)
  }

  currentLook(): Direction {
    return this.gaze.direction
  }

  view(): PetView {
    const manifest = this.character.manifest
    const mode = this.brain.mode
    // В покое: слушает музыку (говорит, не снимая наушников — иначе на реплике «надеваю наушники»
    // он их снимал) > говорит (реплика) > сон > обычный взгляд.
    const listening = mode === 'idle' && this.listening && Boolean(manifest.animations.music)
    const talking = mode === 'idle' && !listening && Date.now() < this.talkingUntil && Boolean(manifest.animations.talk)
    const sleepy = mode === 'idle' && !talking && !listening && this.sleeping && Boolean(manifest.animations.sleep)
    const special = sleepy || talking || listening
    const wanted =
      mode === 'walk'
        ? 'walk'
        : mode === 'drag'
          ? 'drag'
          : mode === 'react'
            ? (this.brain.reaction ?? 'idle')
            : sleepy
              ? 'sleep'
              : talking
                ? 'talk'
                : listening
                  ? 'music'
                  : 'idle'
    const has = Boolean(manifest.animations[wanted])
    const animation = has ? wanted : 'idle'
    let look: Direction | null = null
    let gaze = false
    if (manifest.look && mode !== 'react' && !special && (mode === 'idle' || !has)) {
      if (mode === 'walk') look = this.brain.direction > 0 ? 'right' : 'left'
      else if (mode === 'drag') look = 'down'
      else {
        look = 'center'
        gaze = this.settings.followCursor
      }
    }
    const flip = look === null && this.facing !== manifest.facing
    return { mode, animation, look, gaze, flip, seq: this.seq, speed: mode === 'walk' ? this.speedNow : 0, stopAt: mode === 'walk' ? this.walkStopAt : undefined }
  }

  private pushView(restart = false): void {
    if (restart || this.brain.mode !== this.lastMode) this.seq += 1
    this.lastMode = this.brain.mode
    const view = this.view()
    this.lastAnimation = view.animation
    this.send(IPC.petView, view)
  }

  /**
   * Обновить вид, а анимацию начать заново, только если она сменилась: реплика, музыка или сон
   * не должны перезапускать идущую «фишку» (например, выглядывание из-за края).
   */
  private refreshView(): void {
    this.pushView(this.view().animation !== this.lastAnimation)
  }

  setInteractive(interactive: boolean): void {
    if (!this.settings.clickThrough || this.dragTimer || interactive === this.interactive) return
    this.interactive = interactive
    this.win?.setIgnoreMouseEvents(!interactive, { forward: true })
  }

  private applyClickThrough(): void {
    if (!this.win) return
    this.interactive = !this.settings.clickThrough
    if (this.settings.clickThrough) this.win.setIgnoreMouseEvents(true, { forward: true })
    else this.win.setIgnoreMouseEvents(false)
  }

  // ---------- поведение ----------

  private stopTimers(): void {
    for (const timer of [this.walkTimer, this.wakeTimer, this.dragTimer, this.cursorTimer, this.sleepTimer]) {
      if (timer) clearInterval(timer)
    }
    this.walkTimer = this.wakeTimer = this.dragTimer = this.cursorTimer = this.sleepTimer = null
  }

  /** Таймер ходьбы работает только в режиме walk; в остальных — один setTimeout до смены состояния. */
  private schedule(): void {
    if (this.walkTimer) clearInterval(this.walkTimer)
    if (this.wakeTimer) clearTimeout(this.wakeTimer)
    this.walkTimer = this.wakeTimer = null
    if (!this.win || !this.settings.visible || this.brain.mode === 'drag') return
    // Перепланирование (настройки, сон, музыка) не должно продлевать текущую реакцию или покой:
    // время с прошлого шага засчитывается, если состояние с тех пор не сменилось.
    const now = Date.now()
    if (this.brain.mode !== 'walk' && this.armedEpoch === this.brain.epoch) this.brain.timeLeft -= now - this.lastTick
    this.armedEpoch = this.brain.epoch
    this.lastTick = now
    if (this.brain.mode === 'walk') {
      this.walkTimer = setInterval(() => this.advance(), WALK_INTERVAL_MS)
    } else if (Number.isFinite(this.brain.timeLeft)) {
      this.wakeTimer = setTimeout(() => this.advance(), Math.max(16, this.brain.timeLeft))
    }
  }

  private advance(): void {
    const now = Date.now()
    const before = this.brain.mode
    // Шаг ходьбы ограничен (после «засыпания» таймера окно не прыгает), а таймеры покоя и реакций
    // считают всё прошедшее время — иначе 10-секундная реакция растягивалась на минуты.
    const dt = before === 'walk' ? Math.min(now - this.lastTick, 250) : now - this.lastTick
    this.lastTick = now
    const reactionBefore = this.brain.reaction
    const facingBefore = this.facing
    if (before === 'walk') this.walk(dt)
    const idleOver = before === 'idle' && this.brain.mode === 'idle' && this.brain.timeLeft <= dt
    this.brain.tick(dt)
    if (this.brain.mode !== 'walk') this.peekSide = null
    if (idleOver && this.brain.mode === 'idle' && this.maybeAct()) return
    if (before !== 'walk' && this.brain.mode === 'walk') this.startWalk(true)
    // выглянул из-за края и вернулся — теперь смотрит внутрь экрана
    if (before === 'react' && reactionBefore === 'peek' && this.brain.mode !== 'react') this.facing = this.facing === 'left' ? 'right' : 'left'
    if (this.brain.mode === 'walk') this.facing = this.brain.direction > 0 ? 'right' : 'left'
    if (before === 'walk' && this.brain.mode !== 'walk') this.savePosition()
    if (this.brain.mode !== before || this.facing !== facingBefore) this.pushView()
    if (this.brain.mode !== before || this.brain.mode !== 'walk') this.schedule()
  }

  private walk(dt: number): void {
    const area = this.currentDisplay().workArea
    // Ровный шаг окна: целое число пикселей за тик. Иначе при 1,1 px/тик окно идёт 1,1,1,1,2… —
    // и кот заметно «дёргается», как робот. На разгоне и торможении (меньше пикселя) — плавно.
    const perTick = (this.currentWalkSpeed() * WALK_INTERVAL_MS) / 1000
    const px = perTick >= 0.75 ? Math.round(perTick) : perTick
    const speed = (px * 1000) / WALK_INTERVAL_MS
    this.setSpeed(speed)
    const distance = perTick >= 0.75 ? px * ticks(dt / WALK_INTERVAL_MS) : (speed * dt) / 1000
    const step = walkStep(this.x, this.brain.direction, distance, this.width, area)
    this.x = step.x
    this.y = clampToArea({ x: this.x, y: this.y }, this.size(), area).y
    this.applyBounds()
    if (step.hitEdge && step.hitEdge === this.peekSide) {
      this.peekSide = null
      this.react('peek')
      return
    }
    // край за спиной не считается (кот стоит у края и только собирается идти прочь)
    if (step.hitEdge && (step.hitEdge === 'right') === (this.brain.direction > 0)) {
      const direction = this.brain.direction
      this.brain.hitEdge(step.hitEdge)
      // развернулся — остановиться и пойти обратно обычным шагом, а не продолжить на полном ходу
      if (this.brain.mode === 'walk' && this.brain.direction !== direction) {
        this.runMul = 1
        const rig = this.character.manifest.rig
        const delay = rig === 'bunny' ? BUNNY_TURN_BACK_DELAY_MS : rig ? RIG_TURN_BACK_DELAY_MS : TURN_BACK_DELAY_MS
        this.walkStartedAt = Date.now() - this.walkStartDelay + delay
        this.setSpeed(0)
      }
    }
  }

  /** Начало прогулки: плавный старт; изредка (у «кукол») — пробежка. */
  private startWalk(allowRun: boolean): void {
    this.walkStartedAt = Date.now()
    this.runMul = 1
    this.speedNow = 0
    this.sentSpeed = 0
    if (allowRun && this.character.manifest.rig && Date.now() - this.lastRunAt > RUN_MIN_GAP_MS && Math.random() < RUN_CHANCE) this.startRun()
  }

  /** Пробежка в ту сторону, где больше места, — так, чтобы остановиться до края. */
  /** explicit — по команде из меню: работает и при выключенных прогулках, и на коротком отрезке. */
  private startRun(explicit = false): boolean {
    if (!explicit && !this.brain.canWalk) return false
    const area = this.currentDisplay().workArea
    const left = this.x - area.x
    const right = area.x + area.width - (this.x + this.width)
    const room = Math.max(left, right)
    if (room < (explicit ? RUN_MIN_ROOM / 3 : RUN_MIN_ROOM)) return false
    const direction = right >= left ? 1 : -1
    const speed = this.walkSpeed * RUN_MULT
    const distance = Math.min(room - 60, (speed * RUN_MAX_MS) / 1000)
    // со сглаженными разгоном и торможением путь — как у полной скорости на (время − половины разгонов)
    const duration = this.walkStartDelay + (distance / speed) * 1000 + (this.accelMs(true) + this.decelMs(true)) / 2
    const wasWalking = this.brain.mode === 'walk'
    if (!this.brain.walkTo(direction, duration, explicit)) return false
    if (!wasWalking) this.walkStartedAt = Date.now()
    this.runMul = RUN_MULT
    this.lastRunAt = Date.now()
    this.facing = direction > 0 ? 'right' : 'left'
    return true
  }

  /** Пауза перед стартом прогулки: персонаж успевает повернуться боком и встать. */
  private get walkStartDelay(): number {
    if (this.isBunny) return BUNNY_WALK_START_DELAY_MS
    return this.character.manifest.rig === 'blackcat' ? CAT_WALK_START_DELAY_MS : WALK_START_DELAY_MS
  }

  private get isBunny(): boolean {
    return this.character.manifest.rig === 'bunny'
  }

  private accelMs(run: boolean): number {
    return this.isBunny ? BUNNY_ACCEL_MS : run ? RUN_ACCEL_MS : WALK_ACCEL_MS
  }

  private decelMs(run: boolean): number {
    return this.isBunny ? BUNNY_DECEL_MS : run ? RUN_DECEL_MS : WALK_DECEL_MS
  }

  /**
   * Когда окно остановится (для кролика — когда ему приземлиться последним прыжком): он подгоняет темп
   * прыжков, чтобы не «ехать» в присяде и не делать лишний мелкий прыжок. К краю для выглядывания идёт
   * без торможения — там момента остановки нет.
   */
  private get walkStopAt(): number | undefined {
    if (this.peekSide || this.brain.mode !== 'walk') return undefined
    return Math.round(Date.now() + this.brain.timeLeft - this.decelMs(this.runMul > 1) * (this.isBunny ? BUNNY_LAND_AT : 0))
  }

  /** Скорость окна сейчас: пауза на разворот и подъём, плавный разгон, плавное торможение в конце. */
  private currentWalkSpeed(): number {
    const run = this.runMul > 1
    const elapsed = Date.now() - this.walkStartedAt - this.walkStartDelay
    const up = ramp(elapsed / this.accelMs(run))
    // к краю для выглядывания идёт не тормозя — и сразу уходит за край
    const down = this.peekSide ? 1 : ramp(this.brain.timeLeft / this.decelMs(run))
    return this.walkSpeed * this.runMul * up * down
  }

  /** Сообщить renderer скорость окна, когда она заметно изменилась (разгон, торможение). */
  private setSpeed(speed: number): void {
    this.speedNow = speed
    const changed = Math.abs(speed - this.sentSpeed) > Math.max(2, this.sentSpeed * 0.04) || (speed === 0) !== (this.sentSpeed === 0)
    if (!changed) return
    this.sentSpeed = speed
    this.send(IPC.petView, this.view())
  }

  /** Редкие «фишки» персонажа (для меню); «кукла» ещё умеет пробежаться. */
  get idleActs(): string[] {
    const acts = this.character.manifest.reactions?.idle ?? []
    return this.character.manifest.rig ? [...acts, 'run', 'sleep'] : acts
  }

  /** Запустить «фишку» сразу (из меню). */
  act(name: string): boolean {
    if (!this.idleActs.includes(name) || this.brain.mode === 'drag') return false
    this.lastActAt = Date.now()
    if (name === 'sleep') return this.nap()
    // спит — сначала просыпается
    if (this.sleeping) {
      this.napUntil = 0
      this.setSleeping(false)
    }
    if (name === 'run') {
      const wasWalking = this.brain.mode === 'walk'
      if (!this.startRun(true)) return false
      if (!wasWalking) this.speedNow = this.sentSpeed = 0
      this.pushView()
      this.schedule()
      return true
    }
    return name === 'peek' ? this.startPeek(true) : this.react(name)
  }

  /** Иногда вместо обычного покоя — редкая «фишка» персонажа. */
  private maybeAct(): boolean {
    const acts = this.character.manifest.reactions?.idle
    const now = Date.now()
    if (!acts?.length || now - this.lastActAt < ACT_MIN_GAP_MS || Math.random() > ACT_CHANCE) return false
    if (this.sleeping || this.listening || now < this.talkingUntil || !this.win || !this.settings.visible) return false
    const name = acts[Math.floor(Math.random() * acts.length)]
    this.lastActAt = now
    return name === 'peek' ? this.startPeek() : this.react(name)
  }

  /** Дойти до ближайшего края экрана — там персонаж спрячется и будет выглядывать. */
  /** anyDistance — по команде из меню: к любому краю и даже при выключенных прогулках. */
  private startPeek(anyDistance = false): boolean {
    if (!anyDistance && !this.brain.canWalk) return false
    const area = this.currentDisplay().workArea
    const left = this.x - area.x
    const right = area.x + area.width - (this.x + this.width)
    const side = left < right ? 'left' : 'right'
    if (!anyDistance && Math.min(left, right) > PEEK_MAX_DISTANCE) return false
    if (Math.min(left, right) < 2) {
      const before = this.facing
      this.facing = side
      if (this.react('peek')) return true
      this.facing = before
      return false
    }
    const wasWalking = this.brain.mode === 'walk'
    if (!this.brain.walkTo(side === 'right' ? 1 : -1, 60_000, anyDistance)) return false
    this.facing = side
    if (!wasWalking) this.startWalk(false)
    // кролик к краю бежит — как в «пробежаться» (и за край убегает в том же темпе)
    this.runMul = this.isBunny ? RUN_MULT : 1
    this.peekSide = side
    this.pushView()
    this.schedule()
    return true
  }

  /** Вздремнуть сейчас (из меню) — на NAP_MS, затем проснуться, если человек за компьютером. */
  private nap(): boolean {
    if (!this.character.manifest.animations.sleep || this.brain.mode === 'drag') return false
    this.napUntil = Date.now() + NAP_MS
    if (this.napTimer) clearTimeout(this.napTimer)
    this.napTimer = setTimeout(() => {
      this.napTimer = null
      this.napUntil = 0
      this.setSleeping(powerMonitor.getSystemIdleTime() >= SLEEP_AFTER_S)
    }, NAP_MS)
    this.setSleeping(true)
    return true
  }

  click(): void {
    if (this.brain.mode === 'drag') return
    this.napUntil = 0
    if (this.sleeping) this.setSleeping(false)
    this.events.clicked()
    const name = this.clicks.register(this.character.manifest, Date.now())
    if (name) this.react(name)
  }

  /** Проиграть одну анимацию-реакцию (если она есть у персонажа). */
  react(name: string): boolean {
    const animation = this.character.manifest.animations[name]
    if (!animation || this.brain.mode === 'drag' || !this.win || !this.settings.visible) return false
    if (this.brain.mode === 'walk') this.savePosition()
    this.brain.react(name, animationDuration(animation))
    this.pushView(true)
    this.schedule()
    return true
  }

  /** Персонаж «говорит», пока на экране его реплика. */
  setTalking(durationMs: number): void {
    if (!this.character.manifest.animations.talk) return
    this.talkingUntil = Date.now() + durationMs
    if (this.talkTimer) clearTimeout(this.talkTimer)
    // Срок сбрасываем явно: таймер может сработать на долю мс раньше talkingUntil — и рот остался бы открытым.
    this.talkTimer = setTimeout(() => {
      this.talkTimer = null
      this.talkingUntil = 0
      this.refreshView()
    }, durationMs)
    this.refreshView()
  }

  setMusic(playing: boolean): void {
    if (playing === this.music) return
    this.music = playing
    if (this.musicTimer) clearTimeout(this.musicTimer)
    this.musicTimer = null
    if (playing) this.listen()
    else this.listenUntil = 0
    this.refreshView()
  }

  /** Надеть наушники на время; если музыка играет и дальше — через несколько минут ещё раз. */
  private listen(): void {
    const ms = between(LISTEN_MIN_MS, LISTEN_MAX_MS)
    this.listenUntil = Date.now() + ms
    this.musicTimer = setTimeout(() => {
      // явно снять наушники (таймер может сработать на долю мс раньше listenUntil)
      this.listenUntil = 0
      this.refreshView()
      this.musicTimer = setTimeout(() => {
        this.musicTimer = null
        if (!this.music) return
        this.listen()
        this.refreshView()
      }, between(LISTEN_AGAIN_MIN_MS, LISTEN_AGAIN_MAX_MS))
    }, ms)
  }

  private get listening(): boolean {
    return this.music && Date.now() < this.listenUntil
  }

  /** Есть ли у персонажа анимация «слушает музыку» — иначе звук можно не отслеживать. */
  get canListen(): boolean {
    return Boolean(this.character.manifest.animations.music)
  }

  // ---------- перетаскивание ----------

  dragStart(): void {
    if (!this.win || this.dragTimer) return
    const cursor = screen.getCursorScreenPoint()
    this.dragOffset = { x: cursor.x - this.x, y: cursor.y - this.y }
    // взяли в руку — проснулся (и после не ложится обратно, как и после клика)
    this.napUntil = 0
    if (this.sleeping) this.setSleeping(false)
    this.brain.startDrag()
    this.peekSide = null
    this.schedule()
    this.pushView()
    this.dragTimer = setInterval(() => {
      if (!this.dragOffset) return
      const point = screen.getCursorScreenPoint()
      const x = point.x - this.dragOffset.x
      const y = point.y - this.dragOffset.y
      if (x === this.x && y === this.y) return
      this.x = x
      this.y = y
      this.applyBounds()
    }, DRAG_INTERVAL_MS)
  }

  dragEnd(): void {
    if (!this.dragTimer) return
    this.cancelDrag()
    const cursor = screen.getCursorScreenPoint()
    const display = screen.getDisplayNearestPoint(cursor)
    const clamped = clampToArea({ x: this.x, y: this.y }, this.size(), display.workArea)
    this.x = clamped.x
    this.y = clamped.y
    this.applyBounds()
    this.store.update({ displayId: display.id, position: { x: Math.round(this.x), y: Math.round(this.y) } })
    this.brain.endDrag()
    this.pushView()
    this.schedule()
    this.onChange()
    this.events.dropped()
  }

  private cancelDrag(): void {
    if (this.dragTimer) clearInterval(this.dragTimer)
    this.dragTimer = null
    this.dragOffset = null
  }

  // ---------- сон ----------

  /** Проверяет простой системы раз в 20 с — только если у персонажа есть анимация sleep. */
  private updateSleepPolling(): void {
    const need = Boolean(this.win && this.settings.visible && this.character.manifest.animations.sleep)
    if (need && !this.sleepTimer) {
      this.sleepTimer = setInterval(() => this.setSleeping(powerMonitor.getSystemIdleTime() >= SLEEP_AFTER_S || Date.now() < this.napUntil), SLEEP_CHECK_MS)
    } else if (!need && this.sleepTimer) {
      clearInterval(this.sleepTimer)
      this.sleepTimer = null
      this.setSleeping(false)
    }
  }

  private setSleeping(sleeping: boolean): void {
    if (sleeping === this.sleeping) return
    this.sleeping = sleeping
    // Спящий питомец не гуляет.
    this.brain.setWalking(this.settings.walking && !sleeping)
    // Перед сном — зевок (после реакции автомат вернётся в покой, а покой при sleeping — сон).
    if (sleeping && this.brain.mode === 'idle' && this.react('yawn')) return
    this.refreshView()
    this.schedule()
  }

  // ---------- взгляд за курсором ----------

  private updateCursorPolling(): void {
    const manifest = this.character.manifest
    const need = Boolean(this.win && this.settings.visible && (manifest.look || manifest.rig) && this.settings.followCursor)
    if (need && !this.cursorTimer) {
      this.cursorTimer = setInterval(() => this.pollCursor(), CURSOR_INTERVAL_MS)
    } else if (!need && this.cursorTimer) {
      clearInterval(this.cursorTimer)
      this.cursorTimer = null
      this.gaze = { direction: 'center', sector: -1 }
      this.lastCursor = null
      this.send(IPC.petLook, 'center')
    }
  }

  private pollCursor(): void {
    const cursor = screen.getCursorScreenPoint()
    if (this.lastCursor && cursor.x === this.lastCursor.x && cursor.y === this.lastCursor.y && !this.walkTimer && !this.dragTimer) return
    this.lastCursor = cursor
    // Курсор сдвинулся — человек вернулся, просыпаемся сразу (кроме «вздремнуть» из меню).
    if (this.sleeping && Date.now() >= this.napUntil) this.setSleeping(false)
    // Центр самой картинки: у автоанимации окно выше картинки (запас сверху под прыжок).
    const charHeight = this.settings.size
    const dx = cursor.x - (this.x + this.width / 2)
    const dy = cursor.y - (this.y + this.height - charHeight / 2)
    const deadZone = Math.max(24, charHeight * 0.5)
    const next = pickGaze(dx, dy, this.gaze.sector, deadZone)
    if (next.direction !== this.gaze.direction) this.send(IPC.petLook, next.direction)
    // «Кукле» нужен точный курсор: она плавно поворачивает голову и водит глазами.
    if (this.character.manifest.rig) this.send(IPC.petPointer, { x: cursor.x - this.x, y: cursor.y - this.y })
    this.gaze = next
  }
}
