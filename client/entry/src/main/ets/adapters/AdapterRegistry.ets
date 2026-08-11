import { AssessmentClient } from '../services/AssessmentClient'
import { CaptureService } from '../services/CaptureService'
import { LocalMediaStore } from '../services/LocalMediaStore'
import { PracticeRepository } from '../services/PracticeRepository'
import { SettingsStore } from '../services/SettingsStore'

export class AdapterRegistry {
  captureService?: CaptureService
  localMediaStore?: LocalMediaStore
  assessmentClient?: AssessmentClient
  practiceRepository?: PracticeRepository
  settingsStore?: SettingsStore

  isReady(): boolean {
    return this.captureService !== undefined &&
      this.localMediaStore !== undefined &&
      this.assessmentClient !== undefined &&
      this.practiceRepository !== undefined &&
      this.settingsStore !== undefined
  }
}

export const adapterRegistry: AdapterRegistry = new AdapterRegistry()
