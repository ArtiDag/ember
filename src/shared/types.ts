// Общие типы main / preload / renderer. Без зависимостей от Electron и DOM.

import type { Lang } from './i18n'

export const DIRECTIONS = [
  'up-left',
  'up',
  'up-right',
  'left',
  'center',
  'right',
  'down-left',
  'down',
  'down-right'
] as const

export type Direction = (typeof DIRECTIONS)[number]
export type Facing = 'left' | 'right'

/** Лист со спрайтами: равномерная сетка columns × rows кадров frameWidth × frameHeight. */
export interface SheetDef {
  file: string
  frameWidth: number
  frameHeight: number
  columns: number
  rows: number
}

/** Анимация: последовательность индексов кадров в листе (слева направо, сверху вниз). */
export interface AnimationDef {
  sheet: string
  frames: number[]
  fps: number
  loop: boolean
}

/** Необязательный «взгляд»: по одному кадру на каждое из 9 направлений. */
export interface LookDef {
  sheet: string
  frames: Record<Direction, number>
}

export interface ReactionsDef {
  /** Анимации, которые по очереди проигрываются при клике. */
  click?: string[]
  /** Анимация после 4 быстрых кликов подряд. */
  rapidClick?: string
  /**
   * Редкие «фишки» в покое (не чаще раза в минуту). Имя 'peek' особое: персонаж сначала
   * доходит до края экрана, а анимация показывает, как он прячется и выглядывает.
   */
  idle?: string[]
}

/** character.json, formatVersion 1. Подробно — docs/character-format.md. */
export interface CharacterManifest {
  formatVersion: 1
  name: string
  author?: string
  license?: string
  /** Куда смотрит персонаж на исходных кадрах. Нужно для отражения при ходьбе. */
  facing: Facing
  /** true — масштабировать без сглаживания (пиксель-арт). */
  pixelArt: boolean
  /**
   * Встроенная «кукла»: персонаж рисуется кодом в каждом кадре (позы плавно перетекают).
   * Листы тогда нужны только как запасная картинка. Известные: 'blackcat'.
   */
  rig?: 'blackcat' | 'bunny'
  /** Темп прогулки: множитель к скорости из настроек (0.2–2). Котёнок ходит неторопливо. */
  pace?: number
  /** Род персонажа в русских репликах (по умолчанию мужской). */
  gender?: Gender
  /** Доля высоты кадра снизу (0–0.6), которая плавно растворяется — вместо ровного среза бюста. */
  fadeBottom?: number
  sheets: Record<string, SheetDef>
  /** idle обязателен; walk и drag — зарезервированные имена; остальные — для реакций. */
  animations: Record<string, AnimationDef>
  look?: LookDef
  reactions?: ReactionsDef
}

export type CharacterKind = 'static' | 'animated' | 'look' | 'rig'

export interface CharacterSummary {
  id: string
  name: string
  builtin: boolean
  kind: CharacterKind
  author?: string
  license?: string
  /** pet-asset:// URL папки персонажа, со слешем на конце. */
  baseUrl: string
  manifest: CharacterManifest
}

export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export type BubbleStyle = 'light' | 'dark'

/** Грамматический род в русских репликах: 'm' — «рад», 'f' — «рада». */
export type Gender = 'm' | 'f'

export interface Settings {
  activeCharacterId: string
  /** Высота питомца в DIP. */
  size: number
  opacity: number
  /** Скорость прогулки, DIP в секунду. */
  speed: number
  walking: boolean
  paused: boolean
  visible: boolean
  followCursor: boolean
  clickThrough: boolean
  /** Запускать приложение при входе в систему (macOS и Windows, только установленная версия). */
  launchAtLogin: boolean
  /** Тема окна настроек и системных диалогов. */
  theme: 'system' | 'dark' | 'light'
  /** Реагировать на звук: персонаж надевает наушники, пока на компьютере играет музыка. */
  reactToMusic: boolean
  /** Плавная анимация: перетекание кадров, дыхание, моргание. */
  smooth: boolean
  /** Питомец поверх всех окон (иначе — обычное окно: другие окна его закрывают). */
  alwaysOnTop: boolean
  /** Реплики в облачке над питомцем. */
  chatter: boolean
  /** Как обращаться к пользователю в русских репликах: 'neutral' — только фразы без рода. */
  addressAs: 'neutral' | Gender
  /** Цвет облачка: светлое (белое с тонкой обводкой) или тёмное (как кролик, без обводки). */
  bubbleStyle: BubbleStyle
  chatterFrequency: 'rare' | 'normal' | 'often'
  /** Напоминать о перерыве при долгой работе. */
  breakReminders: boolean
  /** Язык интерфейса и реплик. */
  language: Lang
  displayId: number | null
  /** Левый верхний угол окна питомца в координатах Electron screen (DIP). */
  position: Point | null
}

export interface DisplayInfo {
  id: number
  label: string
  primary: boolean
  workArea: Rect
  scaleFactor: number
}

export interface AppState {
  settings: Settings
  characters: CharacterSummary[]
  displays: DisplayInfo[]
  platform: string
  /** true — установленное приложение (не режим разработки). */
  installed: boolean
}

/** Что рисовать в окне питомца. Вычисляется в main. */
export interface PetView {
  mode: 'idle' | 'walk' | 'drag' | 'react'
  animation: string
  /** Если задано — рисуется кадр взгляда вместо анимации. */
  look: Direction | null
  /** true — вместо look использовать последнее направление из pet:look (слежение за курсором). */
  gaze: boolean
  /** Нужно ли отразить кадр по горизонтали. */
  flip: boolean
  /** Меняется при каждом новом запуске анимации, чтобы начать её с первого кадра. */
  seq: number
  /** Текущая скорость окна при прогулке, px/с (с плавным разгоном и торможением; бег — быстрее). */
  speed?: number
  /** Когда окно остановится в конце прогулки (Date.now(), мс): кролик подгоняет прыжки, чтобы приземлиться к этому моменту. */
  stopAt?: number
}

export interface PetConfig {
  character: CharacterSummary
  clickThrough: boolean
  smooth: boolean
  /** Скорость прогулки, DIP/с — «куклам», чтобы шаги совпадали с движением окна. */
  speed: number
}

export type PetAction = 'show' | 'hide' | 'toggle-visible' | 'toggle-pause' | 'recenter' | 'say'

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }
