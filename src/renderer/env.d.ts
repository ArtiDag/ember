import type { BubbleApi, PetApi, SettingsApi } from '../shared/ipc'

declare global {
  interface Window {
    petApi: PetApi
    settingsApi: SettingsApi
    bubbleApi: BubbleApi
  }
}

export {}
