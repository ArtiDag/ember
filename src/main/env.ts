// Пути приложения и загрузка страниц renderer.

import { app, type BrowserWindow } from 'electron'
import { join } from 'node:path'

export function resourcesRoot(): string {
  return app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources')
}

export const paths = {
  builtinCharacters: () => join(resourcesRoot(), 'characters'),
  icons: () => join(resourcesRoot(), 'icons'),
  settingsFile: () => join(app.getPath('userData'), 'settings.json'),
  chatterFile: () => join(app.getPath('userData'), 'chatter.json'),
  preload: () => join(__dirname, '../preload/index.js')
}

export function loadPage(win: BrowserWindow, page: 'pet' | 'settings' | 'bubble'): Promise<void> {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (!app.isPackaged && devUrl) return win.loadURL(`${devUrl}/${page}.html`)
  return win.loadFile(join(__dirname, `../renderer/${page}.html`))
}

export const secureWebPreferences = (preload: string): Electron.WebPreferences => ({
  preload,
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true,
  spellcheck: false,
  devTools: !app.isPackaged
})

/**
 * Окно питомца и облачка — поверх всех окон (если onTop() — настройка alwaysOnTop). На Windows флаг «поверх всех»
 * сбрасывается, когда активируется другое окно (особенно тоже «поверх всех»: панель задач, «Пуск», плееры), и
 * неактивируемое окно само наверх не возвращается — поэтому там уровень выше и окно раз в секунду поднимается
 * заново (без захвата фокуса). Выключено — обычное окно: другие окна его закрывают.
 */
export function keepOnTop(win: BrowserWindow, onTop: () => boolean): void {
  raiseOnTop(win, onTop())
  win.on('show', () => raiseOnTop(win, onTop()))
  if (process.platform !== 'win32') return
  const timer = setInterval(() => {
    if (!win.isDestroyed() && win.isVisible() && onTop()) raiseOnTop(win, true)
  }, 1000)
  win.on('closed', () => clearInterval(timer))
}

/** Применить «поверх всех окон» сейчас (после показа или смены настройки). */
export function raiseOnTop(win: BrowserWindow, onTop: boolean): void {
  if (win.isDestroyed()) return
  if (!onTop) return win.setAlwaysOnTop(false)
  win.setAlwaysOnTop(true, process.platform === 'win32' ? 'screen-saver' : 'floating')
  if (process.platform === 'win32') win.moveTop()
}
