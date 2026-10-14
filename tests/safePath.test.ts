import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { checkRelativePath } from '../src/shared/paths'
import { isInside, resolveInside } from '../src/main/safePath'

let root: string
let outside: string

beforeAll(() => {
  const base = mkdtempSync(join(tmpdir(), 'pet-safe-'))
  root = join(base, 'char')
  outside = join(base, 'secret')
  mkdirSync(join(root, 'sprites'), { recursive: true })
  mkdirSync(outside)
  writeFileSync(join(root, 'sprites', 'a.png'), 'x')
  writeFileSync(join(outside, 'secret.png'), 'x')
  symlinkSync(join(outside, 'secret.png'), join(root, 'link.png'))
  symlinkSync(outside, join(root, 'linkdir'), 'dir')
})

describe('checkRelativePath', () => {
  it('отклоняет обход и абсолютные пути', () => {
    for (const p of ['..', '../a.png', 'a/../../b.png', '/a.png', 'C:\\a.png', 'c:/a.png', '', 'a\0.png']) {
      expect(checkRelativePath(p), p).not.toBeNull()
    }
    expect(checkRelativePath('sprites/a.png')).toBeNull()
  })
})

describe('resolveInside', () => {
  it('разрешает обычный файл внутри папки', async () => {
    expect(await resolveInside(root, 'sprites/a.png')).toMatch(/sprites[/\\]a\.png$/)
  })
  it('запрещает символические ссылки на файл и на папку', async () => {
    await expect(resolveInside(root, 'link.png')).rejects.toThrow(/символические/)
    await expect(resolveInside(root, 'linkdir/secret.png')).rejects.toThrow(/символические/)
  })
  it('запрещает выход за пределы и несуществующие файлы', async () => {
    await expect(resolveInside(root, '../secret/secret.png')).rejects.toThrow()
    await expect(resolveInside(root, 'nope.png')).rejects.toThrow(/не найден/)
    await expect(resolveInside(root, 'sprites')).rejects.toThrow(/не файл/)
  })
  it('isInside', () => {
    expect(isInside('/a/b', '/a/b/c')).toBe(true)
    expect(isInside('/a/b', '/a/bc')).toBe(false)
    expect(isInside('/a/b', '/a/b')).toBe(false)
  })
})
