// Окно-облачко с репликой. Прозрачное, без фокуса, полностью пропускает клики мыши.
// Создаётся один раз и просто скрывается между репликами.

import { BrowserWindow } from 'electron'
import { bubbleDuration } from '../shared/chatter'
import { bubblePlacement } from '../shared/geometry'
import { IPC, type BubbleMessage } from '../shared/ipc'
import type { BubbleStyle, Rect } from '../shared/types'
import { keepOnTop, loadPage, paths, raiseOnTop, secureWebPreferences } from './env'

const SIZE = { width: 300, height: 170 }
const FADE_MS = 220

export interface BubbleAnchor {
  centerX: number
  top: number
  bottom: number
  area: Rect
}

export class BubbleWindow {
  private win: BrowserWindow | null = null
  private ready: Promise<void> | null = null
  private hideTimer: NodeJS.Timeout | null = null
  private visible = false
  private lastText = ''
  private lastPlacement = ''

  constructor(
    private readonly anchor: () => BubbleAnchor | null,
    private readonly look: () => { style: BubbleStyle; onTop: boolean }
  ) {}

  private ensure(): Promise<void> {
    if (this.win && !this.win.isDestroyed() && this.ready) return this.ready
    const win = new BrowserWindow({
      ...SIZE,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: false,
      alwaysOnTop: this.look().onTop,
      focusable: false,
      useContentSize: true,
      title: 'Ember',
      webPreferences: secureWebPreferences(paths.preload())
    })
    win.setIgnoreMouseEvents(true)
    keepOnTop(win, () => this.look().onTop)
    if (process.platform === 'darwin') win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false })
    win.on('closed', () => {
      this.win = null
      this.ready = null
    })
    this.win = win
    this.ready = loadPage(win, 'bubble').catch((error) => console.error('Облачко не загрузилось', error))
    return this.ready
  }

  get isShowing(): boolean {
    return this.visible
  }

  async say(text: string): Promise<void> {
    await this.ensure()
    const win = this.win
    const placement = this.place()
    if (!win || !placement) return
    this.lastText = text
    this.lastPlacement = `${placement.placement}:${placement.tailOffset}`
    const message: BubbleMessage = { text, placement: placement.placement, tailOffset: placement.tailOffset, style: this.look().style }
    win.webContents.send(IPC.bubbleShow, message)
    if (!win.isVisible()) win.showInactive()
    raiseOnTop(win, this.look().onTop)
    this.visible = true
    if (this.hideTimer) clearTimeout(this.hideTimer)
    this.hideTimer = setTimeout(() => this.hide(), bubbleDuration(text))
  }

  hide(): void {
    if (this.hideTimer) clearTimeout(this.hideTimer)
    this.hideTimer = null
    if (!this.visible || !this.win || this.win.isDestroyed()) return
    this.visible = false
    this.win.webContents.send(IPC.bubbleHide)
    const win = this.win
    setTimeout(() => {
      if (!this.visible && !win.isDestroyed()) win.hide()
    }, FADE_MS)
  }

  /** Вызывается при каждом перемещении питомца, чтобы облачко ехало вместе с ним. */
  follow(): void {
    if (!this.visible || !this.win || this.win.isDestroyed()) return
    const placement = this.place()
    if (!placement) return
    // Если облачко «перепрыгнуло» над/под питомцем или упёрлось в край — перерисовываем хвостик.
    const key = `${placement.placement}:${placement.tailOffset}`
    if (key === this.lastPlacement) return
    this.lastPlacement = key
    this.win.webContents.send(IPC.bubbleShow, {
      text: this.lastText,
      placement: placement.placement,
      tailOffset: placement.tailOffset,
      style: this.look().style
    } satisfies BubbleMessage)
  }

  private place(): ReturnType<typeof bubblePlacement> | null {
    const anchor = this.anchor()
    if (!anchor || !this.win || this.win.isDestroyed()) return null
    const placement = bubblePlacement(anchor, SIZE, anchor.area)
    this.win.setBounds({ x: placement.x, y: placement.y, ...SIZE })
    return placement
  }

  /** Настройки облачка поменялись: «поверх всех» и цвет — сразу, у уже показанной реплики тоже. */
  applyLook(): void {
    if (!this.win || this.win.isDestroyed()) return
    raiseOnTop(this.win, this.look().onTop)
    if (this.visible) {
      this.lastPlacement = ''
      this.follow()
    }
  }

  destroy(): void {
    if (this.hideTimer) clearTimeout(this.hideTimer)
    if (this.win && !this.win.isDestroyed()) this.win.destroy()
    this.win = null
  }
}
