<!-- The CPU as one piece of hardware (docs/web.md, 「Monitor screen」): its model and threads,
     its use, clock, temperature and power, the chip as it physically stands, and its charts; its
     temperature held against the machine's CPU limit, which the button in its head sets. -->
<template>
  <MonitorCard title="CPU" :detail="detail">
    <template #actions>
      <HardwareCpuLimit :control="limit" />
    </template>

    <SkeletonStatus v-if="cpu === null" as="div" :label="$t('hardware.status.cpu_loading')" class="flex flex-col gap-4">
      <div class="flex flex-col gap-2">
        <SkeletonBar v-for="n in 5" :key="n" class="h-5 w-full" />
      </div>
      <SkeletonBar class="h-72 w-full rounded-none" />
    </SkeletonStatus>

    <template v-else>
      <HardwareMeters shares>
        <HardwareMeter :label="$t('hardware.label.usage')" :share="cpu.usage" percent />
        <HardwareMeter
          :label="$t('hardware.label.temperature')"
          :value="celsiusText($t, cpu.celsius)"
          :widest="celsiusText($t, CELSIUS_MOST)"
          :share="cpu.celsius === null ? null : cpu.celsius / 100"
          :heat="heat"
          :criteria="temperatureCriteria($t, limit.limit.value)"
          :tone="heatClasses(heat).text"
        />
        <HardwareMeter :label="$t('hardware.label.clock')" :value="mhzText($t, cpu.mhz)" :widest="mhzText($t, MHZ_MOST)" />
        <HardwareMeter v-if="cpu.peakMhz !== null" :label="$t('hardware.label.clock_peak')" :value="mhzText($t, cpu.peakMhz)" :widest="mhzText($t, MHZ_MOST)" />
        <HardwareMeter :label="$t('hardware.label.power')" :value="wattsText($t, cpu.watts)" :widest="wattsText($t, WATTS_MOST)" />
      </HardwareMeters>

      <HardwareChip v-if="cpu.chip !== null" :chip="cpu.chip" :limit="limit.limit.value?.celsius ?? null" />
    </template>

    <HardwareCharts :figures="figures" />
  </MonitorCard>
</template>

<script setup lang="ts">
import { CELSIUS_MOST, celsiusText, heatClasses, mhzText, percentValue, temperatureCriteria, temperatureHeat, UNREAD, wattsText } from "~/domain/hardware";
import { countText } from "~/domain/numbers";

import type { HardwareCpuLimit, HardwareFigure } from "~/domain/hardware";
import type { CpuView } from "#shared/types";

const props = defineProps<{ cpu: CpuView | null; limit: HardwareCpuLimit }>();
const { t } = useI18n();

// The most a CPU's clock and package power run to, which their column is held to.
const MHZ_MOST = 9_999;
const WATTS_MOST = 999.9;

const heat = computed(() => temperatureHeat(props.cpu?.celsius ?? null, props.limit.limit.value?.celsius ?? null));

const detail = computed(() => (props.cpu === null ? null : `${props.cpu.chip?.label ?? props.cpu.model ?? t(UNREAD)} · ${t("hardware.label.threads", { n: countText(props.cpu.threadCount) })}`));

const figures = computed<HardwareFigure[]>(() => [
  { key: "cpu|use", label: t("hardware.label.usage"), format: percentValue, ceiling: 100 },
  { key: "cpu|temp", label: t("hardware.label.temperature"), format: (value) => celsiusText(t, value), ceiling: 100 },
  { key: "cpu|watts", label: t("hardware.label.power"), format: (value) => wattsText(t, value), ceiling: null },
  { key: "cpu|mhz", label: t("hardware.label.clock"), format: (value) => mhzText(t, value), ceiling: null },
]);
</script>
