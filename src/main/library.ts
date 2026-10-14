// Библиотека персонажей: встроенные Бес и Искорка (resources/characters).

import { lstat, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { LIMITS } from '../shared/limits'
import { characterKind, validateManifest } from '../shared/manifest'
import { CHARACTER_ID } from '../shared/settings'
import type { CharacterManifest, CharacterSummary } from '../shared/types'
import { ImportError, resolveInside } from './safePath'
import { tr } from '../shared/i18n'

export const MANIFEST_FILE = 'character.json'
export const ASSET_SCHEME = 'pet-asset'

export interface CharacterEntry {
  summary: CharacterSummary
  dir: string
}

export async function readManifest(dir: string): Promise<CharacterManifest> {
  const file = await resolveInside(dir, MANIFEST_FILE)
  const info = await lstat(file)
  if (info.size > LIMITS.manifestBytes) throw new ImportError(`${MANIFEST_FILE} ${tr('больше', 'is larger than', '超过')} ${LIMITS.manifestBytes / 1024} ${tr('КБ', 'KB', 'KB')}`)
  let raw: unknown
  try {
    raw = JSON.parse(await readFile(file, 'utf8'))
  } catch (error) {
    throw new ImportError(`${MANIFEST_FILE}: ${tr('некорректный JSON', 'invalid JSON', 'JSON 格式错误')} (${(error as Error).message})`)
  }
  const result = validateManifest(raw)
  if (!result.ok) throw new ImportError(`${MANIFEST_FILE}:\n• ${result.errors.join('\n• ')}`)
  return result.manifest
}

export function summarize(id: string, manifest: CharacterManifest): CharacterSummary {
  return {
    id,
    name: manifest.name,
    builtin: true,
    kind: characterKind(manifest),
    author: manifest.author,
    license: manifest.license,
    baseUrl: `${ASSET_SCHEME}://character/${id}/`,
    manifest
  }
}

export class CharacterLibrary {
  private entries = new Map<string, CharacterEntry>()

  constructor(readonly root: string) {}

  async refresh(): Promise<void> {
    const next = new Map<string, CharacterEntry>()
    let names: string[] = []
    try {
      names = await readdir(this.root)
    } catch {
      names = []
    }
    for (const id of names.sort()) {
      if (!CHARACTER_ID.test(id)) continue
      const dir = join(this.root, id)
      try {
        if (!(await lstat(dir)).isDirectory()) continue
        next.set(id, { dir, summary: summarize(id, await readManifest(dir)) })
      } catch (error) {
        console.warn(`Персонаж "${id}" пропущен:`, (error as Error).message)
      }
    }
    this.entries = next
  }

  list(): CharacterSummary[] {
    return [...this.entries.values()]
      .map((e) => e.summary)
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  get(id: string): CharacterEntry | undefined {
    return this.entries.get(id)
  }
}
