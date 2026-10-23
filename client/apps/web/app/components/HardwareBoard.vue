<!-- The board as one piece of hardware (docs/web.md, 「Monitor screen」): the temperatures its
     own chips report and its fans, with the charts of each fan that is spinning. -->
<template>
  <MonitorCard :title="$t('hardware.title.board')">
    <SkeletonStatus v-if="board === null" as="div" :label="$t('hardware.status.board_loading')" class="flex flex-col gap-2">
      <SkeletonBar v-for="n in 4" :key="n" class="h-5 w-full" />
    </SkeletonStatus>

    <p v-else-if="board.sensors.length === 0 && board.fans.length === 0" class="text-sm text-muted">
      {{ $t(UNREAD) }}<template v-if="sensorLibrary === 'missing' || sensorLibrary === 'failed'"> · {{ $t("hardware.status.no_sensor_library") }}</template>
    </p>

    <template v-else>
      <HardwareMeters>
        <HardwareMeter
          v-for="sensor in board.sensors"
          :key="`${sensor.chip}:${sensor.device}:${sensor.label}`"
          :label="sensor.label"
          :value="celsiusText($t, sensor.celsius)"
          :widest="celsiusText($t, CELSIUS_MOST)"
          :share="sensor.celsius / 100"
          :heat="temperatureHeat(sensor.celsius, sensor.limitCelsius)"
          :criteria="temperatureCriteria($t, limitOf(sensor.limitCelsius, 'chip'))"
          :tone="heatClasses(temperatureHeat(sensor.celsius, sensor.limitCelsius)).text"
        />
        <HardwareMeter v-for="fan in board.fans" :key="`${fan.chip}:${fan.label}`" :label="fan.label" :value="rpmText($t, fan.rpm)" :widest="rpmText($t, RPM_MOST)" />
        <HardwareMeter v-if="board.fans.length === 0" :label="$t('hardware.label.fan')" :value="$t(UNREAD)" />
      </HardwareMeters>

      <HardwareCharts v-if="figures.length > 0" :figures="figures" />
    </template>
  </MonitorCard>
</template>

<script setup lang="ts">
import { CELSIUS_MOST, celsiusText, heatClasses, limitOf, rpmText, temperatureCriteria, temperatureHeat, UNREAD } from "~/domain/hardware";

import type { HardwareFigure } from "~/domain/hardware";
import type { BoardView } from "#shared/types";

const props = defineProps<{ board: BoardView | null; sensorLibrary: "ok" | "missing" | "failed" | null }>();
const { t } = useI18n();

// The fastest a fan runs, a server's included, which the figures' column is held to.
const RPM_MOST = 99_999;

const figures = computed<HardwareFigure[]>(() => (props.board?.fans ?? []).filter((one) => one.rpm > 0).map((fan) => ({
  key: `fan:${fan.chip}:${fan.label}`,
  label: fan.label,
  format: (value: number) => rpmText(t, value),
  ceiling: null,
})));
</script>
