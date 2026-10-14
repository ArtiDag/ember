import { describe, expect, it } from 'vitest'
import { checkSheetFitsImage, characterKind, validateManifest } from '../src/shared/manifest'
import bunny from '../resources/characters/bunny/character.json'
import ugolek from '../resources/characters/ugolek/character.json'
import bunnyManifest from '../resources/characters/bunny/character.json'
import impManifest from '../resources/characters/ugolek/character.json'
import { spriteManifest } from './fixtures'

const base = () => ({
  formatVersion: 1,
  name: 'Тест',
  facing: 'right',
  sheets: { main: { file: 'sheet.png', frameWidth: 32, frameHeight: 32, columns: 4, rows: 2 } },
  animations: {
    idle: { sheet: 'main', frames: [0, 1], fps: 4, loop: true },
    walk: { sheet: 'main', frames: [4, 5, 6, 7], fps: 8 }
  }
})

describe('validateManifest', () => {
  it('принимает корректный манифест и проставляет значения по умолчанию', () => {
    const res = validateManifest(base())
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.manifest.pixelArt).toBe(false)
    expect(res.manifest.animations.walk.loop).toBe(true)
    expect(characterKind(res.manifest)).toBe('animated')
  })

  it('встроенные персонажи проходят валидацию', () => {
    expect(validateManifest(spriteManifest()).ok).toBe(true)
    expect(validateManifest(bunnyManifest).ok).toBe(true)
    expect(validateManifest(impManifest).ok).toBe(true)
    // кролик — тоже «кукла», с тем же набором действий, что у Уголька
    const rabbit = validateManifest(bunny)
    expect(rabbit.ok).toBe(true)
    if (rabbit.ok) {
      expect(characterKind(rabbit.manifest)).toBe('rig')
      expect(rabbit.manifest.rig).toBe('bunny')
      expect(Object.keys(rabbit.manifest.animations).sort()).toEqual(Object.keys(ugolek.animations).sort())
      expect(rabbit.manifest.reactions).toEqual(ugolek.reactions)
    }
    const cat = validateManifest(ugolek)
    expect(cat.ok).toBe(true)
    if (cat.ok) {
      expect(characterKind(cat.manifest)).toBe('rig')
      for (const name of ['walk', 'drag', 'talk', 'music', 'sleep', 'laugh', 'love', 'dizzy', 'yawn']) {
        expect(cat.manifest.animations[name], name).toBeDefined()
      }
    }
    expect(validateManifest({ ...ugolek, rig: 'robot' }).ok).toBe(false)
    // темп и редкие «фишки» в покое
    if (cat.ok) {
      expect(cat.manifest.pace).toBe(0.55)
      expect(cat.manifest.reactions?.idle).toEqual(['scratch', 'peek'])
    }
    expect(validateManifest({ ...ugolek, pace: 5 }).ok).toBe(false)
    expect(validateManifest({ ...ugolek, reactions: { idle: ['fly'] } }).ok).toBe(false)
  })

  it('требует idle', () => {
    const m = base() as Record<string, unknown>
    m.animations = { walk: (base().animations.walk) }
    const res = validateManifest(m)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.join()).toMatch(/idle/)
  })

  it('отклоняет неизвестную версию формата', () => {
    expect(validateManifest({ ...base(), formatVersion: 2 }).ok).toBe(false)
  })

  it('отклоняет кадры вне сетки', () => {
    const m = base()
    m.animations.idle.frames = [0, 8]
    const res = validateManifest(m)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.join()).toMatch(/вне диапазона 0\.\.7/)
  })

  it('отклоняет опасные пути и не-изображения', () => {
    for (const file of ['../x.png', '/etc/x.png', 'C:/x.png', 'a\\b.png', 'a//b.png', '.hidden.png', 'x.js', 'x.html', 'a/./b.png']) {
      const m = base()
      m.sheets.main.file = file
      expect(validateManifest(m).ok, file).toBe(false)
    }
    const ok = base()
    ok.sheets.main.file = 'sprites/кадры 1.png'
    expect(validateManifest(ok).ok).toBe(true)
  })

  it('отклоняет нецелые размеры, fps вне диапазона и разные размеры кадров', () => {
    const a = base()
    a.sheets.main.frameWidth = 31.5
    expect(validateManifest(a).ok).toBe(false)
    const b = base()
    b.animations.idle.fps = 1000
    expect(validateManifest(b).ok).toBe(false)
    const c = base() as ReturnType<typeof base> & { sheets: Record<string, unknown> }
    c.sheets.other = { file: 'o.png', frameWidth: 16, frameHeight: 16, columns: 1, rows: 1 }
    expect(validateManifest(c).ok).toBe(false)
  })

  it('проверяет ссылки реакций и полноту look', () => {
    expect(validateManifest({ ...base(), reactions: { click: ['nope'] } }).ok).toBe(false)
    expect(validateManifest({ ...base(), look: { sheet: 'main', frames: { center: 0 } } }).ok).toBe(false)
  })

  it('fadeBottom: только число 0..0.6', () => {
    expect(validateManifest({ ...base(), fadeBottom: 0.3 }).ok).toBe(true)
    expect(validateManifest({ ...base(), fadeBottom: 0.9 }).ok).toBe(false)
    expect(validateManifest({ ...base(), fadeBottom: '0.2' }).ok).toBe(false)
  })

  it('отклоняет не-объекты и мусор', () => {
    for (const raw of [null, 1, 'x', [], { formatVersion: 1 }]) expect(validateManifest(raw).ok).toBe(false)
  })

  it('checkSheetFitsImage сравнивает сетку с реальным изображением', () => {
    const sheet = base().sheets.main
    expect(checkSheetFitsImage('main', sheet, 128, 64)).toBeNull()
    expect(checkSheetFitsImage('main', sheet, 127, 64)).toMatch(/128×64/)
  })
})

