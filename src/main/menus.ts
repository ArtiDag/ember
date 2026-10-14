// Трей / строка меню и контекстное меню питомца.

import { Menu, Tray, nativeImage, type MenuItemConstructorOptions } from 'electron'
import { join } from 'node:path'
import { tr } from '../shared/i18n'
import { paths } from './env'

export interface MenuActions {
  openSettings(): void
  toggleVisible(): void
  togglePause(): void
  toggleWalking(): void
  recenter(): void
  say(): void
  /** Редкие «фишки» персонажа (царапать экран, выглянуть из-за края) — запустить сразу. */
  acts(): string[]
  act(name: string): void
  quit(): void
  state(): { visible: boolean; paused: boolean; walking: boolean }
}

const ACT_LABELS: Record<string, () => string> = {
  scratch: () => tr('Поцарапать экран', 'Scratch the screen', '挠挠屏幕'),
  peek: () => tr('Спрятаться и выглянуть', 'Hide and peek', '躲起来再探头'),
  run: () => tr('Пробежаться', 'Go for a run', '跑一圈'),
  sleep: () => tr('Вздремнуть', 'Take a nap', '打个盹')
}

export function buildMenu(actions: MenuActions): Menu {
  const { visible, paused, walking } = actions.state()
  const acts: MenuItemConstructorOptions[] = actions
    .acts()
    .map((name) => ({ label: ACT_LABELS[name]?.() ?? name, click: () => actions.act(name), enabled: visible && !paused }))
  const template: MenuItemConstructorOptions[] = [
    { label: tr('Настройки…', 'Settings…', '设置…'), click: actions.openSettings },
    { type: 'separator' },
    { label: visible ? tr('Скрыть питомца', 'Hide pet', '隐藏宠物') : tr('Показать питомца', 'Show pet', '显示宠物'), click: actions.toggleVisible },
    { label: tr('Пауза', 'Pause', '暂停'), type: 'checkbox', checked: paused, click: actions.togglePause },
    { label: tr('Прогулки', 'Walks', '散步'), type: 'checkbox', checked: walking, click: actions.toggleWalking },
    { label: tr('Вернуть на экран', 'Bring back on screen', '移回屏幕'), click: actions.recenter },
    { label: tr('Сказать что-нибудь', 'Say something', '说点什么'), click: actions.say, enabled: visible },
    ...acts,
    { type: 'separator' },
    { label: tr('Выйти', 'Quit', '退出'), click: actions.quit }
  ]
  return Menu.buildFromTemplate(template)
}

export function createTray(actions: MenuActions): { tray: Tray; refresh(): void } {
  const mac = process.platform === 'darwin'
  // На macOS — шаблонная монохромная иконка (сама подстраивается под тему строки меню).
  const icon = nativeImage.createFromPath(join(paths.icons(), mac ? 'trayTemplate.png' : 'tray.png'))
  if (mac) icon.setTemplateImage(true)
  const tray = new Tray(icon)
  tray.setToolTip('Ember')
  const refresh = (): void => tray.setContextMenu(buildMenu(actions))
  refresh()
  // В Windows левый клик по иконке открывает настройки, правый — меню.
  if (!mac) tray.on('click', actions.openSettings)
  return { tray, refresh }
}
