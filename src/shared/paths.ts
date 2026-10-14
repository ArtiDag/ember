// Чистая проверка относительного пути из character.json.
// Окончательная проверка (realpath, симлинки) — в src/main/safePath.ts.

import { LIMITS } from './limits'

const SEGMENT = /^[\p{L}\p{N}_\-. ()]+$/u

/** Возвращает текст ошибки или null, если путь допустим. */
export function checkRelativePath(rel: unknown): string | null {
  if (typeof rel !== 'string' || rel.length === 0) return 'путь должен быть непустой строкой'
  if (rel.length > LIMITS.pathLength) return `путь длиннее ${LIMITS.pathLength} символов`
  if (rel.includes('\\')) return 'используйте "/" вместо "\\"'
  if (rel.includes('\0')) return 'недопустимый символ в пути'
  if (rel.startsWith('/') || /^[a-zA-Z]:/.test(rel)) return 'абсолютные пути запрещены'
  const segments = rel.split('/')
  for (const segment of segments) {
    if (segment === '' || segment === '.' || segment === '..') return 'путь не может содержать пустые сегменты, "." или ".."'
    if (!SEGMENT.test(segment)) return `недопустимые символы в "${segment}"`
    if (segment.startsWith('.')) return 'скрытые файлы запрещены'
  }
  return null
}

export function extensionOf(file: string): string {
  const dot = file.lastIndexOf('.')
  return dot === -1 ? '' : file.slice(dot).toLowerCase()
}
