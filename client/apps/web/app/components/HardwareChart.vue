<!-- One figure of one piece of hardware over time (docs/web.md, 「Monitor screen」): live, a line
     over a light area; recorded, each point's lowest to highest as a band with its mean as a line.
     Either is broken where nothing was recorded and stands on one axis from nought to its top.
     Hovering or touching it stands a guide on the nearest point with that point's time and value. -->
<template>
  <figure class="flex min-w-0 flex-col gap-1">
    <figcaption class="flex min-w-0 items-center justify-between gap-2 text-sm">
      <span class="min-w-0 truncate text-muted" :title="label">{{ label }}</span>
      <span class="shrink-0 whitespace-nowrap tabular-nums">{{ extent === null ? "" : caption }}</span>
    </figcaption>

    <SkeletonStatus v-if="points === null" as="div" :label="$t('common.status.loading_named', { name: label })">
      <SkeletonBar class="h-12 w-full rounded-none" />
    </SkeletonStatus>

    <div v-else-if="failure !== null" class="flex h-12 items-center justify-center border-b border-default text-sm text-error">{{ failure }}</div>

    <div v-else-if="extent === null" class="flex h-12 items-center justify-center border-b border-default text-sm text-muted">{{ empty }}</div>

    <div
      v-else
      ref="plot"
      class="relative h-12 touch-pan-y border-b border-default"
      role="img"
      :aria-label="summary"
      @pointermove="point"
      @pointerdown="point"
      @pointerleave="hoveredAt = null"
    >
      <svg class="absolute inset-0 size-full overflow-visible" :viewBox="`0 0 ${WIDTH} ${HEIGHT}`" preserveAspectRatio="none" aria-hidden="true">
        <template v-if="band">
          <path v-for="(run, r) in runs" :key="`b${r}`" :d="bandPath(frame, run)" class="fill-(--ui-primary) opacity-25" />
        </template>
        <template v-else>
          <path v-for="(run, r) in runs" :key="`a${r}`" :d="areaPath(frame, run)" class="fill-(--ui-primary) opacity-15" />
        </template>
        <path v-for="(run, r) in runs" :key="`l${r}`" :d="linePath(frame, run)" class="fill-none stroke-(--ui-primary)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
      </svg>

      <template v-if="hovered !== null">
        <div class="pointer-events-none absolute inset-y-0 w-px bg-(--ui-border-accented)" :style="{ left: `${place(hovered)}%` }" />
        <div
          class="pointer-events-none absolute bottom-full z-10 mb-1 rounded-md bg-inverted px-2 py-1 text-sm whitespace-nowrap text-inverted tabular-nums"
          :class="place(hovered) > 50 ? '-translate-x-full' : ''"
          :style="{ left: `${place(hovered)}%` }"
        >
          {{ timeText(hovered.at) }} · {{ band ? $t("hardware.label.band_point", { mean: format(hovered.value), min: format(hovered.min), max: format(hovered.max) }) : format(hovered.value) }}
        </div>
      </template>
    </div>
  </figure>
</template>

<script setup lang="ts">
import { areaPath, bandPath, chartExtent, chartRuns, chartTop, chartX, linePath, nearestPoint } from "~/domain/hardware-chart";

import type { ChartFrame, ChartPoint } from "~/domain/hardware-chart";

const props = withDefaults(defineProps<{
  label: string;
  // What stands beside the name once there is anything to draw: the latest value, or the span's
  // lowest and highest.
  caption: string;
  // Null while the first reading or record is still out.
  points: (ChartPoint | null)[] | null;
  // The instants the axis runs between.
  from: number;
  to: number;
  // Two points further apart than this are not joined.
  gap: number;
  ceiling: number | null;
  // Recorded points, drawn as a band from each one's lowest to its highest.
  band: boolean;
  format: (value: number) => string;
  timeText: (at: number) => string;
  // What stands where nothing was recorded, and what a reader of the drawing is told it shows.
  empty: string;
  summary: string;
  // Why there is nothing to draw where the read failed.
  failure?: string | null;
}>(), { failure: null });

const WIDTH = 1000;
const HEIGHT = 100;

const plot = ref<HTMLElement | null>(null);
// Where across the axis the pointer stands, as an instant; the point shown is the nearest one there,
// so a drawing that moves on under a still pointer shows what now stands under it.
const hoveredAt = ref<number | null>(null);

const extent = computed(() => chartExtent(props.points ?? []));
const frame = computed<ChartFrame>(() => ({ from: props.from, to: props.to, top: chartTop(props.ceiling, extent.value), width: WIDTH, height: HEIGHT }));
const runs = computed(() => chartRuns(props.points ?? [], props.gap));
const hovered = computed(() => (hoveredAt.value === null ? null : nearestPoint(props.points ?? [], hoveredAt.value)));

function place(one: ChartPoint): number {
  return Math.min(100, Math.max(0, (chartX(frame.value, one.at) / WIDTH) * 100));
}

function point(event: PointerEvent): void {
  const box = plot.value?.getBoundingClientRect();

  if (box === undefined || box.width === 0) return;

  const share = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));

  hoveredAt.value = props.from + share * (props.to - props.from);
}
</script>
