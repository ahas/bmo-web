<!-- Every storage device of a machine, each its own group (bmo-node's docs/hardware.md, 「Storage」): its model,
     kind and size, each volume standing on it with its fill, its own temperature, and its charts.
     Groups are parted by their titles and by spacing, not by boxes. -->
<template>
  <MonitorCard :title="$t('hardware.title.storage')">
    <SkeletonStatus v-if="storage === null" as="div" :label="$t('hardware.status.storage_loading')" class="grid gap-6 @3xl:grid-cols-2">
      <div v-for="n in 2" :key="n" class="flex flex-col gap-2">
        <SkeletonBar class="h-6 w-48" />
        <SkeletonBar class="h-5 w-32" />
        <SkeletonBar v-for="m in 2" :key="m" class="h-5 w-full" />
      </div>
    </SkeletonStatus>

    <p v-else-if="storage.length === 0" class="text-sm text-muted">{{ $t(UNREAD) }}</p>

    <div v-else class="grid gap-x-8 gap-y-6 @3xl:grid-cols-2">
      <section v-for="device in storage" :key="device.key" class="flex min-w-0 flex-col gap-2" :aria-label="device.name">
        <div class="flex min-w-0 items-center gap-3">
          <h3 class="min-w-0 truncate font-medium" :title="device.name">{{ device.name }}</h3>
          <span class="shrink-0 text-sm text-muted">{{ [storageKindWord($t, device.kind), device.kind === "network" ? null : driveSizeText($t, device.sizeBytes)].filter(Boolean).join(" · ") }}</span>
        </div>

        <HardwareMeters shares>
          <HardwareMeter v-for="volume in device.volumes" :key="volume.mount" :label="volume.mount" :value="fillText($t, volume.usedKb, volume.totalKb)" :widest="fillWidest($t, volume.totalKb)" :share="volume.share" :heat="fillHeat(volume.share)" :criteria="fillCriteria($t)" percent />
          <HardwareMeter v-if="device.volumes.length === 0" :label="$t('hardware.label.mount')" :value="$t('common.label.none')" />
          <HardwareMeter
            v-if="hasTemperature(device)"
            :label="$t('hardware.label.temperature')"
            :value="celsiusText($t, device.celsius)"
            :widest="celsiusText($t, CELSIUS_MOST)"
            :share="device.celsius === null ? null : device.celsius / 100"
            :heat="temperatureHeat(device.celsius, device.limitCelsius)"
            :criteria="temperatureCriteria($t, limitOf(device.limitCelsius, 'chip'))"
            :tone="heatClasses(temperatureHeat(device.celsius, device.limitCelsius)).text"
          />
        </HardwareMeters>

        <HardwareCharts :figures="figures(device)" />
      </section>
    </div>
  </MonitorCard>
</template>

<script setup lang="ts">
import { CELSIUS_MOST, celsiusText, driveSizeText, fillCriteria, fillHeat, fillText, fillWidest, gigabytesValue, heatClasses, limitOf, storageKindWord, temperatureCriteria, temperatureHeat, UNREAD } from "~/domain/hardware";

import type { HardwareFigure } from "~/domain/hardware";
import type { StorageView } from "#shared/types";

defineProps<{ storage: StorageView[] | null }>();
const { t } = useI18n();

// A share and a virtual disk have no body of their own to be warm.
function hasTemperature(device: StorageView): boolean {
  return device.kind !== "network" && device.kind !== "virtual";
}

function figures(device: StorageView): HardwareFigure[] {
  const key = `storage:${device.key}`;

  return [
    { key: `${key}|gb`, label: t("hardware.label.used"), format: gigabytesValue, ceiling: device.totalKb === null ? null : device.totalKb / 1024 / 1024 },
    ...(hasTemperature(device) ? [{ key: `${key}|temp`, label: t("hardware.label.temperature"), format: (value: number) => celsiusText(t, value), ceiling: 100 }] : []),
  ];
}
</script>
