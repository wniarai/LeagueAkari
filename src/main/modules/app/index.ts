import { optimizer } from '@electron-toolkit/utils'
import {
  MobxBasedBasicModule,
  RegisteredSettingHandler
} from '@main/akari-ipc/mobx-based-basic-module'
import { Paths } from '@shared/utils/types'
import { AxiosRequestConfig } from 'axios'
import { BrowserWindow, app, protocol, session, shell } from 'electron'
import { set } from 'lodash'
import { makeAutoObservable, observable, runInAction } from 'mobx'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'

import toolkit from '../../native/laToolkitWin32x64.node'
import { AutoGameflowModule } from '../auto-gameflow'
import { AutoReplyModule } from '../auto-reply'
import { AutoSelectModule } from '../auto-select'
import { AutoUpdateModule } from '../auto-update'
import { AuxWindowModule } from '../auxiliary-window'
import { CoreFunctionalityModule } from '../core-functionality'
import { LcuConnectionModule } from '../lcu-connection'
import { AppLogger, LogModule } from '../log'
import { MainWindowModule } from '../main-window'
import { RespawnTimerModule } from '../respawn-timer'
import { AppSettings } from './state'

export class AppState {
  settings = new AppSettings()

  isAdministrator: boolean = false
  ready: boolean = false
  isQuitting = false

  baseConfig: Record<string, any> | null = null

  constructor() {
    makeAutoObservable(this, {
      baseConfig: observable.ref
    })
  }

  setElevated(b: boolean) {
    this.isAdministrator = b
  }

  setReady(b: boolean) {
    this.ready = b
  }

  setQuitting(b: boolean) {
    this.isQuitting = b
  }

  setBaseConfig(config: Record<string, any> | null) {
    this.baseConfig = config
  }
}

export class AppModule extends MobxBasedBasicModule {
  public state = new AppState()

  private _logModule: LogModule
  private _logger: AppLogger
  private _rLogger: AppLogger
  private _afgm: AutoGameflowModule
  private _arm: AutoReplyModule
  private _cfm: CoreFunctionalityModule
  private _asm: AutoSelectModule
  private _rtm: RespawnTimerModule
  private _lcm: LcuConnectionModule
  private _aum: AutoUpdateModule

  private _quitTasks: (() => Promise<void> | void)[] = []

  static AKARI_PROTOCOL = 'akari'

  constructor() {
    super('app')
  }

  override async setup() {
    await super.setup()

    this._logModule = this.manager.getModule<LogModule>('log')
    this._logger = this._logModule.createLogger('app')
    this._rLogger = this._logModule.createLogger('renderer')
    this._afgm = this.manager.getModule<AutoGameflowModule>('auto-gameflow')
    this._arm = this.manager.getModule<AutoReplyModule>('auto-reply')
    this._cfm = this.manager.getModule<CoreFunctionalityModule>('core-functionality')
    this._asm = this.manager.getModule<AutoSelectModule>('auto-select')
    this._rtm = this.manager.getModule<RespawnTimerModule>('respawn-timer')
    this._lcm = this.manager.getModule<LcuConnectionModule>('lcu-connection')
    this._aum = this.manager.getModule<AutoUpdateModule>('auto-update')

    await this._setupSettings()
    this._setupAkariProtocol()
    this._setupMethodCall()
    this._setupStateSync()
    await this._initializeApp()

    await this._migrateSettingsToDotProps()

    this._logger.info('初始化完成')
  }

  /**
   * 应用退出时，执行的后续步骤列表
   * @param fn 方法
   */
  addQuitTask(fn: () => Promise<void> | void) {
    this._quitTasks.push(fn)
  }

  removeQuitTask(fn: () => Promise<void> | void) {
    const index = this._quitTasks.indexOf(fn)
    if (index !== -1) {
      this._quitTasks.splice(index, 1)
    }
  }

  private async _initializeApp() {
    this.state.setElevated(toolkit.isElevated())

    app.on('before-quit', async (e) => {
      if (this._quitTasks.length) {
        e.preventDefault()

        this.state.setQuitting(true)

        while (this._quitTasks.length) {
          const fn = this._quitTasks.shift()
          try {
            await fn!()
          } catch {}
        }

        app.quit()
      }
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        const mw = this.manager.getModule<MainWindowModule>('main-window')
        mw.createWindow()
      }
    })

    app.on('second-instance', (_event, commandLine, workingDirectory) => {
      this._logger.info(`用户尝试启动第二个实例, cmd=${commandLine}, pwd=${workingDirectory}`)

      const mw = this.manager.getModule<MainWindowModule>('main-window')
      mw.restoreAndFocus()

      this.sendEvent('second-instance', commandLine, workingDirectory)
    })

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit()
      }
    })

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })
  }

  private _setupStateSync() {
    this.propSync('state', this.state, [
      'isAdministrator',
      'baseConfig',
      'settings.closeStrategy',
      'settings.disableHardwareAcceleration',
      'settings.isInKyokoMode',
      'settings.showFreeSoftwareDeclaration',
      'settings.useWmic'
    ])
  }

  private _setupMethodCall() {
    this.onCall('get-app-version', () => app.getVersion())

    this.onCall('migrate-settings-from-legacy-version', async (all: Record<string, string>) => {
      return await this._migrateSettingsFromLegacyVersion(all)
    })

    this.onCall('open-in-explorer/user-data', () => {
      return shell.openPath(app.getPath('userData'))
    })

    this.onCall('open-in-explorer/logs', () => {
      return this._logModule.openLogDir()
    })

    this.onCall('base-config/disable-hardware-acceleration', (b: boolean) => {
      const config = this.state.baseConfig || {}
      config.disableHardwareAcceleration = b
      this.writeBaseConfig(config)
      app.relaunch()
      app.exit()
    })

    // details 为字符串，已经在渲染进程被序列化了
    this.onCall('renderer-log', (level: string, message: string, details?: string) => {
      switch (level) {
        case 'info':
          this._rLogger.info(`${message} ${details ? details : ''}`)
          break
        case 'warn':
          this._rLogger.warn(`${message} ${details ? details : ''}`)
          break
        case 'error':
          this._rLogger.error(`${message} ${details ? details : ''}`)
          break
        case 'debug':
          this._rLogger.debug(`${message} ${details ? details : ''}`)
          break
      }
    })
  }

  private async _setupSettings() {
    this.registerSettings([
      {
        key: 'showFreeSoftwareDeclaration',
        defaultValue: this.state.settings.showFreeSoftwareDeclaration
      },
      {
        key: 'closeStrategy',
        defaultValue: this.state.settings.closeStrategy
      },
      {
        key: 'useWmic',
        defaultValue: this.state.settings.useWmic
      },
      {
        key: 'isInKyokoMode',
        defaultValue: this.state.settings.isInKyokoMode
      }
    ])

    const settings = await this.readSettings()
    runInAction(() => {
      settings.forEach((s) => set(this.state.settings, s.settingItem, s.value))
    })

    const defaultSetter: RegisteredSettingHandler = async (key, value, apply) => {
      runInAction(() => set(this.state.settings, key, value))
      await apply(key, value)
    }

    this.onSettingChange<Paths<typeof this.state.settings>>(
      'showFreeSoftwareDeclaration',
      defaultSetter
    )
    this.onSettingChange<Paths<typeof this.state.settings>>('closeStrategy', defaultSetter)
    this.onSettingChange<Paths<typeof this.state.settings>>('useWmic', defaultSetter)
    this.onSettingChange<Paths<typeof this.state.settings>>('isInKyokoMode', defaultSetter)
  }

  private _setupAkariProtocol() {
    this._handlePartitionAkariProtocol(MainWindowModule.PARTITION)
    this._handlePartitionAkariProtocol(AuxWindowModule.PARTITION)
  }

  private _handlePartitionAkariProtocol(partition: string) {
    session.fromPartition(partition).protocol.handle(AppModule.AKARI_PROTOCOL, async (req) => {
      const path = req.url.slice(`${AppModule.AKARI_PROTOCOL}://`.length)
      const index = path.indexOf('/')
      const domain = path.slice(0, index)
      const uri = path.slice(index + 1)

      const reqHeaders: Record<string, string> = {}
      req.headers.forEach((value, key) => {
        reqHeaders[key] = value
      })

      switch (domain) {
        case 'lcu':
        case 'rc':
          try {
            const config: AxiosRequestConfig = {
              method: req.method,
              url: uri,
              data: req.body ? this._convertWebStreamToNodeStream(req.body) : undefined,
              validateStatus: () => true,
              responseType: 'stream',
              headers: reqHeaders
            }

            const res =
              domain === 'lcu'
                ? await this._lcm.lcuRequest(config)
                : await this._lcm.rcRequest(config)

            const resHeaders = Object.fromEntries(
              Object.entries(res.headers).filter(([_, value]) => typeof value === 'string')
            )

            return new Response(res.status === 204 || res.status === 304 ? null : res.data, {
              statusText: res.statusText,
              headers: resHeaders,
              status: res.status
            })
          } catch (error) {
            console.error(error)
            return new Response((error as Error).message, {
              headers: { 'Content-Type': 'text/plain' },
              status: 500
            })
          }
        default:
          return new Response(`Unknown akari zone: ${domain}`, {
            statusText: 'Not Found',
            headers: {
              'Content-Type': 'text/plain'
            },
            status: 404
          })
      }
    })
  }

  private _convertWebStreamToNodeStream(readableStream: ReadableStream) {
    const reader = readableStream.getReader()

    const nodeStream = Readable.from({
      async *[Symbol.asyncIterator]() {
        while (true) {
          try {
            const { done, value } = await reader.read()
            if (done) break
            yield value
          } catch {
            break
          }
        }
      }
    })

    return nodeStream
  }

  registerAkariProtocolAsPrivileged() {
    protocol.registerSchemesAsPrivileged([
      {
        scheme: AppModule.AKARI_PROTOCOL,
        privileges: {
          standard: true,
          secure: true,
          supportFetchAPI: true,
          corsEnabled: true,
          stream: true,
          bypassCSP: true
        }
      }
    ])
  }

  readBaseConfig() {
    const path = join(app.getPath('userData'), 'base-config.json')

    if (!existsSync(path)) {
      return null
    }

    try {
      const jsonFile = readFileSync(path, 'utf-8')
      const config = JSON.parse(jsonFile)

      if (typeof config !== 'object') {
        return null
      }

      this.state.setBaseConfig(config)
      return config
    } catch (error) {
      return null
    }
  }

  writeBaseConfig(config: Record<string, any>) {
    const path = join(app.getPath('userData'), 'base-config.json')
    const json = JSON.stringify(config)
    writeFileSync(path, json, 'utf-8')
  }

  // from v1.1.x -> v1.2.x
  private async _migrateSettingsFromLegacyVersion(all: Record<string, string>) {
    let migrated = false
    const _toNewSettings = async (
      originKey: string,
      resName: string,
      setter: (state: any) => any
    ) => {
      const originValue = all[originKey]
      if (originValue !== undefined) {
        try {
          const jsonValue = JSON.parse(originValue)
          await this._sm.settings.set(resName, jsonValue)
          runInAction(() => setter(jsonValue))
          migrated = true
        } catch {}
      }
    }

    await _toNewSettings(
      'app.autoConnect',
      'lcu-connection/auto-connect',
      (s) => (this._lcm.state.settings.autoConnect = s)
    )
    await _toNewSettings(
      'app.autoCheckUpdates',
      'auto-update/auto-check-updates',
      (s) => (this._aum.state.settings.autoCheckUpdates = s)
    )
    await _toNewSettings(
      'app.showFreeSoftwareDeclaration',
      'app/show-free-software-declaration',
      (s) => (this.state.settings.showFreeSoftwareDeclaration = s)
    )
    await _toNewSettings(
      'autoAccept.enabled',
      'auto-gameflow/auto-accept-enabled',
      (s) => (this._afgm.state.settings.autoAcceptEnabled = s)
    )
    await _toNewSettings(
      'autoAccept.delaySeconds',
      'auto-gameflow/auto-accept-delay-seconds',
      (s) => (this._afgm.state.settings.autoAcceptDelaySeconds = s)
    )
    await _toNewSettings(
      'autoHonor.enabled',
      'auto-gameflow/auto-honor-enabled',
      (s) => (this._afgm.state.settings.autoHonorEnabled = s)
    )
    await _toNewSettings(
      'autoHonor.strategy',
      'auto-gameflow/auto-honor-strategy',
      (s) => (this._afgm.state.settings.autoHonorStrategy = s)
    )
    await _toNewSettings(
      'autoReply.enabled',
      'auto-reply/enabled',
      (s) => (this._arm.state.settings.enabled = s)
    )
    await _toNewSettings(
      'autoReply.enableOnAway',
      'auto-reply/enable-on-away',
      (s) => (this._arm.state.settings.enableOnAway = s)
    )
    await _toNewSettings(
      'autoReply.text',
      'auto-reply/text',
      (s) => (this._arm.state.settings.text = s)
    )
    await _toNewSettings(
      'autoSelect.normalModeEnabled',
      'auto-select/normal-mode-enabled',
      (s) => (this._asm.state.settings.normalModeEnabled = s)
    )
    await _toNewSettings(
      'autoSelect.benchModeEnabled',
      'auto-select/bench-mode-enabled',
      (s) => (this._asm.state.settings.benchModeEnabled = s)
    )
    await _toNewSettings(
      'autoSelect.benchExpectedChampions',
      'auto-select/bench-expected-champions',
      (s) => (this._asm.state.settings.benchExpectedChampions = s)
    )
    await _toNewSettings(
      'autoSelect.expectedChampions',
      'auto-select/expected-champions-multi',
      (s) =>
        (this._asm.state.settings.expectedChampions = {
          top: [],
          jungle: [],
          middle: [],
          bottom: [],
          utility: [],
          default: s
        })
    )
    await _toNewSettings(
      'autoSelect.bannedChampions',
      'auto-select/banned-champions-multi',
      (s) =>
        (this._asm.state.settings.bannedChampions = {
          top: [],
          jungle: [],
          middle: [],
          bottom: [],
          utility: [],
          default: s
        })
    )
    await _toNewSettings(
      'autoSelect.banEnabled',
      'auto-select/ban-enabled',
      (s) => (this._asm.state.settings.banEnabled = s)
    )
    await _toNewSettings(
      'autoSelect.completed',
      'auto-select/completed',
      (s) => (this._asm.state.settings.completed = s)
    )
    await _toNewSettings(
      'autoSelect.grabDelay',
      'auto-select/grab-delay-seconds',
      (s) => (this._asm.state.settings.grabDelaySeconds = s)
    )
    await _toNewSettings(
      'autoSelect.banTeammateIntendedChampion',
      'auto-select/ban-teammate-intended-champion',
      (s) => (this._asm.state.settings.banTeammateIntendedChampion = s)
    )
    await _toNewSettings(
      'autoSelect.selectTeammateIntendedChampion',
      'auto-select/select-teammate-intended-champion',
      (s) => (this._asm.state.settings.selectTeammateIntendedChampion = s)
    )
    await _toNewSettings(
      'autoSelect.showIntent',
      'auto-select/show-intent',
      (s) => (this._asm.state.settings.showIntent = s)
    )
    await _toNewSettings(
      'matchHistory.fetchAfterGame',
      'core-functionality/fetch-after-game',
      (s) => (this._cfm.state.settings.fetchAfterGame = s)
    )
    await _toNewSettings(
      'matchHistory.autoRouteOnGameStart',
      'core-functionality/auto-route-on-game-start',
      (s) => (this._cfm.state.settings.autoRouteOnGameStart = s)
    )
    await _toNewSettings(
      'matchHistory.preMadeTeamThreshold',
      'core-functionality/pre-made-team-threshold',
      (s) => (this._cfm.state.settings.preMadeTeamThreshold = s)
    )
    await _toNewSettings(
      'matchHistory.matchHistoryLoadCount',
      'core-functionality/match-history-load-count',
      (s) => (this._cfm.state.settings.matchHistoryLoadCount = s)
    )
    await _toNewSettings(
      'matchHistory.fetchDetailedGame',
      'core-functionality/fetch-detailed-game',
      (s) => (this._cfm.state.settings.fetchDetailedGame = s)
    )
    await _toNewSettings(
      'matchHistory.sendKdaInGame',
      'core-functionality/send-kda-in-game',
      (s) => (this._cfm.state.settings.sendKdaInGame = s)
    )
    await _toNewSettings(
      'matchHistory.sendKdaThreshold',
      'core-functionality/send-kda-threshold',
      (s) => (this._cfm.state.settings.sendKdaThreshold = s)
    )
    await _toNewSettings(
      'matchHistory.sendKdaInGameWithPreMadeTeams',
      'core-functionality/send-kda-in-game-with-pre-made-teams',
      (s) => (this._cfm.state.settings.sendKdaInGameWithPreMadeTeams = s)
    )
    await _toNewSettings(
      'respawnTimer.enabled',
      'respawn-timer/enabled',
      (s) => (this._rtm.state.settings.enabled = s)
    )

    if (migrated) {
      this._logger.info('旧设置项已经成功迁移')
      return true
    }

    return false
  }

  // from v1.2.x -> v1.2.5
  private async _migrateSettingsToDotProps() {
    const isInPropsStage = await this._sm.settings.get('akari.inDotPropsStage', false)
    if (isInPropsStage) {
      return
    }
  }
}

export const appModule = new AppModule()
