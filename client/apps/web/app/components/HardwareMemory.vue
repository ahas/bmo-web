<!-- Memory as one piece of hardware (docs/web.md, 「Monitor screen」): how much of it and of the
     swap is in use, and its charts. -->
<template>
  <MonitorCard :title="$t('hardware.label.memory')">
    <SkeletonStatus v-if="memory === null" as="div" :label="$t('hardware.status.memory_loading')" class="flex flex-col gap-2">
      <SkeletonBar v-for="n in 2" :key="n" class="h-5 w-full" />
    </SkeletonStatus>

    <HardwareMeters v-else shares>
      <HardwareMeter :label="$t('hardware.label.used')" :value="fillText($t, memory.usedKb, memory.totalKb)" :widest="fillWidest($t, memory.totalKb)" :share="memory.share" :heat="fillHeat(memory.share)" :criteria="fillCriteria($t)" percent />
      <HardwareMeter :label="$t('hardware.label.swap')" :value="fillText($t, memory.swapUsedKb, memory.swapTotalKb)" :widest="fillWidest($t, memory.swapTotalKb)" :share="memory.swapShare" percent />
    </HardwareMeters>

    <HardwareCharts :figures="figures" />
  </MonitorCard>
</template>

<script setup lang="ts">
import { fillCriteria, fillHeat, fillText, fillWidest, gigabytesValue } from "~/domain/hardware";

import type { HardwareFigure } from "~/domain/hardware";
import type { MemoryView } from "#shared/types";

const props = defineProps<{ memory: MemoryView | null }>();
const { t } = useI18n();

const figures = computed<HardwareFigure[]>(() => [
  { key: "memory|gb", label: t("hardware.label.used"), format: gigabytesValue, ceiling: props.memory?.totalKb == null ? null : props.memory.totalKb / 1024 / 1024 },
]);
</script>
