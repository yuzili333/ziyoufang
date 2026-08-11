export interface LocalMediaStore {
  save(sourceUri: string, localTaskId: string): Promise<string>
  exists(uri: string): Promise<boolean>
  delete(uri: string): Promise<void>
  availableBytes(): Promise<number>
  clearTransientCache(): Promise<void>
}
