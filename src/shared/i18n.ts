// Языки интерфейса и реплик: русский, английский, китайский.
// Текущий язык задаётся отдельно в каждом процессе (main — из настроек, окно настроек — из состояния),
// строки пишутся прямо на месте: tr('Русский', 'English', '中文').

export type Lang = 'ru' | 'en' | 'zh'

export const LANGS: { id: Lang; label: string }[] = [
  { id: 'ru', label: 'Русский' },
  { id: 'en', label: 'English' },
  { id: 'zh', label: '中文' }
]

let current: Lang = 'ru'
let mac = false

export function setLang(lang: Lang): void {
  current = lang
}

export function lang(): Lang {
  return current
}

/** Строка на текущем языке. */
export function tr(ru: string, en: string, zh: string): string {
  return current === 'en' ? en : current === 'zh' ? zh : ru
}

/** Язык по системной локали: ru*, zh* — свои, остальное — английский. */
export function detectLang(locale: string): Lang {
  const l = locale.toLowerCase()
  if (l.startsWith('ru')) return 'ru'
  if (l.startsWith('zh')) return 'zh'
  return 'en'
}

export function isLang(value: unknown): value is Lang {
  return value === 'ru' || value === 'en' || value === 'zh'
}

/** Сочетания клавиш в репликах: на Mac — ⌘, на Windows — Ctrl. */
export function setMac(value: boolean): void {
  mac = value
}

export function keyCombo(key: string): string {
  return mac ? `⌘${key}` : `Ctrl+${key}`
}
