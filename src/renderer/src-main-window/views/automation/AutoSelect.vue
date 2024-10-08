<template>
  <NScrollbar class="outer-wrapper">
    <div class="inner-wrapper">
      <NCard size="small">
        <template #header><span class="card-header-title">自动英雄选择 · 普通模式</span></template>
        <ControlItem
          class="control-item-margin"
          label="开启"
          label-description="在常规的模式中启用。如匹配模式，排位模式等任何非随机英雄的模式"
          :label-width="200"
        >
          <NSwitch
            @update:value="(v) => asm.setNormalModeEnabled(v)"
            :value="as.settings.normalModeEnabled"
            size="small"
          ></NSwitch>
        </ControlItem>
        <ControlItem
          class="control-item-margin"
          label="提前预选"
          label-description="预选即将自动选用的英雄"
          :label-width="200"
        >
          <NSwitch
            type="pick"
            size="small"
            :value="as.settings.showIntent"
            @update:value="(val) => asm.setShowIntent(val)"
          />
        </ControlItem>
        <ControlItem
          class="control-item-margin"
          label="无视队友预选"
          label-description="开启后将不会考虑队友的预选英雄，反之会避免与队友的选择冲突"
          :label-width="200"
        >
          <NSwitch
            @update:value="(v) => asm.setSelectTeammateIntendedChampion(v)"
            :value="as.settings.selectTeammateIntendedChampion"
            size="small"
          />
        </ControlItem>
        <ControlItem
          class="control-item-margin"
          label="选择策略"
          label-description="立即锁定或只是亮出"
          :label-width="200"
        >
          <NRadioGroup :value="as.settings.completed" @update:value="(v) => asm.setCompleted(v)">
            <NRadio :value="true">立即锁定</NRadio>
            <NRadio :value="false">亮出而不锁定</NRadio>
          </NRadioGroup>
        </ControlItem>
        <ControlItem class="control-item-margin" label="意向英雄" :label-width="200">
          <template #labelDescription>
            <div style="margin-bottom: 8px">将根据预设列表选择英雄</div>
            <div style="margin-bottom: 8px">
              若当前模式<span style="font-weight: bold">不存在分路信息</span>或<span
                style="font-weight: bold"
                >当前分路未设置英雄</span
              >，则按照<span style="font-weight: bold">默认</span>列表进行选择
            </div>
            <div>选择优先级为列表定义顺序，优先选择位置靠前的英雄</div>
          </template>
          <div class="expected-champion-groups">
            <div class="group">
              <div class="label" :class="{ current: as.memberMe?.assignedPosition === 'top' }">
                上路
              </div>
              <OrderedChampionList
                type="pick"
                :champions="as.settings.expectedChampions.top"
                @update:champions="
                  (list) =>
                    asm.setExpectedChampions({ ...as.settings.expectedChampions, top: list })
                "
              />
            </div>
            <div class="group">
              <div class="label" :class="{ current: as.memberMe?.assignedPosition === 'middle' }">
                中路
              </div>
              <OrderedChampionList
                type="pick"
                :champions="as.settings.expectedChampions.middle"
                @update:champions="
                  (list) =>
                    asm.setExpectedChampions({ ...as.settings.expectedChampions, middle: list })
                "
              />
            </div>
            <div class="group">
              <div class="label" :class="{ current: as.memberMe?.assignedPosition === 'jungle' }">
                打野
              </div>
              <OrderedChampionList
                type="pick"
                :champions="as.settings.expectedChampions.jungle"
                @update:champions="
                  (list) =>
                    asm.setExpectedChampions({ ...as.settings.expectedChampions, jungle: list })
                "
              />
            </div>
            <div class="group">
              <div class="label" :class="{ current: as.memberMe?.assignedPosition === 'bottom' }">
                下路
              </div>
              <OrderedChampionList
                type="pick"
                :champions="as.settings.expectedChampions.bottom"
                @update:champions="
                  (list) =>
                    asm.setExpectedChampions({ ...as.settings.expectedChampions, bottom: list })
                "
              />
            </div>
            <div class="group">
              <div class="label" :class="{ current: as.memberMe?.assignedPosition === 'utility' }">
                辅助
              </div>
              <OrderedChampionList
                type="pick"
                :champions="as.settings.expectedChampions.utility"
                @update:champions="
                  (list) =>
                    asm.setExpectedChampions({ ...as.settings.expectedChampions, utility: list })
                "
              />
            </div>
            <div class="group">
              <div class="label" :class="{ current: as.memberMe?.assignedPosition === '' }">
                默认
              </div>
              <OrderedChampionList
                type="pick"
                :champions="as.settings.expectedChampions.default"
                @update:champions="
                  (list) =>
                    asm.setExpectedChampions({ ...as.settings.expectedChampions, default: list })
                "
              />
            </div>
          </div>
        </ControlItem>
      </NCard>
      <NCard size="small" style="margin-top: 8px">
        <template #header><span class="card-header-title">自动英雄选择 · 随机模式</span></template>
        <ControlItem
          class="control-item-margin"
          label="开启"
          label-description="随机分配英雄的模式，如极地大乱斗"
          :label-width="200"
        >
          <NSwitch
            @update:value="(v) => asm.setBenchModeEnabled(v)"
            :value="as.settings.benchModeEnabled"
            size="small"
          ></NSwitch>
        </ControlItem>
        <ControlItem class="control-item-margin" label="选用最低累积时间 (s)" :label-width="200">
          <template #labelDescription>
            目标英雄出现在英雄选择台上的累计时间需达到此值才会执行交换操作，单位为秒
            <NTooltip>
              <template #trigger
                ><span style="text-decoration: underline; font-weight: bold">(?)</span></template
              >
              <div style="font-size: 12px; max-width: 300px">
                当英雄出现在英雄选择台上时，会针对该英雄进行计时。仅当其在英雄选择台上的累计时间满足设定值时，自动交换才会执行，避免过早选择英雄，即
                “秒抢”
              </div>
            </NTooltip>
          </template>
          <NInputNumber
            style="width: 100px"
            placeholder="秒"
            :min="0"
            size="small"
            :value="as.settings.grabDelaySeconds"
            @update:value="(v) => asm.setGrabDelaySeconds(v || 0)"
          />
        </ControlItem>
        <ControlItem
          class="control-item-margin"
          label="优先选择首位"
          label-description="开启此项后，将始终选用期望列表中第一个可用的英雄"
          :label-width="200"
        >
          <NSwitch
            @update:value="(v) => asm.setBenchSelectFirstAvailableChampion(v)"
            :value="as.settings.benchSelectFirstAvailableChampion"
            size="small"
          ></NSwitch>
        </ControlItem>
        <ControlItem class="control-item-margin" label="期望英雄" :label-width="200">
          <OrderedChampionList
            type="pick"
            :champions="as.settings.benchExpectedChampions"
            @update:champions="(list) => asm.setBenchExpectedChampions(list)"
          />
        </ControlItem>
      </NCard>
      <NCard size="small" style="margin-top: 8px">
        <template #header><span class="card-header-title">自动英雄禁用</span></template>
        <ControlItem
          class="control-item-margin"
          label="开启"
          label-description="自动执行英雄的禁用操作"
          :label-width="200"
        >
          <NSwitch
            @update:value="(v) => asm.setBanEnabled(v)"
            :value="as.settings.banEnabled"
            size="small"
          ></NSwitch>
        </ControlItem>
        <ControlItem
          class="control-item-margin"
          label="无视队友预选"
          label-description="开启后将不会考虑队友的预选英雄"
          :label-width="200"
        >
          <NSwitch
            @update:value="(v) => asm.setBanTeammateIntendedChampion(v)"
            :value="as.settings.banTeammateIntendedChampion"
            size="small"
          ></NSwitch>
        </ControlItem>
        <ControlItem class="control-item-margin" label="意向英雄" :label-width="200">
          <template #labelDescription>
            <div style="margin-bottom: 8px">将根据预设列表禁用英雄</div>
            <div style="margin-bottom: 8px">
              若当前模式<span style="font-weight: bold">不存在分路信息</span>或<span
                style="font-weight: bold"
                >当前分路未设置英雄</span
              >，则按照<span style="font-weight: bold">默认</span>列表进行选择
            </div>
            <div>禁用优先级为列表定义顺序，优先禁用位置靠前的英雄</div>
          </template>
          <div class="expected-champion-groups">
            <div class="group">
              <div class="label" :class="{ current: as.memberMe?.assignedPosition === 'top' }">
                上路
              </div>
              <OrderedChampionList
                type="ban"
                allow-empty
                :champions="as.settings.bannedChampions.top"
                @update:champions="
                  (list) => asm.setBannedChampions({ ...as.settings.bannedChampions, top: list })
                "
              />
            </div>
            <div class="group">
              <div class="label" :class="{ current: as.memberMe?.assignedPosition === 'middle' }">
                中路
              </div>
              <OrderedChampionList
                type="ban"
                allow-empty
                :champions="as.settings.bannedChampions.middle"
                @update:champions="
                  (list) => asm.setBannedChampions({ ...as.settings.bannedChampions, middle: list })
                "
              />
            </div>
            <div class="group">
              <div class="label" :class="{ current: as.memberMe?.assignedPosition === 'jungle' }">
                打野
              </div>
              <OrderedChampionList
                type="ban"
                allow-empty
                :champions="as.settings.bannedChampions.jungle"
                @update:champions="
                  (list) => asm.setBannedChampions({ ...as.settings.bannedChampions, jungle: list })
                "
              />
            </div>
            <div class="group">
              <div class="label" :class="{ current: as.memberMe?.assignedPosition === 'bottom' }">
                下路
              </div>
              <OrderedChampionList
                type="ban"
                allow-empty
                :champions="as.settings.bannedChampions.bottom"
                @update:champions="
                  (list) => asm.setBannedChampions({ ...as.settings.bannedChampions, bottom: list })
                "
              />
            </div>
            <div class="group">
              <div class="label" :class="{ current: as.memberMe?.assignedPosition === 'utility' }">
                辅助
              </div>
              <OrderedChampionList
                type="ban"
                allow-empty
                :champions="as.settings.bannedChampions.utility"
                @update:champions="
                  (list) =>
                    asm.setBannedChampions({ ...as.settings.bannedChampions, utility: list })
                "
              />
            </div>
            <div class="group">
              <div class="label" :class="{ current: as.memberMe?.assignedPosition === '' }">
                默认
              </div>
              <OrderedChampionList
                type="ban"
                allow-empty
                :champions="as.settings.bannedChampions.default"
                @update:champions="
                  (list) =>
                    asm.setBannedChampions({ ...as.settings.bannedChampions, default: list })
                "
              />
            </div>
          </div>
        </ControlItem>
      </NCard>
    </div>
  </NScrollbar>
</template>

<script setup lang="ts">
import ControlItem from '@renderer-shared/components/ControlItem.vue'
import { autoSelectRendererModule as asm } from '@renderer-shared/modules/auto-select'
import { useAutoSelectStore } from '@renderer-shared/modules/auto-select/store'
import { NCard, NInputNumber, NRadio, NRadioGroup, NScrollbar, NSwitch, NTooltip } from 'naive-ui'

import OrderedChampionList from '@main-window/components/OrderedChampionList.vue'

const as = useAutoSelectStore()
</script>

<style lang="less" scoped>
.divider {
  margin-top: 12px;
  margin-bottom: 12px;
  height: 1px;
  background-color: rgba(255, 255, 255, 0.084);
}

.control-item-margin {
  &:not(:last-child) {
    margin-bottom: 12px;
  }
}

.card-header-title {
  font-weight: bold;
  font-size: 18px;
}

.outer-wrapper {
  position: relative;
  height: 100%;
  max-width: 100%;
}

.inner-wrapper {
  padding: 24px;
  margin: 0 auto;
  max-width: 800px;

  :deep(.n-card) {
    background-color: transparent;
  }
}

.expected-champion-groups {
  .group {
    display: flex;
    align-items: center;
    height: 24px;
  }

  .group:not(:last-child) {
    margin-bottom: 12px;
  }

  .label {
    margin-right: 12px;
    font-size: 12px;
    font-weight: bold;
  }

  .label.current {
    color: #88f6d1;
  }
}
</style>
