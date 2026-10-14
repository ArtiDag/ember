// Точка входа main-процесса: один экземпляр, трей, окно питомца, окно настроек, IPC.

import { BrowserWindow, Menu, app, dialog, ipcMain, nativeTheme, screen, session, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { detectLang, setLang, setMac, tr } from '../shared/i18n'
import { IPC } from '../shared/ipc'
import { DEFAULT_CHARACTER_ID, sanitizePatch } from '../shared/settings'
import type { AppState, CharacterSummary, DisplayInfo, PetAction, Result } from '../shared/types'
import { loadPage, paths, secureWebPreferences } from './env'
import { CharacterLibrary } from './library'
import { AudioMonitor } from './audioMonitor'
import { BubbleWindow } from './bubbleWindow'
import { ChatterController } from './chatter'
import { buildMenu, createTray, type MenuActions } from './menus'
import { PetController } from './petController'
import { handleAssets, registerAssetScheme } from './protocol'
import { ImportError } from './safePath'
import { SettingsStore } from './store'

registerAssetScheme()

// Режим разработки — отдельная папка данных: можно запускать рядом с установленным приложением,
// не трогая его настройки и библиотеку (и без конфликта «один экземпляр»).
if (!app.isPackaged) app.setPath('userData', join(app.getPath('appData'), 'Ember (dev)'))
migrateUserData()

/** Приложение переименовано (Desktop Pet → Ember): настройки переносятся один раз. */
function migrateUserData(): void {
  const target = app.getPath('userData')
  const old = join(app.getPath('appData'), app.isPackaged ? 'Desktop Pet' : 'Desktop Pet (dev)')
  if (existsSync(join(target, 'settings.json')) || !existsSync(join(old, 'settings.json'))) return
  try {
    mkdirSync(target, { recursive: true })
    for (const name of ['settings.json', 'chatter.json']) {
      if (existsSync(join(old, name))) cpSync(join(old, name), join(target, name), { recursive: true })
    }
  } catch (error) {
    console.warn('Не удалось перенести данные из старой папки', error)
  }
}

let store: SettingsStore
let library: CharacterLibrary
let pet: PetController
let bubble: BubbleWindow
let chatter: ChatterController
let audio: AudioMonitor | null = null

/** Звук отслеживается, только когда питомец виден, опция включена и у персонажа есть «музыка». */
function updateAudio(): void {
  if (!audio || !pet) return
  const need = store.settings.visible && store.settings.reactToMusic && pet.canListen
  if (need && !audio.running) audio.start()
  else if (!need && audio.running) audio.stop()
}
let settingsWindow: BrowserWindow | null = null
let refreshTray: () => void = () => {}
let quitting = false

function errorText(error: unknown): string {
  if (error instanceof ImportError) return error.message
  console.error(error)
  return tr('Непредвиденная ошибка. Подробности — в консоли приложения.', 'Unexpected error. Details are in the app console.', '发生意外错误。详情请查看应用控制台。')
}

async function result<T>(work: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await work() }
  } catch (error) {
    return { ok: false, error: errorText(error) }
  }
}

function pickCharacter(): CharacterSummary {
  const all = library.list()
  const character = library.get(store.settings.activeCharacterId) ?? library.get(DEFAULT_CHARACTER_ID)
  if (character) return character.summary
  if (all.length === 0) throw new Error('No characters found. Run npm run generate:characters.')
  return all[0]
}

function displays(): DisplayInfo[] {
  const primary = screen.getPrimaryDisplay().id
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    label: d.label || `${tr('Монитор', 'Display', '显示器')} ${i + 1}`,
    primary: d.id === primary,
    workArea: d.workArea,
    scaleFactor: d.scaleFactor
  }))
}

function appState(): AppState {
  return {
    settings: store.settings,
    characters: library.list(),
    displays: displays(),
    platform: process.platform,
    installed: app.isPackaged
  }
}

let broadcastQueued = false
function broadcast(): void {
  if (broadcastQueued) return
  broadcastQueued = true
  queueMicrotask(() => {
    broadcastQueued = false
    refreshTray()
    chatter?.update()
    updateAudio()
    if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.webContents.send(IPC.settingsState, appState())
  })
}

function updateSettings(patch: Parameters<SettingsStore['update']>[0]): void {
  const previous = store.settings
  store.update(patch)
  pet.applySettings(previous)
  if (store.settings.launchAtLogin !== previous.launchAtLogin) applyLaunchAtLogin()
  if (store.settings.theme !== previous.theme) nativeTheme.themeSource = store.settings.theme
  if (store.settings.bubbleStyle !== previous.bubbleStyle || store.settings.alwaysOnTop !== previous.alwaysOnTop) bubble?.applyLook()
  if (store.settings.language !== previous.language) {
    setLang(store.settings.language)
    if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.setTitle(settingsTitle())
  }
  broadcast()
}

/** Автозапуск при входе в систему. В режиме разработки не трогаем (там запускается Electron, а не приложение). */
function applyLaunchAtLogin(): void {
  if (!app.isPackaged || (process.platform !== 'darwin' && process.platform !== 'win32')) return
  app.setLoginItemSettings({ openAtLogin: store.settings.launchAtLogin })
}

function petAction(action: PetAction): void {
  switch (action) {
    case 'show':
      pet.show()
      break
    case 'hide':
      pet.hide()
      break
    case 'toggle-visible':
      pet.toggleVisible()
      break
    case 'toggle-pause':
      updateSettings({ paused: !store.settings.paused })
      break
    case 'recenter':
      pet.recenter()
      break
    case 'say':
      chatter.sayNow()
      break
  }
  broadcast()
}

const menuActions: MenuActions = {
  openSettings: () => openSettings(),
  toggleVisible: () => petAction('toggle-visible'),
  togglePause: () => petAction('toggle-pause'),
  toggleWalking: () => updateSettings({ walking: !store.settings.walking }),
  recenter: () => petAction('recenter'),
  say: () => petAction('say'),
  acts: () => pet.idleActs,
  act: (name) => pet.act(name),
  quit: () => app.quit(),
  state: () => ({ visible: store.settings.visible, paused: store.settings.paused, walking: store.settings.walking })
}

const settingsTitle = (): string => tr('Ember — настройки', 'Ember — Settings', 'Ember — 设置')

function openSettings(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    if (settingsWindow.isMinimized()) settingsWindow.restore()
    settingsWindow.show()
    settingsWindow.focus()
    return
  }
  const win = new BrowserWindow({
    width: 940,
    height: 720,
    minWidth: 720,
    minHeight: 560,
    show: false,
    title: settingsTitle(),
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0e0e0f' : '#f5f5f4',
    webPreferences: secureWebPreferences(paths.preload())
  })
  settingsWindow = win
  if (process.platform === 'darwin') void app.dock?.show()
  win.once('ready-to-show', () => win.show())
  win.on('closed', () => {
    settingsWindow = null
    if (process.platform === 'darwin') app.dock?.hide()
  })
  void loadPage(win, 'settings')
}

// ---------- IPC ----------

function fromPet(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  return event.sender.id === pet.webContentsId && event.senderFrame === event.sender.mainFrame
}

function fromSettings(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  return (
    !!settingsWindow &&
    !settingsWindow.isDestroyed() &&
    event.sender.id === settingsWindow.webContents.id &&
    event.senderFrame === event.sender.mainFrame
  )
}

function onPet(channel: string, handler: (arg: unknown) => void): void {
  ipcMain.on(channel, (event, arg) => {
    if (fromPet(event)) handler(arg)
  })
}

function handleSettings(channel: string, handler: (...args: unknown[]) => unknown): void {
  ipcMain.handle(channel, (event, ...args) => {
    if (!fromSettings(event)) throw new Error('Request rejected')
    return handler(...args)
  })
}

function registerIpc(): void {
  ipcMain.handle(IPC.petInit, (event) => {
    if (!fromPet(event)) throw new Error('Request rejected')
    return { config: pet.config(), view: pet.view(), look: pet.currentLook() }
  })
  onPet(IPC.petInteractive, (arg) => pet.setInteractive(arg === true))
  onPet(IPC.petDragStart, () => pet.dragStart())
  onPet(IPC.petDragEnd, () => pet.dragEnd())
  onPet(IPC.petClick, () => pet.click())
  onPet(IPC.petContextMenu, () => buildMenu(menuActions).popup())

  handleSettings(IPC.settingsGetState, () => appState())
  handleSettings(IPC.settingsUpdate, (patch) => {
    updateSettings(sanitizePatch(patch, store.settings))
  })
  handleSettings(IPC.settingsSelect, (id) =>
    result(async () => {
      const entry = typeof id === 'string' ? library.get(id) : undefined
      if (!entry) throw new ImportError(tr('Персонаж не найден', 'Character not found', '找不到角色'))
      store.update({ activeCharacterId: entry.summary.id })
      pet.setCharacter(entry.summary)
      broadcast() // заодно включит/выключит отслеживание звука под нового персонажа
    })
  )
  handleSettings(IPC.settingsPetAction, (action) => {
    const allowed: PetAction[] = ['show', 'hide', 'toggle-visible', 'toggle-pause', 'recenter', 'say']
    if (allowed.includes(action as PetAction)) petAction(action as PetAction)
  })
}

// ---------- безопасность ----------

function hardenWebContents(): void {
  app.on('web-contents-created', (_event, contents) => {
    // Запрещён переход на любые другие страницы; перезагрузка той же страницы разрешена
    // (её делает режим разработки после правок кода).
    contents.on('will-navigate', (event, url) => {
      if (url !== contents.getURL()) event.preventDefault()
    })
    contents.on('will-attach-webview', (event) => event.preventDefault())
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  })
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  session.defaultSession.setPermissionCheckHandler(() => false)
}

function applicationMenu(): void {
  if (process.platform === 'darwin') {
    // Минимальное меню: нужно для Cmd+C / Cmd+V / Cmd+W в окне настроек.
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }])
    )
  } else {
    Menu.setApplicationMenu(null)
  }
}

// ---------- запуск ----------

async function start(): Promise<void> {
  hardenWebContents()
  applicationMenu()
  if (process.platform === 'darwin') app.dock?.hide()

  store = SettingsStore.load(paths.settingsFile(), detectLang(app.getLocale()))
  setLang(store.settings.language)
  setMac(process.platform === 'darwin')
  library = new CharacterLibrary(paths.builtinCharacters())
  await library.refresh()
  handleAssets(library)

  const character = pickCharacter()
  if (character.id !== store.settings.activeCharacterId) store.update({ activeCharacterId: character.id })
  applyLaunchAtLogin()
  nativeTheme.themeSource = store.settings.theme
  const firstRun = store.settings.position === null
  pet = new PetController(store, character, broadcast)
  bubble = new BubbleWindow(
    () => pet.anchor(),
    () => ({ style: store.settings.bubbleStyle, onTop: store.settings.alwaysOnTop })
  )
  chatter = new ChatterController(bubble, () => store.settings, paths.chatterFile(), () => ({
    user: store.settings.addressAs === 'neutral' ? null : store.settings.addressAs,
    pet: library.get(store.settings.activeCharacterId)?.summary.manifest.gender ?? 'm'
  }))
  pet.events = {
    moved: () => bubble.follow(),
    clicked: () => chatter.onClick(),
    dropped: () => chatter.onDrop()
  }
  chatter.hooks = {
    spoke: (ms) => pet.setTalking(ms),
    breakTime: () => pet.react('yawn')
  }
  audio = new AudioMonitor((playing) => {
    pet.setMusic(playing)
    chatter.onMusic(playing)
  })
  registerIpc()
  pet.create()
  chatter.start()

  const tray = createTray(menuActions)
  refreshTray = tray.refresh

  const onDisplays = (): void => {
    pet.ensureOnScreen()
    broadcast()
  }
  screen.on('display-added', onDisplays)
  screen.on('display-removed', onDisplays)
  screen.on('display-metrics-changed', onDisplays)

  // Первый запуск — показываем настройки, чтобы было понятно, где управление.
  if (firstRun) openSettings()
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => openSettings())
  // Приложение живёт в трее: закрытие окон не завершает его.
  app.on('window-all-closed', () => {})
  app.on('activate', () => openSettings())
  app.on('before-quit', () => {
    if (quitting) return
    quitting = true
    store?.flushSync()
    chatter?.stop()
    audio?.stop()
    bubble?.destroy()
    pet?.destroy()
  })
  app.whenReady().then(start).catch((error) => {
    dialog.showErrorBox('Ember', `${tr('Не удалось запустить приложение', 'The app could not start', '应用无法启动')}:\n${(error as Error).message}`)
    app.exit(1)
  })
}
