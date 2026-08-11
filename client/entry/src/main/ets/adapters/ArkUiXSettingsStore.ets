import preferences from '@ohos.data.preferences'
import common from '@ohos.app.ability.common'
import { SettingsStore } from '../services/SettingsStore'

export class ArkUiXSettingsStore implements SettingsStore {
  private context: common.UIAbilityContext
  private storeName: string

  constructor(context: common.UIAbilityContext, storeName: string = 'ziyoufang.settings') {
    this.context = context
    this.storeName = storeName
  }

  async getString(key: string, fallback: string): Promise<string> {
    try {
      const store = await preferences.getPreferences(this.context, this.storeName)
      const value = await store.get(key, fallback)
      return value as string
    } catch (error) {
      throw new Error(`SETTINGS_READ_FAILED: ${error}`)
    }
  }

  async putString(key: string, value: string): Promise<void> {
    try {
      const store = await preferences.getPreferences(this.context, this.storeName)
      await store.put(key, value)
      await store.flush()
    } catch (error) {
      throw new Error(`SETTINGS_WRITE_FAILED: ${error}`)
    }
  }

  async getBoolean(key: string, fallback: boolean): Promise<boolean> {
    try {
      const store = await preferences.getPreferences(this.context, this.storeName)
      const value = await store.get(key, fallback)
      return value as boolean
    } catch (error) {
      throw new Error(`SETTINGS_READ_FAILED: ${error}`)
    }
  }

  async putBoolean(key: string, value: boolean): Promise<void> {
    try {
      const store = await preferences.getPreferences(this.context, this.storeName)
      await store.put(key, value)
      await store.flush()
    } catch (error) {
      throw new Error(`SETTINGS_WRITE_FAILED: ${error}`)
    }
  }

  async remove(key: string): Promise<void> {
    try {
      const store = await preferences.getPreferences(this.context, this.storeName)
      await store.delete(key)
      await store.flush()
    } catch (error) {
      throw new Error(`SETTINGS_DELETE_FAILED: ${error}`)
    }
  }
}
