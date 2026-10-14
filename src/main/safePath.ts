// Безопасное разрешение пути внутри папки персонажа:
// синтаксическая проверка + запрет симлинков на каждом сегменте + realpath внутри корня.

import { lstat, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative } from 'node:path'
import { checkRelativePath } from '../shared/paths'
import { tr } from '../shared/i18n'

export class ImportError extends Error {}

export function isInside(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

/** Возвращает реальный путь к файлу rel внутри root или бросает ImportError. */
export async function resolveInside(root: string, rel: string): Promise<string> {
  const syntax = checkRelativePath(rel)
  if (syntax) throw new ImportError(`"${rel}": ${syntax}`)
  const realRoot = await realpath(root)
  let current = realRoot
  for (const segment of rel.split('/')) {
    current = join(current, segment)
    let info
    try {
      info = await lstat(current)
    } catch {
      throw new ImportError(`"${rel}": ${tr('файл не найден', 'file not found', '找不到文件')}`)
    }
    if (info.isSymbolicLink()) throw new ImportError(`"${rel}": ${tr('символические ссылки запрещены', 'symbolic links are not allowed', '不允许使用符号链接')}`)
  }
  const real = await realpath(current)
  if (!isInside(realRoot, real)) throw new ImportError(`"${rel}": ${tr('путь выходит за пределы папки персонажа', 'the path leaves the character folder', '路径超出了角色文件夹')}`)
  const info = await lstat(real)
  if (!info.isFile()) throw new ImportError(`"${rel}": ${tr('это не файл', 'not a file', '不是文件')}`)
  return real
}
