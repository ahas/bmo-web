<!-- One figure of several pieces of one machine over the last minute (docs/web.md, 「Monitor
     screen」): a line for each piece on one axis from nought to its top, each in its own hue and
     broken where it was not read. Over it stands the figure's name, then, where the chart carries its
     own legend, each piece's name in its line's colour with its latest value. Hovering or touching it stands a guide on the nearest
     reading with its time and every piece's value there. -->
<template>
  <figure class="flex min-w-0 flex-col gap-1">
    <figcaption class="flex min-w-0 flex-col gap-1 text-sm">
      <span class="truncate text-muted">{{ label }}</span>
      <span v-for="one in legend ? series : []" :key="one.key" class="flex min-w-0 items-center justify-between gap-2">
        <span class="min-w-0 truncate" :class="one.colour.text">{{ one.label }}</span>
        <span class="shrink-0 whitespace-nowrap tabular-nums" :class="latest(one) === null ? 'text-muted' : ''">{{ latest(one) ?? empty }}</span>
      </span>
    </figcaption>

    <div v-if="drawn.length === 0" class="flex h-12 items-center justify-center border-b border-default text-sm text-muted">{{ empty }}</div>

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
        <template v-for="one in drawn" :key="one.key">
          <path v-for="(run, r) in one.runs" :key="r" :d="linePath(frame, run)" class="fill-none" :class="one.colour.line" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
        </template>
      </svg>

      <template v-if="hovered !== null">
        <div class="pointer-events-none absolute inset-y-0 w-px bg-(--ui-border-accented)" :style="{ left: `${hovered.place}%` }" />
        <div
          class="pointer-events-none absolute bottom-full z-10 mb-1 rounded-md bg-inverted px-2 py-1 text-sm whitespace-nowrap text-inverted tabular-nums"
          :class="hovered.place > 50 ? '-translate-x-full' : ''"
          :style="{ left: `${hovered.place}%` }"
        >
          {{ [timeText(hovered.at), ...hovered.values].join(" · ") }}
        </div>
      </template>
    </div>
  </figure>
</template>

<script setup lang="ts">
import { chartExtent, chartRuns, chartTop, chartX, linePath, nearestPoint } from "~/domain/hardware-chart";

import type { ChartFrame, LiveSeries } from "~/domain/hardware-chart";

const props = withDefaults(defineProps<{
  label: string;
  series: LiveSeries[];
  // Whether each piece's name and latest value stand over the drawing; a place that says them elsewhere hides them.
  legend?: boolean;
  // The instants the axis runs between.
  from: number;
  to: number;
  // Two points further apart than this are not joined.
  gap: number;
  ceiling: number;
  format: (value: number) => string;
  timeText: (at: number) => string;
  // What stands for a piece, or the whole drawing, where nothing was read.
  empty: string;
  // What a reader of the drawing is told it shows.
  summary: string;
}>(), { legend: true });

const WIDTH = 1000;
const HEIGHT = 100;

const plot = ref<HTMLElement | null>(null);
// Where across the axis the pointer stands, as an instant; the reading shown is the nearest one
// there, so a drawing that moves on under a still pointer shows what now stands under it.
const hoveredAt = ref<number | null>(null);

const drawn = computed(() => props.series.map((one) => ({ ...one, runs: chartRuns(one.points, props.gap) })).filter((one) => one.runs.length > 0));
const frame = computed<ChartFrame>(() => ({ from: props.from, to: props.to, top: chartTop(props.ceiling, chartExtent(props.series.flatMap((one) => one.points))), width: WIDTH, height: HEIGHT }));

function latest(one: LiveSeries): string | null {
  const last = one.points.findLast((point) => point !== null);

  return last === undefined || last === null ? null : props.format(last.value);
}

// The nearest reading of any piece, and every piece's value at that same reading.
const hovered = computed(() => {
  if (hoveredAt.value === null) return null;

  const anchor = nearestPoint(props.series.flatMap((one) => one.points), hoveredAt.value);

  if (anchor === null) return null;

  const values = props.series.flatMap((one) => {
    const there = one.points.find((point) => point?.at === anchor.at);

    return there === undefined || there === null ? [] : [`${one.label} ${props.format(there.value)}`];
  });

  return { at: anchor.at, place: Math.min(100, Math.max(0, (chartX(frame.value, anchor.at) / WIDTH) * 100)), values };
});

function point(event: PointerEvent): void {
  const box = plot.value?.getBoundingClientRect();

  if (box === undefined || box.width === 0) return;

  const share = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));

  hoveredAt.value = props.from + share * (props.to - props.from);
}
</script>
