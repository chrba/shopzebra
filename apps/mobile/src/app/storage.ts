import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

const isNative = Capacitor.isNativePlatform()

export async function getItem(key: string): Promise<string | null> {
  if (isNative) {
    const result = await Preferences.get({ key })
    return result.value
  }
  return localStorage.getItem(key)
}

export async function setItem(key: string, value: string): Promise<void> {
  if (isNative) {
    await Preferences.set({ key, value })
    return
  }
  localStorage.setItem(key, value)
}

export async function removeItem(key: string): Promise<void> {
  if (isNative) {
    await Preferences.remove({ key })
    return
  }
  localStorage.removeItem(key)
}
