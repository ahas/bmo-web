<!-- Every card on the card arbiter screen's board as one bar on one shared MiB scale (docs/web.md, 「Monitor's
     services tab」), drawn in the form of ECharts' custom profile: a row per card, its capacity as the
     frame drawn first so what is left empty is the free room, each unit on it a block in its service's
     colour with its part's pattern, then the memory in use no unit accounts for: a service's own share
     in that service's colour, and what no service accounts for in a neutral tone. The node and card
     stand on the left, or over the bar where the chart is narrow, the memory used, in all and free on
     the right; the slider under it widens a stretch. -->
<template>
  <div ref="box" class="w-full" :style="{ height: `${height}px` }" role="img" :aria-label="summary" />
</template>

<script setup lang="ts">
import { CustomChart } from "echarts/charts";
import { DataZoomComponent, GridComponent, TooltipComponent } from "echarts/components";
import { graphic, init, use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";

import { chartBlocks, mibText, partDecal } from "~/domain/cards";
import { gpuShortName } from "~/domain/hardware";
import { countText } from "~/domain/numbers";

import type { BoardCard, Palette } from "~/domain/cards";
import type { EChartsType } from "echarts/core";

use([CustomChart, GridComponent, TooltipComponent, DataZoomComponent, CanvasRenderer]);

const props = defineProps<{ cards: BoardCard[]; labels: Map<string, string>; tone: Palette }>();
const { t } = useI18n();
const colorMode = useColorMode();

// A row holds the two lines of its labels, or a line over the bar; the axis and the slider take the rest.
// Below NARROW pixels the names leave the left column and stand over their bars, so the bars keep room.
const ROW = 52;
const NARROW = 480;
const BAR = 20;
const narrow = ref(false);
const FRAME = 88;
const height = computed(() => props.cards.length * ROW + FRAME);

const box = ref<HTMLElement | null>(null);
let chart: EChartsType | null = null;
let watching: ResizeObserver | null = null;

const summary = computed(() => [t("cards.label.chart"), ...props.cards.map((card) => `${rowLabel(card)} ${figures(card).replace("\n", " ")}`)].join(", "));

function rowLabel(card: BoardCard): string {
  const label = props.labels.get(card.node) ?? card.node;
  return card.many ? t("cards.label.card_of", { node: label, n: countText(card.index) }) : label;
}

function figures(card: BoardCard): string {
  const used = card.usedMiB === null ? t("hardware.label.unread") : countText(Math.round(card.usedMiB));
  return `${used} / ${mibText(t, card.totalMiB)}\n${t("cards.status.free_short", { m: mibText(t, card.freeMiB) })}`;
}

// The theme's colours as the canvas takes them: a CSS colour, a theme variable among them, painted once
// and read back as the red, green and blue it came to.
function paint(css: string): string {
  const probe = document.createElement("span");
  probe.style.color = css;
  probe.style.display = "none";
  document.body.append(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d")!;
  context.fillStyle = resolved;
  context.fillRect(0, 0, 1, 1);
  const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
  return `rgba(${red}, ${green}, ${blue}, ${(alpha ?? 255) / 255})`;
}

function escape(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;");
}

interface Area {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RenderApi {
  value(dimension: number): number;
  coord(point: number[]): number[];
  size(span: number[]): number[];
}

function option(): Record<string, unknown> {
  const theme = {
    text: paint("var(--ui-text)"),
    muted: paint("var(--ui-text-muted)"),
    border: paint("var(--ui-border)"),
    free: paint("var(--ui-bg-elevated)"),
    other: paint("var(--ui-bg-accented)"),
    ground: paint("var(--ui-bg)"),
  };
  const tones = new Map<string, string>();
  const tone = (service: string | null): string => {
    if (service === null) return theme.other;
    if (!tones.has(service)) tones.set(service, paint(`var(${props.tone(service).color})`));
    return tones.get(service)!;
  };
  const font = getComputedStyle(document.body).fontFamily;
  // Each side's labels in a column as wide as its longest line: the names starting on one line, the
  // figures ending on one.
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = `14px ${font}`;
  const widest = (lines: string[]) => Math.ceil(Math.max(0, ...lines.map((line) => measure.measureText(line).width)));
  const names = props.cards.map((card) => [rowLabel(card), card.name ? gpuShortName(card.name) : ""]);
  const sums = props.cards.map((card) => figures(card).split("\n"));
  const nameWidth = widest(names.flat());
  const sumWidth = widest(sums.flat());
  const keys = props.cards.map((card) => card.key);
  const most = Math.max(1, ...props.cards.map((card) => card.totalMiB ?? card.usedMiB ?? 0));
  const shown = chartBlocks(t, props.cards);
  const over = narrow.value;
  const bar = (params: { coordSys: unknown }, api: RenderApi, fill: string, stroke: string, decal: Record<string, unknown> | null) => {
    const start = api.coord([api.value(1), api.value(0)]);
    const end = api.coord([api.value(2), api.value(0)]);
    const band = api.size([0, 1])[1]!;
    const top = over ? start[1]! + band / 2 - BAR - 6 : start[1]! - (band * 0.6) / 2;
    const shape = graphic.clipRectByRect({ x: start[0]!, y: top, width: end[0]! - start[0]!, height: over ? BAR : band * 0.6 }, params.coordSys as Area);
    return shape ? { type: "rect", transition: ["shape"], shape, style: { fill, stroke, lineWidth: 1, ...(decal ? { decal } : {}) } } : null;
  };
  // Where the chart is narrow, the card's name stands over its frame, from the frame's left edge.
  const named = (params: { coordSys: unknown; dataIndex: number }, api: RenderApi) => {
    const frame = bar(params, api, theme.free, theme.border, null);
    if (!over) return frame;
    const [name, model] = names[params.dataIndex]!;
    const area = params.coordSys as Area;
    const top = api.coord([0, api.value(0)])[1]! - api.size([0, 1])[1]! / 2 + 4;
    const label = { type: "text", x: area.x, y: top, style: { text: model ? `${name} · ${model}` : name, fill: theme.text, font: `14px ${font}`, align: "left", verticalAlign: "top" } };
    return { type: "group", children: frame ? [frame, label] : [label] };
  };
  return {
    animationDuration: 300,
    textStyle: { fontFamily: font, fontSize: 14, color: theme.muted },
    grid: { left: 0, right: 0, top: 8, bottom: 48, containLabel: true },
    tooltip: {
      trigger: "item",
      confine: true,
      backgroundColor: theme.ground,
      borderColor: theme.border,
      textStyle: { fontFamily: font, fontSize: 14, color: theme.text },
      formatter: (item: { seriesIndex: number; dataIndex: number }) => {
        const card = item.seriesIndex === 0 ? props.cards[item.dataIndex] : props.cards[shown[item.dataIndex]?.row ?? -1];
        if (card === undefined) return "";
        const head = `${escape(rowLabel(card))}${card.name ? ` · ${escape(gpuShortName(card.name))}` : ""}`;
        if (item.seriesIndex === 0) return `${head}<br>${escape(figures(card)).replace("\n", "<br>")}`;
        const block = shown[item.dataIndex]!;
        return `${head}<br>${escape(block.name)} ${escape(mibText(t, block.end - block.start))}`;
      },
    },
    xAxis: {
      type: "value",
      min: 0,
      max: most,
      axisLabel: { formatter: (value: number) => countText(value), hideOverlap: true, color: theme.muted },
      splitLine: { lineStyle: { color: theme.border } },
    },
    yAxis: [
      {
        type: "category",
        data: keys,
        inverse: true,
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: {
          show: !over,
          color: theme.text,
          lineHeight: 18,
          formatter: (_: string, at: number) => {
            const [name, model] = names[at]!;
            return model ? `{name|${name}}\n{muted|${model}}` : `{name|${name}}`;
          },
          rich: {
            name: { width: nameWidth, align: "left", color: theme.text, fontFamily: font, fontSize: 14, lineHeight: 18 },
            muted: { width: nameWidth, align: "left", color: theme.muted, fontFamily: font, fontSize: 14, lineHeight: 18 },
          },
        },
      },
      {
        type: "category",
        data: keys,
        inverse: true,
        position: "right",
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: {
          lineHeight: 18,
          formatter: (_: string, at: number) => `{used|${sums[at]![0]}}\n{free|${sums[at]![1]}}`,
          rich: {
            used: { width: sumWidth, align: "right", color: theme.text, fontFamily: font, fontSize: 14, lineHeight: 18 },
            free: { width: sumWidth, align: "right", color: theme.muted, fontFamily: font, fontSize: 14, lineHeight: 18 },
          },
        },
      },
    ],
    dataZoom: [{
      type: "slider",
      xAxisIndex: 0,
      filterMode: "weakFilter",
      height: 20,
      bottom: 8,
      showDetail: false,
      brushSelect: false,
      borderColor: theme.border,
      fillerColor: "transparent",
      dataBackground: { lineStyle: { opacity: 0 }, areaStyle: { opacity: 0 } },
      handleStyle: { color: theme.free, borderColor: theme.muted },
      moveHandleStyle: { color: theme.other },
    }],
    series: [
      {
        id: "capacity",
        type: "custom",
        encode: { x: [1, 2], y: 0 },
        data: props.cards.map((card, row) => [row, 0, card.totalMiB ?? card.usedMiB ?? 0]),
        renderItem: named,
      },
      {
        id: "blocks",
        type: "custom",
        encode: { x: [1, 2], y: 0 },
        data: shown.map((block) => [block.row, block.start, block.end]),
        renderItem: (params: { coordSys: unknown; dataIndex: number }, api: RenderApi) => {
          const block = shown[params.dataIndex]!;
          return bar(params, api, tone(block.service), theme.ground, partDecal(block.pattern));
        },
      },
    ],
  };
}

function draw(): void {
  if (chart === null) return;
  chart.setOption(option());
}

onMounted(() => {
  if (box.value === null) return;
  chart = init(box.value, null, { renderer: "canvas" });
  narrow.value = box.value.clientWidth < NARROW;
  draw();
  watching = new ResizeObserver(([entry]) => {
    chart?.resize();
    const now = (entry?.contentRect.width ?? NARROW) < NARROW;
    if (now !== narrow.value) {
      narrow.value = now;
      draw();
    }
  });
  watching.observe(box.value);
});

onBeforeUnmount(() => {
  watching?.disconnect();
  chart?.dispose();
  chart = null;
});

watch(() => [props.cards, props.labels, props.tone], draw);
watch(() => colorMode.value, () => nextTick(draw));
watch(height, () => nextTick(() => chart?.resize()));
</script>
