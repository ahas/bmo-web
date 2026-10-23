<!-- One GPU as one piece of hardware (docs/web.md, 「Monitor screen」): its model; its use, VRAM,
     temperature, power against its limit, fan and clocks; and its charts. Its temperature is held
     against the temperature it slows down at, and red while thermal slowdown holds it down; its use
     and its power say how busy it is and have no colour of their own (「Colours」). -->
<template>
  <MonitorCard :title="title" :detail="gpu.name">
    <HardwareMeters shares>
      <HardwareMeter :label="$t('hardware.label.usage')" :share="gpu.usage" percent />
      <HardwareMeter label="VRAM" :value="vramText($t, gpu.memoryUsedMb, gpu.memoryTotalMb)" :widest="vramWidest($t, gpu.memoryTotalMb)" :share="gpu.memoryShare" :heat="fillHeat(gpu.memoryShare)" :criteria="fillCriteria($t)" percent />
      <HardwareMeter
        :label="$t('hardware.label.temperature')"
        :value="celsiusText($t, gpu.celsius)"
        :widest="celsiusText($t, CELSIUS_MOST)"
        :share="gpu.celsius === null ? null : gpu.celsius / 100"
        :heat="heat"
        :criteria="temperatureCriteria($t, limitOf(gpu.limitCelsius, 'driver'), true)"
        :tone="heatClasses(heat).text"
      />
      <HardwareMeter :label="$t('hardware.label.power')" :value="againstText($t, gpu.watts, gpu.wattLimit, wattsFigure, 'W')" :widest="againstText($t, gpu.wattLimit ?? WATTS_MOST, gpu.wattLimit, wattsFigure, 'W')" :share="gpu.wattShare" percent />
      <HardwareMeter :label="$t('hardware.label.fan')" :share="gpu.fanPercent === null ? null : gpu.fanPercent / 100" percent />
      <HardwareMeter :label="$t('hardware.label.clock')" :value="againstText($t, gpu.mhz, gpu.maxMhz, mhzFigure, 'MHz')" :widest="againstText($t, gpu.maxMhz ?? MHZ_MOST, gpu.maxMhz, mhzFigure, 'MHz')" :share="gpu.mhz === null || gpu.maxMhz === null || gpu.maxMhz === 0 ? null : gpu.mhz / gpu.maxMhz" percent />
      <HardwareMeter :label="$t('hardware.label.memory_clock')" :value="mhzText($t, gpu.memoryMhz)" :widest="mhzText($t, MEMORY_MHZ_MOST)" />
    </HardwareMeters>

    <HardwareCharts :figures="figures" />
  </MonitorCard>
</template>

<script setup lang="ts">
import { againstText, CELSIUS_MOST, celsiusText, fillCriteria, fillHeat, gigabytesValue, heatClasses, limitOf, mhzFigure, mhzText, percentValue, temperatureCriteria, temperatureHeat, vramText, vramWidest, wattsFigure, wattsText } from "~/domain/hardware";

import type { HardwareFigure } from "~/domain/hardware";
import type { GpuView } from "#shared/types";

const props = defineProps<{ gpu: GpuView; title: string }>();
const { t } = useI18n();

// The most a GPU's power and clocks run to where its own most was not read, which their column is
// held to; its memory clock reaches five places.
const WATTS_MOST = 999.9;
const MHZ_MOST = 9_999;
const MEMORY_MHZ_MOST = 99_999;

const heat = computed(() => temperatureHeat(props.gpu.celsius, props.gpu.limitCelsius, props.gpu.throttling));

const figures = computed<HardwareFigure[]>(() => {
  const device = `gpu${props.gpu.index}`;

  return [
    { key: `${device}|use`, label: t("hardware.label.usage"), format: percentValue, ceiling: 100 },
    { key: `${device}:vram|gb`, label: "VRAM", format: gigabytesValue, ceiling: props.gpu.memoryTotalMb === null ? null : props.gpu.memoryTotalMb / 1024 },
    { key: `${device}|temp`, label: t("hardware.label.temperature"), format: (value) => celsiusText(t, value), ceiling: 100 },
    { key: `${device}|watts`, label: t("hardware.label.power"), format: (value) => wattsText(t, value), ceiling: props.gpu.wattLimit },
  ];
});
</script>
