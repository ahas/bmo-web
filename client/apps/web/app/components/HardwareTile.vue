<!-- One machine on the monitor overview (docs/web.md, 「Monitor screen」): its own mark and name, its
     connection type, each GPU by its short name, one row holding a bar for each GPU's VRAM and one for
     RAM with their figures in their physical units, small, beside a narrow small copy of its chip at one
     height on every tile, a line for the CPU and each GPU with its latest use and temperature, and two charts of the last minute, use and temperature, each drawing the
     CPU and every GPU on one axis, filled from the machine's live record. The reading is the
     overview's one recorded answer for every tile, so no tile asks for itself. What the machine is,
     its OS and its CPU's model, and its storage devices stand only on the machine's own monitor, so a
     tile's height never turns on its disks or its cores. Its live tracking switch stands in its head,
     and a machine not tracked says so in place of its figures. The whole tile but the switch opens the machine's
     own monitor: the name is the link, stretched over the tile, and the switch stands above it. -->
<template>
  <div data-machine-tile class="relative rounded-lg border border-default bg-default p-4 transition-colors has-[a:hover]:bg-elevated/50 has-[a:active]:bg-elevated">
    <div class="flex flex-col gap-4">
      <div class="flex flex-col gap-2">
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
          <SkeletonStatus v-else-if="failure === null && !failed" :label="$t('hardware.status.tracking_loading')" class="flex shrink-0">
            <SkeletonBar class="h-5 w-20" />
          </SkeletonStatus>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <UBadge :icon="machineIcon(machine.kind)" :label="machineKindWord($t, machine.kind)" color="neutral" variant="subtle" />
          <UBadge v-if="owner !== null" icon="i-material-symbols-person-outline" :label="owner" color="neutral" variant="subtle" class="min-w-0 max-w-full" data-machine-owner />
        </div>
      </div>

      <p v-if="tracking.failed.value !== null" role="alert" class="relative z-10 text-sm text-error">{{ tracking.failed.value }}</p>

      <p v-if="failure !== null" class="text-sm text-error">
        <span class="font-mono">{{ failure }}</span>
      </p>

      <SkeletonStatus v-else-if="initial" as="div" :label="$t('common.status.loading_named', { name: name ?? machineKindWord($t, machine.kind) })" class="flex flex-col gap-4">
        <SkeletonBar class="h-5 w-40 max-w-full" />
        <div class="grid grid-cols-[4fr_1fr] items-start gap-x-4">
          <div class="flex flex-col gap-2">
            <SkeletonBar v-for="n in 2" :key="n" class="h-8 w-full" />
          </div>
          <SkeletonBar class="h-20 w-full rounded-none" />
        </div>
        <div class="flex flex-col gap-1">
          <SkeletonBar v-for="n in 2" :key="n" class="h-5 w-full" />
        </div>
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

        <!-- The memories and the chip share one row, the bars in the first column and the chip in the second. -->
        <div class="grid grid-cols-[4fr_1fr] items-start gap-x-4" data-tile-figures>
          <HardwareMeters small :class="hardware.cpu.chip === null ? 'col-span-2' : ''">
            <HardwareMeter v-for="gpu in hardware.gpus" :key="gpu.index" :label="hardware.gpus.length > 1 ? `VRAM ${gpu.index}` : 'VRAM'" :value="vramText($t, gpu.memoryUsedMb, gpu.memoryTotalMb)" :widest="vramWidest($t, gpu.memoryTotalMb)" :share="gpu.memoryShare" :heat="fillHeat(gpu.memoryShare)" :criteria="fillCriteria($t)" />
            <HardwareMeter label="RAM" :value="fillText($t, hardware.memory.usedKb, hardware.memory.totalKb)" :widest="fillWidest($t, hardware.memory.totalKb)" :share="hardware.memory.share" :heat="fillHeat(hardware.memory.share)" :criteria="fillCriteria($t)" />
          </HardwareMeters>

          <HardwareChip v-if="hardware.cpu.chip !== null" :chip="hardware.cpu.chip" :limit="cpuLimitOf(reading)?.celsius ?? null" compact />
        </div>

        <!-- Each piece on one line, its use and temperature after its name, each figure as wide as its widest form. -->
        <ul class="flex flex-col gap-1 text-sm" data-tile-pieces>
          <li v-for="piece in pieces" :key="piece.key" class="flex min-w-0 items-center justify-between gap-2">
            <span class="min-w-0 truncate" :class="piece.colour">{{ piece.label }}</span>
            <span class="shrink-0 whitespace-nowrap tabular-nums" :class="piece.read ? '' : 'text-muted'">
              <SteadyFigure :widest="USE_WIDEST">{{ piece.use }}</SteadyFigure>
              <span class="text-muted"> · </span>
              <SteadyFigure :widest="tempWidest">{{ piece.temp }}</SteadyFigure>
            </span>
          </li>
        </ul>

        <div class="grid grid-cols-2 gap-x-4">
          <HardwareLiveChart
            :legend="false"
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
import { celsiusText, cpuLimitOf, wholeCelsiusText, fillCriteria, fillHeat, fillText, fillWidest, gpuShortName, LIVE_CHART_SECONDS, LIVE_GAP_SECONDS, machineIcon, machineKindWord, machineName, percentValue, seriesColour, UNREAD, useHardwareTracking, useMachineLive, vramText, vramWidest } from "~/domain/hardware";
import { useInitialRead } from "bmo-ui/app/domain/loading";
import { formatTime } from "bmo-ui/app/domain/time";

import type { MonitorMachine, ReadStatus } from "~/domain/hardware";
import type { LiveSeries } from "~/domain/hardware-chart";
import type { GpuView, HardwareView, MachineHardware } from "#shared/types";

// The reading is the overview's one recorded answer for every machine, handed to the tile rather than
// asked by it, so the tiles keep one interval between them and no machine's read holds another.
// `owner` is the words naming a personal node's owner, null for a machine no person owns.
const props = defineProps<{ machine: MonitorMachine; owner: string | null; reading: MachineHardware | null; status: ReadStatus; failed: boolean }>();
const TILE_METRICS = ["use", "temp"];
const { t } = useI18n();

// A tile draws only use and temperature, so it fills its live drawing from those alone, extended by
// each recorded reading the overview hands it.
const live = useMachineLive({ url: props.machine.liveUrl, metrics: TILE_METRICS }, () => props.reading);
const initial = useInitialRead(computed(() => props.status));
const tracking = useHardwareTracking(t, computed(() => props.reading));
const hardware = computed<HardwareView | null>(() => props.reading?.hardware ?? null);
const failure = computed<string | null>(() => props.reading?.failure ?? null);
const name = computed(() => machineName(t, props.machine, props.reading, props.failed));

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

// The widest a use reads, and a temperature, so a figure changing never moves the line.
const USE_WIDEST = "100%";
const tempWidest = computed(() => wholeCelsiusText(t, 100));

// The CPU and every GPU on a line each: its use and its temperature, each its latest reading, a dash where none was read.
const pieces = computed(() => {
  const use = figures.value[0]!.series;
  const temp = figures.value[1]!.series;
  const last = (one: LiveSeries | undefined): number | null => {
    const point = one?.points.findLast((reading) => reading !== null);

    return point === undefined || point === null ? null : point.value;
  };

  return use.map((one, place) => {
    const used = last(one);
    const heat = last(temp[place]);

    return {
      key: one.key,
      label: one.label,
      colour: one.colour.text,
      read: used !== null || heat !== null,
      use: used === null ? t(UNREAD) : percentValue(used),
      temp: wholeCelsiusText(t, heat)
    };
  });
});

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
