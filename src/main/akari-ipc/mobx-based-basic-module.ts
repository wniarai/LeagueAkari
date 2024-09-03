import { SettingService, StorageModule } from '@main/modules/akari-core/storage'
import { Paths } from '@shared/utils/types'
import { get, set } from 'lodash'
import { IReactionOptions, IReactionPublic, reaction, toJS } from 'mobx'

import { LeagueAkariModule } from './akari-module'

/**
 * 对于简单的状态，通常是 ref 或者 structural 状态量
 */
type SimpleStateGetter = () => any

/**
 * 返回值用于接管默认的更新方式，设置为 truthy 将不会自动更新设置
 */
type SimpleStateSetter = (
  value: any,
  s: SettingService
) => boolean | void | undefined | Promise<boolean | void | undefined>

type StateSetter = (
  value: any,
  defaultBehavior: () => void, // 原本提供的默认设置行为
  ss: SettingService
) => void | Promise<boolean>

/**
 * 实现了一些基于 Mobx 的简单状态管理封装，该模块依赖于 `storage` 模块。
 */
export class MobxBasedBasicModule extends LeagueAkariModule {
  protected _disposers = new Set<Function>()
  protected _sm: StorageModule
  protected _ss: SettingService
  protected _settingsToSync: Promise<void>[] = []

  /**
   * an alias for this._sm
   */
  protected get _storageModule() {
    return this._sm
  }

  /**
   * an alias for this._ss
   */
  protected get _settingService() {
    return this._ss
  }

  override async setup() {
    await super.setup()

    try {
      this._sm = this.manager.getModule('storage')
      this._ss = this._sm.settings.with(this.id)
    } catch (error) {
      throw new Error('MobxBasedModule requires StorageModule')
    }
  }

  /**
   * 统一加载设置
   */
  protected async loadSettings() {
    await Promise.all(this._settingsToSync)
    this._settingsToSync = []
  }

  /**
   * 通过提供一个 getter 监听资源
   * @param resName 资源名称
   * @param getter 资源 getter
   */
  getterSync(resName: string, getter: SimpleStateGetter, mobxToJs = false) {
    this.autoDisposeReaction(getter, (newValue) => {
      this.sendEvent(`update-getter/${resName}`, mobxToJs ? toJS(newValue) : newValue)
    })
    this.onCall(`get-getter/${resName}`, () => (mobxToJs ? toJS(getter()) : getter()))
  }

  /**
   * 通过提供一个 dotPropPath 监听资源
   * @param resPath 资源路径，如 `someState.nested.value`
   * @param obj 一个 mobx 对象
   */
  dotPropSync<T extends object>(obj: T, stateId: string, resPath: Paths<T>, mobxToJs = false) {
    this.autoDisposeReaction(
      () => get(obj, resPath),
      (newValue) => {
        this.sendEvent(
          `update-dot-prop/${stateId}/${resPath}`,
          mobxToJs ? toJS(newValue) : newValue
        )
      }
    )
    this.onCall(`get-dot-prop/${stateId}/${resPath}`, () =>
      mobxToJs ? toJS(get(obj, resPath)) : get(obj, resPath)
    )
  }

  /**
   * 简易的设置状态同步。默认值为 getter()，并在设置时推送更新。会在被 setup 时从存储模块中读取设置。
   * @param settingName 该模块的设置项目
   * @param getter 设置状态量的 getter
   * @param setter 设置状态量的 setter，默认会将值设置到 SettingService 中，如果 setter 返回 true，则不会设置到 SettingService，可以用于自定义设置行为
   */
  simpleSettingSync(settingName: string, getter: SimpleStateGetter, setter: SimpleStateSetter) {
    const _wrappedSetter = async (value: any) => {
      if (!(await setter(value, this._ss))) {
        await this._ss.set(settingName, value)
      }
    }
    const _readSettingFirst = async () => _wrappedSetter(await this._ss.get(settingName, getter()))
    this._settingsToSync.push(_readSettingFirst())
    this.getterSync(`settings/${settingName}`, getter)
    this.onCall(`set-setting/${settingName}`, (value) => _wrappedSetter(value))
  }

  /**
   * settingSync(this.state.settings, 'some.setting.path', (value) => this.state.settings.setSomeSettingPath(value))
   */
  settingSync<T extends object>(
    obj: T,
    settingModuleId: string,
    resPath: Paths<T>,
    setter?: StateSetter,
    mobxToJs = false
  ) {
    const _defaultSetter = async (value: any) => {
      set(obj, resPath, value)
      await this._ss.set(resPath, value)
    }

    const _wrappedSetter = async (value: any) => {
      if (setter) {
        await setter(value, () => _defaultSetter(value), this._ss)
      } else {
        await _defaultSetter(value)
      }
    }
    const _readSettingFirst = async () =>
      _wrappedSetter(await this._ss.get(resPath, () => get(obj, resPath)))
    this._settingsToSync.push(_readSettingFirst())
    this.dotPropSync(obj, settingModuleId, resPath, mobxToJs)
    this.onCall(`set-setting/${settingModuleId}/${resPath}`, (value) => _wrappedSetter(value))
  }

  /**
   * mobx `reaction` 封装，会在 unregister 时自动清除
   */
  autoDisposeReaction<T, FireImmediately extends boolean = false>(
    expression: (r: IReactionPublic) => T,
    effect: (
      arg: T,
      prev: FireImmediately extends true ? T | undefined : T,
      r: IReactionPublic
    ) => void,
    opts?: IReactionOptions<T, FireImmediately>
  ) {
    const fn = reaction(expression, effect, opts)
    this._disposers.add(fn)

    return () => {
      if (this._disposers.has(fn)) {
        fn()
        this._disposers.delete(fn)
      }
    }
  }

  override async dispose() {
    await super.dispose()
    this._disposers.forEach((fn) => fn())
    this._disposers.clear()
  }
}
