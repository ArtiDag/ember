// Когда питомец говорит: случайные реплики, напоминания о перерыве, приветствия, реакции.
// Активность пользователя определяется по времени простоя системы (powerMonitor) — раз в 30 секунд.

import { powerMonitor } from 'electron'
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { ActivityTracker, CHATTER_TIMING, PhrasePicker, bubbleDuration, dayPart, formatDuration, randomDelay, type Voice } from '../shared/chatter'
import { RAPID_CLICKS, RAPID_WINDOW_MS } from '../shared/reactions'
import type { Settings } from '../shared/types'
import type { BubbleWindow } from './bubbleWindow'

const POLL_MS = 30_000
const GREETING_DELAY_MS = 2500

export class ChatterController {
  private readonly picker: PhrasePicker
  private readonly activity = new ActivityTracker()
  private pollTimer: NodeJS.Timeout | null = null
  private nextRandomAt = 0
  private lastReactionAt = -Infinity
  private clicks: number[] = []
  private greeted = false
  private lastMusicAt = -Infinity
  /** Подписчики: персонаж «говорит», пока видна реплика; зевает при напоминании о перерыве. */
  hooks: { spoke(durationMs: number): void; breakTime(): void } = { spoke: () => {}, breakTime: () => {} }

  constructor(
    private readonly bubble: BubbleWindow,
    private readonly settings: () => Settings,
    /** Файл с прогрессом «кругов» реплик, чтобы после перезапуска фразы не начинались заново. */
    private readonly stateFile: string,
    /** Род в русских репликах: как обращаться к пользователю и какого рода сам персонаж. */
    voice: () => Voice
  ) {
    let saved: unknown = {}
    try {
      saved = JSON.parse(readFileSync(stateFile, 'utf8'))
    } catch {
      // нет файла или он повреждён — начинаем новые круги
    }
    this.picker = new PhrasePicker(Math.random, saved, voice)
  }

  private saveState(): void {
    try {
      writeFileSync(`${this.stateFile}.tmp`, JSON.stringify(this.picker.state()), 'utf8')
      renameSync(`${this.stateFile}.tmp`, this.stateFile)
    } catch (error) {
      console.warn('Не удалось сохранить прогресс реплик', error)
    }
  }

  private get enabled(): boolean {
    const s = this.settings()
    return s.chatter && s.visible
  }

  start(): void {
    this.update()
    if (!this.greeted) {
      this.greeted = true
      setTimeout(() => {
        if (this.enabled) this.say(this.picker.pick(dayPart(new Date().getHours())))
      }, GREETING_DELAY_MS)
    }
  }

  /** Включает/выключает опрос в зависимости от настроек. Вызывать при их изменении. */
  update(): void {
    if (this.enabled && !this.pollTimer) {
      this.scheduleRandom()
      this.pollTimer = setInterval(() => this.poll(), POLL_MS)
    } else if (!this.enabled && this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
      this.bubble.hide()
    }
  }

  private scheduleRandom(): void {
    this.nextRandomAt = Date.now() + randomDelay(this.settings().chatterFrequency)
  }

  private pickRandomNow(): string {
    const now = new Date()
    return this.picker.pickRandom(now.getHours(), now.getDay())
  }

  private say(text: string): void {
    void this.bubble.say(text)
    this.hooks.spoke(bubbleDuration(text))
    this.saveState()
  }

  /** На компьютере заиграл звук: иногда — реплика про музыку. */
  onMusic(playing: boolean): void {
    if (!playing || !this.enabled) return
    const now = Date.now()
    if (now - this.lastMusicAt < CHATTER_TIMING.musicGapMs || this.bubble.isShowing) return
    this.lastMusicAt = now
    this.say(this.picker.pick('music'))
  }

  private poll(): void {
    if (!this.enabled) return
    const now = Date.now()
    const idleMs = powerMonitor.getSystemIdleTime() * 1000
    const { event, workedMs } = this.activity.update(now, idleMs)
    if (event === 'back') {
      this.say(this.picker.pick('welcomeBack'))
      this.scheduleRandom()
      return
    }
    if (event === 'break' && this.settings().breakReminders) {
      this.hooks.breakTime()
      this.say(this.picker.pick('longWork', { time: formatDuration(workedMs) }))
      this.scheduleRandom()
      return
    }
    // Случайные реплики — только когда человек за компьютером, иначе говорить некому.
    if (now >= this.nextRandomAt) {
      if (this.activity.isActive(idleMs) && !this.bubble.isShowing) this.say(this.pickRandomNow())
      this.scheduleRandom()
    }
  }

  /** «Скажи что-нибудь» из настроек или меню — работает, даже если реплики выключены. */
  sayNow(): void {
    if (this.settings().visible) this.say(this.pickRandomNow())
  }

  onClick(): void {
    if (!this.enabled) return
    const now = Date.now()
    this.clicks = this.clicks.filter((t) => now - t < RAPID_WINDOW_MS)
    this.clicks.push(now)
    if (this.clicks.length >= RAPID_CLICKS) {
      this.clicks = []
      this.lastReactionAt = now
      this.say(this.picker.pick('rapidClick'))
      return
    }
    this.react(now, CHATTER_TIMING.clickChance, 'click')
  }

  onDrop(): void {
    if (this.enabled) this.react(Date.now(), CHATTER_TIMING.dropChance, 'drop')
  }

  private react(now: number, chance: number, kind: 'click' | 'drop'): void {
    if (now - this.lastReactionAt < CHATTER_TIMING.reactionGapMs || Math.random() >= chance) return
    this.lastReactionAt = now
    this.say(this.picker.pick(kind))
  }

  stop(): void {
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.pollTimer = null
  }
}
