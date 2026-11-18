<!-- A piece of hardware's charts (docs/web.md, 「Monitor screen」): the same figures twice — live,
     the last minute moving as each reading lands, and recorded, over the span this card has chosen
     in the dropdown beside the title, as a band from each point's lowest to its highest. Where the
     card is wide the two stand side by side, a figure's live chart level with its record; narrow, the
     record stands under. A row holds two charts from the width two fit side by side: several figures
     pair up within each column until the columns themselves stand side by side, and a single figure,
     having nothing to pair with, stands its live chart beside its record from that width. -->
<template>
  <div class="@container">
    <div class="grid gap-4" :class="figures.length > 1 ? '@xl:grid-cols-2' : '@sm:grid-cols-2'">
      <section class="@container flex min-w-0 flex-col gap-2" :aria-label="$t('hardware.title.live')">
        <div class="flex h-9 items-center">
          <h3 class="text-sm font-medium text-muted">{{ $t("hardware.title.live") }}</h3>
        </div>

        <div class="grid gap-x-4 gap-y-2" :class="figures.length > 1 ? '@sm:grid-cols-2' : ''">
          <HardwareChart
            v-for="figure in figures"
            :key="figure.key"
            :label="figure.label"
            :caption="lastText(figure)"
            :points="charting.loading.value ? null : livePoints(charting.live.points.value, figure.key)"
            :from="liveTo - LIVE_CHART_SECONDS"
            :to="liveTo"
            :gap="LIVE_GAP_SECONDS"
            :ceiling="figure.ceiling"
            :band="false"
            :format="figure.format"
            :time-text="formatTime"
            :empty="$t(UNREAD)"
            :summary="$t('hardware.aria.live_summary', { label: figure.label, last: lastText(figure) })"
          />
        </div>
      </section>

      <section class="@container flex min-w-0 flex-col gap-2" :aria-label="$t('hardware.title.record')">
        <div class="flex h-9 items-center justify-between gap-3">
          <h3 class="text-sm font-medium text-muted">{{ $t("hardware.title.record") }}</h3>
          <ChoiceSelect v-model="span" :items="spanItems" value-key="value" :content="{ align: 'end' }" size="sm" color="neutral" variant="subtle" class="w-24" :aria-label="$t('hardware.aria.span')" />
        </div>

        <div class="grid gap-x-4 gap-y-2" :class="figures.length > 1 ? '@sm:grid-cols-2' : ''">
          <HardwareChart
            v-for="figure in figures"
            :key="figure.key"
            :label="figure.label"
            :caption="extentText(figure)"
            :points="range === null ? (charting.ranges.initial(span) ? null : []) : rangePoints(range, figure.key)"
            :failure="range === null && !charting.ranges.initial(span) ? $t('hardware.error.record_failed') : null"
            :from="range?.at[0] ?? 0"
            :to="range === null ? 0 : range.at.at(-1)! + range.pointSeconds"
            :gap="range?.pointSeconds ?? 0"
            :ceiling="figure.ceiling"
            :band="true"
            :format="figure.format"
            :time-text="pointTime"
            :empty="$t('common.label.no_record')"
            :summary="$t('hardware.aria.range_summary', { label: figure.label, span: spanWord($t, span), range: extentText(figure) })"
          />
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { HISTORY_SPAN_NAMES, HISTORY_SPANS } from "#shared/hardware";
import { chartExtent, livePoints, rangePoints } from "~/domain/hardware-chart";
import { HARDWARE_CHARTING, HISTORY_FIRST_SPAN, LIVE_CHART_SECONDS, LIVE_GAP_SECONDS, spanWord, UNREAD } from "~/domain/hardware";
import { formatClock, formatDayClock, formatTime } from "bmo-ui/app/domain/time";

import type { HardwareFigure } from "~/domain/hardware";
import type { HistorySpan } from "#shared/types";

defineProps<{ figures: HardwareFigure[] }>();

const DAY_SECONDS = 86_400;
const { t } = useI18n();

const charting = inject(HARDWARE_CHARTING)!;

// Each card keeps its own span; every span a card has chosen is read, and read again, for all.
const span = ref<HistorySpan>(HISTORY_FIRST_SPAN);
const spanItems = computed(() => HISTORY_SPAN_NAMES.map((one) => ({ label: spanWord(t, one), value: one })));

watchEffect(() => charting.ranges.want(span.value));

const range = computed(() => charting.ranges.range(span.value));

// The live window ends at the last time the machine was asked, so it moves on while the machine
// does not answer and the line breaks there.
const liveTo = computed(() => charting.live.now.value);

function lastText(figure: HardwareFigure): string {
  const points = charting.live.points.value;

  for (let index = points.length - 1; index >= 0; index--) {
    const value = points[index]!.sample[figure.key];

    if (value !== undefined) return figure.format(value);
  }

  return "";
}

function extentText(figure: HardwareFigure): string {
  const extent = range.value === null ? null : chartExtent(rangePoints(range.value, figure.key));

  return extent === null ? "" : t("hardware.label.range", { min: figure.format(extent.min), max: figure.format(extent.max) });
}

// A recorded point is named by where its stretch begins: the clock within a day, with its seconds
// where a point is narrower than a minute, and the date past a day.
function pointTime(at: number): string {
  const pointSeconds = range.value?.pointSeconds ?? 0;
  const start = at - pointSeconds / 2;

  if (HISTORY_SPANS[span.value].seconds > DAY_SECONDS) return formatDayClock(start);

  return pointSeconds < 60 ? formatTime(start) : formatClock(start);
}
</script>
