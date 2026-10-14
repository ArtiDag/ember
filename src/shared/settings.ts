// Значения по умолчанию и очистка настроек, прочитанных с диска или из IPC.

import { isLang } from './i18n'
import type { Point, Settings } from './types'

export const SETTINGS_LIMITS = {
  size: { min: 48, max: 480 },
  opacity: { min: 0.25, max: 1 },
  speed: { min: 10, max: 400 }
} as const

export const DEFAULT_CHARACTER_ID = 'ugolek'

export const DEFAULT_SETTINGS: Settings = {
  activeCharacterId: DEFAULT_CHARACTER_ID,
  size: 128,
  opacity: 1,
  speed: 60,
  walking: true,
  paused: false,
  visible: true,
  followCursor: true,
  clickThrough: true,
  smooth: true,
  launchAtLogin: false,
  reactToMusic: true,
  theme: 'system',
  alwaysOnTop: true,
  chatter: true,
  bubbleStyle: 'light',
  addressAs: 'neutral',
  chatterFrequency: 'normal',
  breakReminders: true,
  language: 'ru',
  displayId: null,
  position: null
}

export const CHARACTER_ID = /^[a-z0-9][a-z0-9-]{0,63}$/

function num(value: unknown, range: { min: number; max: number }, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(range.max, Math.max(range.min, value))
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function point(value: unknown): Point | null {
  if (typeof value !== 'object' || value === null) return null
  const { x, y } = value as Record<string, unknown>
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return null
  if (Math.abs(x) > 1e6 || Math.abs(y) > 1e6) return null
  return { x: Math.round(x), y: Math.round(y) }
}

/** Полная очистка объекта настроек: неизвестное отбрасывается, всё остальное — в допустимых границах. */
export function sanitizeSettings(raw: unknown, base: Settings = DEFAULT_SETTINGS): Settings {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  return {
    activeCharacterId:
      typeof r.activeCharacterId === 'string' && CHARACTER_ID.test(r.activeCharacterId)
        ? r.activeCharacterId
        : base.activeCharacterId,
    size: Math.round(num(r.size, SETTINGS_LIMITS.size, base.size)),
    opacity: num(r.opacity, SETTINGS_LIMITS.opacity, base.opacity),
    speed: num(r.speed, SETTINGS_LIMITS.speed, base.speed),
    walking: bool(r.walking, base.walking),
    paused: bool(r.paused, base.paused),
    visible: bool(r.visible, base.visible),
    followCursor: bool(r.followCursor, base.followCursor),
    clickThrough: bool(r.clickThrough, base.clickThrough),
    smooth: bool(r.smooth, base.smooth),
    launchAtLogin: bool(r.launchAtLogin, base.launchAtLogin),
    reactToMusic: bool(r.reactToMusic, base.reactToMusic),
    theme: r.theme === 'dark' || r.theme === 'light' || r.theme === 'system' ? r.theme : base.theme,
    alwaysOnTop: bool(r.alwaysOnTop, base.alwaysOnTop),
    chatter: bool(r.chatter, base.chatter),
    addressAs: r.addressAs === 'm' || r.addressAs === 'f' || r.addressAs === 'neutral' ? r.addressAs : base.addressAs,
    bubbleStyle: r.bubbleStyle === 'light' || r.bubbleStyle === 'dark' ? r.bubbleStyle : base.bubbleStyle,
    chatterFrequency:
      r.chatterFrequency === 'rare' || r.chatterFrequency === 'normal' || r.chatterFrequency === 'often'
        ? r.chatterFrequency
        : base.chatterFrequency,
    breakReminders: bool(r.breakReminders, base.breakReminders),
    language: isLang(r.language) ? r.language : base.language,
    displayId: typeof r.displayId === 'number' && Number.isInteger(r.displayId) ? r.displayId : base.displayId,
    position: 'position' in r ? point(r.position) : base.position
  }
}

/** Частичное обновление из окна настроек: только разрешённые поля. */
export const EDITABLE_KEYS = [
  'size',
  'opacity',
  'speed',
  'walking',
  'paused',
  'followCursor',
  'clickThrough',
  'smooth',
  'launchAtLogin',
  'reactToMusic',
  'theme',
  'alwaysOnTop',
  'chatter',
  'bubbleStyle',
  'addressAs',
  'chatterFrequency',
  'breakReminders',
  'language',
  'displayId'
] as const

export type SettingsPatch = Partial<Pick<Settings, (typeof EDITABLE_KEYS)[number]>>

export function sanitizePatch(raw: unknown, current: Settings): SettingsPatch {
  if (typeof raw !== 'object' || raw === null) return {}
  const picked: Record<string, unknown> = {}
  for (const key of EDITABLE_KEYS) {
    if (key in raw) picked[key] = (raw as Record<string, unknown>)[key]
  }
  const merged = sanitizeSettings({ ...current, ...picked }, current)
  const patch: Record<string, unknown> = {}
  for (const key of Object.keys(picked)) patch[key] = merged[key as keyof Settings]
  return patch as SettingsPatch
}
