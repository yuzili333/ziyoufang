export interface SettingsStore {
  getString(key: string, fallback: string): Promise<string>
  putString(key: string, value: string): Promise<void>
  getBoolean(key: string, fallback: boolean): Promise<boolean>
  putBoolean(key: string, value: boolean): Promise<void>
  remove(key: string): Promise<void>
}
