// Шапка окна настроек: знак Ember (тлеющий уголёк), выбор языка (одна кнопка со списком)
// и тумблер светлой/тёмной темы. Монохром.

import { useEffect, useRef, useState } from 'react'
import { LANGS, tr, type Lang } from '../../shared/i18n'

/**
 * Знак Ember — тлеющий уголёк с глазами (общий для всех персонажей); тот же, что в иконке приложения
 * (scripts/generate-assets.mjs): суперэллипс угля, тёплый край снизу справа, искра.
 */
const EMBER_PATH = (() => {
  const pts: string[] = []
  for (let k = 0; k < 72; k++) {
    const t = (k / 72) * Math.PI * 2
    const c = Math.cos(t)
    const s = Math.sin(t)
    const x = 50 + 32 * Math.sign(c) * Math.abs(c) ** (2 / 2.6)
    const y = 58 + 28 * Math.sign(s) * Math.abs(s) ** (2 / 2.6)
    pts.push(`${x.toFixed(2)} ${y.toFixed(2)}`)
  }
  return `M${pts.join('L')}Z`
})()
const SPARK = 'M71 16L72.8 21.2L78 23L72.8 24.8L71 30L69.2 24.8L64 23L69.2 21.2Z'

export function EmberMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="14 12 72 78" aria-hidden="true">
      <defs>
        <clipPath id="ember-body">
          <path d={EMBER_PATH} />
        </clipPath>
        <radialGradient id="ember-glow" cx="66" cy="80" r="24" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ff8fa3" stopOpacity="0.95" />
          <stop offset="1" stopColor="#ff8fa3" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Всегда тёмный уголёк с белыми глазами; в тёмной теме его обводит тонкий светлый контур. */}
      <path d={EMBER_PATH} fill="#141416" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round" />
      <g clipPath="url(#ember-body)">
        <path d={EMBER_PATH} fill="none" stroke="url(#ember-glow)" strokeWidth={8} />
      </g>
      {[40, 60].map((cx) => (
        <ellipse key={cx} cx={cx} cy={57} rx={5.5} ry={6.6} fill="#fbfbf7" />
      ))}
      <path d={SPARK} fill="#ff8fa3" />
      <circle cx={78.5} cy={31} r={1.6} fill="#ff8fa3" />
    </svg>
  )
}

/** Язык: одна кнопка-глобус, по нажатию — список. */
export function LanguageMenu({ value, onChange }: { value: Lang; onChange: (lang: Lang) => void }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: Event): void => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])
  const label = tr('Язык', 'Language', '语言')
  return (
    <div className="menu" ref={box}>
      <button className="icon-button" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z" />
        </svg>
      </button>
      {open && (
        <div className="menu-list" role="menu">
          {LANGS.map((l) => (
            <button
              key={l.id}
              role="menuitemradio"
              aria-checked={l.id === value}
              className={l.id === value ? 'on' : ''}
              onClick={() => {
                onChange(l.id)
                setOpen(false)
              }}
            >
              <span>{l.label}</span>
              {l.id === value && (
                <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Светлая / тёмная тема — тумблер. Пока тема «как в системе», он показывает системную. */
export function ThemeToggle({ theme, onChange }: { theme: 'system' | 'light' | 'dark'; onChange: (theme: 'light' | 'dark') => void }) {
  const query = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null
  const [systemDark, setSystemDark] = useState(query?.matches ?? false)
  useEffect(() => {
    if (!query) return
    const update = (): void => setSystemDark(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [query])
  const dark = theme === 'system' ? systemDark : theme === 'dark'
  const label = dark ? tr('Тёмная тема', 'Dark theme', '深色主题') : tr('Светлая тема', 'Light theme', '浅色主题')
  return (
    <button className={`theme-toggle ${dark ? 'dark' : ''}`} role="switch" aria-checked={dark} aria-label={label} title={label} onClick={() => onChange(dark ? 'light' : 'dark')}>
      <span className="theme-knob">
        {dark ? (
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
          </svg>
        )}
      </span>
    </button>
  )
}
