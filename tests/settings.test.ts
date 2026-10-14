import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, sanitizePatch, sanitizeSettings } from '../src/shared/settings'

describe('settings', () => {
  it('мусор превращается в значения по умолчанию', () => {
    expect(sanitizeSettings('garbage')).toEqual(DEFAULT_SETTINGS)
  })
  it('числа ограничиваются, неизвестные поля отбрасываются', () => {
    const s = sanitizeSettings({ size: 10_000, opacity: 0, speed: -5, evil: true, activeCharacterId: '../x', position: { x: 1.4, y: -2.6 } })
    expect(s.size).toBe(480)
    expect(s.opacity).toBe(0.25)
    expect(s.speed).toBe(10)
    expect(s.activeCharacterId).toBe(DEFAULT_SETTINGS.activeCharacterId)
    expect(s.position).toEqual({ x: 1, y: -3 })
    expect('evil' in s).toBe(false)
  })
  it('патч из окна настроек меняет только разрешённые поля', () => {
    const patch = sanitizePatch({ size: 200, activeCharacterId: 'x', position: { x: 0, y: 0 }, opacity: 7 }, DEFAULT_SETTINGS)
    expect(patch).toEqual({ size: 200, opacity: 1 })
  })
})
