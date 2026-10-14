// Один preload на оба окна (в sandbox preload не может подключать общие чанки сборки).
// Каждое окно получает только свой API; main дополнительно проверяет отправителя каждого IPC.

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type BubbleApi, type PetApi, type SettingsApi } from '../shared/ipc'

function subscribe<T>(channel: string, listener: (value: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, value: T): void => listener(value)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const petApi: PetApi = {
  init: () => ipcRenderer.invoke(IPC.petInit),
  setInteractive: (interactive) => ipcRenderer.send(IPC.petInteractive, interactive === true),
  dragStart: () => ipcRenderer.send(IPC.petDragStart),
  dragEnd: () => ipcRenderer.send(IPC.petDragEnd),
  click: () => ipcRenderer.send(IPC.petClick),
  contextMenu: () => ipcRenderer.send(IPC.petContextMenu),
  onConfig: (listener) => subscribe(IPC.petConfig, listener),
  onView: (listener) => subscribe(IPC.petView, listener),
  onLook: (listener) => subscribe(IPC.petLook, listener),
  onPointer: (listener) => subscribe(IPC.petPointer, listener)
}

const settingsApi: SettingsApi = {
  getState: () => ipcRenderer.invoke(IPC.settingsGetState),
  update: (patch) => ipcRenderer.invoke(IPC.settingsUpdate, patch),
  selectCharacter: (id) => ipcRenderer.invoke(IPC.settingsSelect, id),
  petAction: (action) => ipcRenderer.invoke(IPC.settingsPetAction, action),
  onState: (listener) => subscribe(IPC.settingsState, listener)
}

const bubbleApi: BubbleApi = {
  onShow: (listener) => subscribe(IPC.bubbleShow, listener),
  onHide: (listener) => subscribe(IPC.bubbleHide, () => listener())
}

const page = (globalThis as { location?: { pathname: string } }).location?.pathname ?? ''

if (page.endsWith('/settings.html')) {
  contextBridge.exposeInMainWorld('settingsApi', settingsApi)
} else if (page.endsWith('/pet.html')) {
  contextBridge.exposeInMainWorld('petApi', petApi)
} else if (page.endsWith('/bubble.html')) {
  contextBridge.exposeInMainWorld('bubbleApi', bubbleApi)
}
