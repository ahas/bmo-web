<!-- One machine on the monitor overview (docs/web.md, 「Monitor screen」): its own mark and name, its
     connection type, each GPU by its short name, a bar for each GPU's VRAM and one for RAM with their
     figures in their physical units and their fill after them, a small copy of its chip at one
     height on every tile, and two charts of the last minute, use and temperature, each drawing the
     CPU and every GPU on one axis, read again every few seconds. What the machine is, its OS and its
     CPU's model, and its storage devices stand only on the machine's own monitor, so a tile's height
     never turns on its disks or its cores. Its live tracking switch stands in its head, and a machine
     not tracked says so in place of its figures. The whole tile but the switch opens the machine's
     own monitor: the name is the link, stretched over the tile, and the switch stands above it. -->
<template>
  <div class="relative rounded-lg border border-default bg-default p-4 transition-colors has-[a:hover]:bg-elevated/50 has-[a:active]:bg-elevated">
    <div class="flex flex-col gap-4">
      <div class="flex items-center gap-2">
        <UAvatar v-bind="avatar" size="sm" />
        <NuxtLink :to="machine.to" class="min-w-0 flex-1 truncate font-medium after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:outline-solid focus-visible:after:outline-offset-(--bmo-focus-gap)">
          <template v-if="name !== null">{{ name }}</template>
          <SkeletonStatus v-else :label="$t('hardware.status.name_loading')" class="flex">
            <SkeletonBar class="h-5 w-24" />
          </SkeletonStatus>
        </NuxtLink>
        <USwitch
          v-if="reading !== null"
          class="relative z-10 shrink-0"
          :model-value="tracking.on.value"
          :label="$t('hardware.title.live')"
          :aria-label="$t('hardware.label.tracking')"
          :loading="tracking.busy.value"
          :disabled="tracking.busy.value"
          @update:model-value="tracking.set($event as boolean)"
        />
        <SkeletonStatus v-else-if="failure === null" :label="$t('hardware.status.tracking_loading')" class="flex shrink-0">
          <SkeletonBar class="h-5 w-20" />
        </SkeletonStatus>
        <UBadge :icon="machineIcon(machine.kind)" :label="machineKindWord($t, machine.kind)" color="neutral" variant="subtle" class="shrink-0" />
      </div>

      <p v-if="tracking.failed.value !== null" role="alert" class="relative z-10 text-sm text-error">{{ tracking.failed.value }}</p>

      <p v-if="failure !== null" class="text-sm text-error">
        <span class="font-mono">{{ failure }}</span>
      </p>

      <SkeletonStatus v-else-if="initial" as="div" :label="$t('common.status.loading_named', { name: name ?? machineKindWord($t, machine.kind) })" class="flex flex-col gap-4">
        <SkeletonBar class="h-5 w-40 max-w-full" />
        <div class="flex flex-col gap-2">
          <SkeletonBar v-for="n in 2" :key="n" class="h-5 w-full" />
        </div>
        <SkeletonBar class="h-20 w-full rounded-none" />
        <div class="grid grid-cols-2 gap-x-4">
          <div v-for="n in 2" :key="n" class="flex flex-col gap-1">
            <SkeletonBar class="h-5 w-16" />
            <SkeletonBar v-for="m in 2" :key="m" class="h-5 w-full" />
            <SkeletonBar class="h-12 w-full rounded-none" />
          </div>
        </div>
      </SkeletonStatus>

      <p v-else-if="reading?.tracking === false" class="text-sm text-muted">{{ $t("hardware.status.tracking_off") }}</p>

      <template v-else-if="hardware !== null">
        <dl v-if="hardware.gpus.length > 0" class="pair-list gap-x-3 gap-y-1 text-sm">
          <template v-for="gpu in hardware.gpus" :key="gpu.index">
            <dt class="text-muted">{{ gpuLabel(gpu) }}</dt>
            <dd class="break-words" :title="gpu.name">{{ gpuShortName(gpu.name) }}</dd>
          </template>
        </dl>

        <HardwareMeters shares>
          <HardwareMeter v-for="gpu in hardware.gpus" :key="gpu.index" :label="hardware.gpus.length > 1 ? `VRAM ${gpu.index}` : 'VRAM'" :value="vramText($t, gpu.memoryUsedMb, gpu.memoryTotalMb)" :widest="vramWidest($t, gpu.memoryTotalMb)" :share="gpu.memoryShare" :heat="fillHeat(gpu.memoryShare)" :criteria="fillCriteria($t)" percent />
          <HardwareMeter label="RAM" :value="fillText($t, hardware.memory.usedKb, hardware.memory.totalKb)" :widest="fillWidest($t, hardware.memory.totalKb)" :share="hardware.memory.share" :heat="fillHeat(hardware.memory.share)" :criteria="fillCriteria($t)" percent />
        </HardwareMeters>

        <HardwareChip v-if="hardware.cpu.chip !== null" :chip="hardware.cpu.chip" :limit="cpuLimitOf(reading)?.celsius ?? null" compact />

        <div class="grid grid-cols-2 gap-x-4">
          <HardwareLiveChart
            v-for="figure in figures"
            :key="figure.metric"
            :label="figure.label"
            :series="figure.series"
            :from="live.now.value - LIVE_CHART_SECONDS"
            :to="live.now.value"
            :gap="LIVE_GAP_SECONDS"
            :ceiling="100"
            :format="figure.format"
            :time-text="formatTime"
            :empty="$t(UNREAD)"
            :summary="summary(figure.label, figure.series, figure.format)"
          />
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { identityMark } from "~/domain/avatars";
import { livePoints } from "~/domain/hardware-chart";
import { celsiusText, cpuLimitOf, fillCriteria, fillHeat, fillText, fillWidest, gpuShortName, LIVE_CHART_SECONDS, LIVE_GAP_SECONDS, machineIcon, machineKindWord, machineName, percentValue, seriesColour, UNREAD, useHardwareTracking, useMachineHardware, vramText, vramWidest } from "~/domain/hardware";
import { useInitialRead } from "bmo-ui/app/domain/loading";
import { formatTime } from "bmo-ui/app/domain/time";

import type { MonitorMachine } from "~/domain/hardware";
import type { LiveSeries } from "~/domain/hardware-chart";
import type { GpuView, HardwareView } from "#shared/types";

const props = defineProps<{ machine: MonitorMachine }>();
const TILE_METRICS = ["use", "temp"];
const { t } = useI18n();

// A tile draws only use and temperature, so it asks the live record for those alone.
const { machine: reading, status, error, live } = useMachineHardware(computed(() => props.machine.url), { url: props.machine.liveUrl, metrics: TILE_METRICS });
const initial = useInitialRead(status);
const tracking = useHardwareTracking(t, reading);
const hardware = computed<HardwareView | null>(() => reading.value?.hardware ?? null);
const failure = computed<string | null>(() => reading.value?.failure ?? error.value);
const name = computed(() => machineName(t, props.machine, reading.value, error.value !== null));

// The same mark the sidebar gives a node, so one machine wears one letter and colour everywhere.
const avatar = computed(() => identityMark(props.machine.key, name.value ?? machineKindWord(t, props.machine.kind), { icon: machineIcon(props.machine.kind) }));

function gpuLabel(gpu: GpuView): string {
  return hardware.value!.gpus.length > 1 ? `GPU ${gpu.index}` : "GPU";
}

// One figure of the CPU and of every GPU over the last minute, each piece in its own hue.
function liveSeries(metric: string): LiveSeries[] {
  const pieces = [{ key: `cpu|${metric}`, label: "CPU" }, ...(hardware.value?.gpus ?? []).map((gpu) => ({ key: `gpu${gpu.index}|${metric}`, label: gpuLabel(gpu) }))];

  return pieces.map((piece, place) => ({ ...piece, colour: seriesColour(place), points: livePoints(live.points.value, piece.key) }));
}

const figures = computed(() => [
  { metric: "use", label: t("hardware.label.usage"), series: liveSeries("use"), format: percentValue },
  { metric: "temp", label: t("hardware.label.temperature"), series: liveSeries("temp"), format: (value: number) => celsiusText(t, value) },
]);

function summary(label: string, series: LiveSeries[], format: (value: number) => string): string {
  const last = series.flatMap((one) => {
    const value = one.points.findLast((point) => point !== null)?.value;

    return value === undefined ? [] : [`${one.label} ${format(value)}`];
  });

  return t("hardware.aria.live_summary", { label, last: last.join(" · ") });
}
</script>
