import { StateSyncModule } from '@renderer-shared/akari-ipc/state-sync-module'

import { useRespawnTimerStore } from './store'

export class RespawnTimerRendererModule extends StateSyncModule {
  constructor() {
    super('respawn-timer')
  }

  override async setup() {
    await super.setup()

    this._syncMainState()
  }

  private _syncMainState() {
    const store = useRespawnTimerStore()

    this.getterSync('settings/enabled', (s) => (store.settings.enabled = s))

    this.dotPropSync(store, this.id, 'isDead')
    this.dotPropSync(store, this.id, 'timeLeft')
    this.dotPropSync(store, this.id, 'totalTime')
  }

  setEnabled(value: boolean) {
    return this.call('set-setting/enabled', value)
  }
}

export const respawnTimerRendererModule = new RespawnTimerRendererModule()
