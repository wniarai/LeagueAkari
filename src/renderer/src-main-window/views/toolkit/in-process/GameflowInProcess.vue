<template>
  <NCard size="small">
    <template #header><span class="card-header-title">进行时</span></template>
    <ControlItem
      class="control-item-margin"
      label="英雄选择秒退"
      label-description="立即退出当前英雄选择阶段，但不会关闭客户端"
      :label-width="200"
    >
      <NButton
        type="warning"
        :disabled="gameflow.phase !== 'ChampSelect'"
        @click="handleDodge"
        size="small"
        >秒退</NButton
      >
    </ControlItem>
    <ControlItem
      class="control-item-margin"
      label="退出结算页面"
      label-description="立即退出结算界面。适用于由于客户端原因无法退出结算页面的情况"
      :label-width="200"
    >
      <NButton type="primary" :disabled="!isInEndgamePhase" @click="handlePlayAgain" size="small"
        >回到房间</NButton
      >
    </ControlItem>
    <ControlItem
      class="control-item-margin"
      label="退出当前房间"
      label-description="立即退出当前房间"
      :label-width="200"
    >
      <NButton :disabled="gameflow.phase !== 'Lobby'" @click="deleteLobby" size="small"
        >退出房间</NButton
      >
    </ControlItem>
  </NCard>
</template>

<script setup lang="ts">
import ControlItem from '@renderer-shared/components/ControlItem.vue'
import { earlyExit } from '@renderer-shared/http-api/gameflow'
import { playAgain } from '@renderer-shared/http-api/lobby'
import { deleteLobby } from '@renderer-shared/http-api/lobby'
import { dodge } from '@renderer-shared/http-api/login'
import { useGameflowStore } from '@renderer-shared/modules/lcu-state-sync/gameflow'
import { laNotification } from '@renderer-shared/notification'
import { NButton, NCard } from 'naive-ui'
import { computed } from 'vue'

const gameflow = useGameflowStore()

const _handleEarlyExit = async () => {
  try {
    await earlyExit()
  } catch (error) {
    laNotification.warn('', '尝试强退失败', error)
  }
}

const handleDodge = async () => {
  try {
    const _ = await dodge()
  } catch (error) {
    laNotification.warn('过程中', '尝试秒退失败', error)
  }
}

const isInEndgamePhase = computed(() => {
  return (
    gameflow.phase === 'WaitingForStats' ||
    gameflow.phase === 'PreEndOfGame' ||
    gameflow.phase === 'EndOfGame'
  )
})

const handlePlayAgain = async () => {
  try {
    await playAgain()
  } catch (error) {
    laNotification.warn('过程中', '尝试重新回到房间失败', error)
  }
}
</script>

<style lang="less" scoped>
.control-item-margin {
  &:not(:last-child) {
    margin-bottom: 12px;
  }
}

.card-header-title {
  font-weight: bold;
  font-size: 18px;
}
</style>
