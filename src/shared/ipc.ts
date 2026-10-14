// Имена IPC-каналов и типы API, которые preload открывает в renderer.

import type { SettingsPatch } from './settings'
import type { AppState, BubbleStyle, PetAction, PetConfig, PetView, Direction, Result } from './types'

export const IPC = {
  petInit: 'pet:init',
  petInteractive: 'pet:set-interactive',
  petDragStart: 'pet:drag-start',
  petDragEnd: 'pet:drag-end',
  petClick: 'pet:click',
  petContextMenu: 'pet:context-menu',
  petConfig: 'pet:config',
  petView: 'pet:view',
  petLook: 'pet:look',
  petPointer: 'pet:pointer',

  bubbleShow: 'bubble:show',
  bubbleHide: 'bubble:hide',

  settingsState: 'settings:state',
  settingsGetState: 'settings:get-state',
  settingsUpdate: 'settings:update',
  settingsSelect: 'settings:select-character',
  settingsPetAction: 'settings:pet-action'
} as const

export type Unsubscribe = () => void

export interface PetApi {
  init(): Promise<{ config: PetConfig; view: PetView; look: Direction }>
  setInteractive(interactive: boolean): void
  dragStart(): void
  dragEnd(): void
  click(): void
  contextMenu(): void
  onConfig(listener: (config: PetConfig) => void): Unsubscribe
  onView(listener: (view: PetView) => void): Unsubscribe
  onLook(listener: (direction: Direction) => void): Unsubscribe
  /** Курсор относительно окна питомца (CSS px) — для персонажей-«кукол». */
  onPointer(listener: (pointer: { x: number; y: number }) => void): Unsubscribe
}

export interface BubbleMessage {
  text: string
  /** Облачко над питомцем (хвостик вниз) или под ним (хвостик вверх). */
  placement: 'above' | 'below'
  /** Горизонтальное смещение хвостика от центра, px — когда облачко прижато к краю экрана. */
  tailOffset: number
  /** Цвет облачка (настройка bubbleStyle). */
  style: BubbleStyle
}

export interface BubbleApi {
  onShow(listener: (message: BubbleMessage) => void): Unsubscribe
  onHide(listener: () => void): Unsubscribe
}

export interface SettingsApi {
  getState(): Promise<AppState>
  update(patch: SettingsPatch): Promise<void>
  selectCharacter(id: string): Promise<Result<void>>
  petAction(action: PetAction): Promise<void>
  onState(listener: (state: AppState) => void): Unsubscribe
}
