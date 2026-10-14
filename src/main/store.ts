// Настройки в userData/settings.json. Запись — с задержкой и атомарно (tmp + rename).

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { rename, writeFile } from 'node:fs/promises'
import { DEFAULT_SETTINGS, sanitizeSettings } from '../shared/settings'
import type { Lang } from '../shared/i18n'
import type { Settings } from '../shared/types'

const SAVE_DELAY_MS = 600

export class SettingsStore {
  private timer: NodeJS.Timeout | null = null
  private saving: Promise<void> = Promise.resolve()

  private constructor(
    private readonly file: string,
    public settings: Settings
  ) {}

  /** language — язык по умолчанию (по системе), если в файле он ещё не выбран. */
  static load(file: string, language: Lang = DEFAULT_SETTINGS.language): SettingsStore {
    const defaults = { ...DEFAULT_SETTINGS, language }
    let settings = defaults
    if (existsSync(file)) {
      try {
        settings = sanitizeSettings(JSON.parse(readFileSync(file, 'utf8')), defaults)
      } catch (error) {
        console.warn('settings.json повреждён, используются значения по умолчанию', error)
        try {
          renameSync(file, `${file}.broken`)
        } catch {
          // не критично
        }
      }
    }
    return new SettingsStore(file, settings)
  }

  update(patch: Partial<Settings>): Settings {
    this.settings = sanitizeSettings({ ...this.settings, ...patch }, this.settings)
    this.scheduleSave()
    return this.settings
  }

  private scheduleSave(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      const data = JSON.stringify(this.settings, null, 2)
      this.saving = this.saving
        .then(async () => {
          await writeFile(`${this.file}.tmp`, data, 'utf8')
          await rename(`${this.file}.tmp`, this.file)
        })
        .catch((error) => console.error('Не удалось сохранить настройки', error))
    }, SAVE_DELAY_MS)
  }

  /** Синхронная запись при выходе. */
  flushSync(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    try {
      writeFileSync(`${this.file}.tmp`, JSON.stringify(this.settings, null, 2), 'utf8')
      renameSync(`${this.file}.tmp`, this.file)
    } catch (error) {
      console.error('Не удалось сохранить настройки', error)
    }
  }
}
