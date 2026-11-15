<template>
  <!-- What one row's traffic divided into, as one track cut into the four kinds with the parts
       named under it. The four are a true partition of what the row's total counts, so the
       widths mean exactly what they look like and no sentence under the bar has to say so — the
       track running to its end beside the total is that sentence. Where the track stops short,
       the line under the list saying how much was written before the kinds were kept apart is
       already the answer to why.

       A row that states none of the four has no bar at all and stands as the figures alone: four
       dashes, which is what a row that was never measured has to say for itself. -->
  <UProgressGroup
    v-if="bar !== null"
    data-usage-split
    :items="items"
    :max="bar.max"
    :size="BAR_SIZE"
    :ui="legendLook"
  >
    <template #item-trailing="{ item }">
      {{ item.text }}
    </template>
  </UProgressGroup>

  <div v-else class="flex flex-wrap gap-x-2 text-sm">
    <span v-for="(kind, at) in kindFigures($t, tally)" :key="at" class="flex items-center gap-1">
      <span v-if="kind.label !== ''" class="text-dimmed">{{ kind.label }}</span>
      <span class="tabular-nums text-muted">{{ kind.text }}</span>
    </span>
  </div>
</template>

<script setup lang="ts">
import { BAR_SIZE, FOLDED_LEGEND, INLINE_LEGEND } from "bmo-ui/app/domain/bars";
import { kindFigures, usageBar } from "~/domain/usage";

import type { TokenSplit } from "#shared/types";

interface Props {
  // Whatever the row is a row of — a model, an agent — as long as it carries the four kinds and
  // the total they are shares of. Which of those a screen is showing is the screen's business;
  // what a row's traffic divided into is drawn the same way wherever the row came from.
  tally: TokenSplit & { tokens: number };
  // Whether the parts are named under the track at every width, or only where there is room for
  // four of them across a line. A block standing on its own has that room; a row of a list on a
  // phone has not, and there the track stands alone.
  legend?: "inline" | "folded";
}

const props = defineProps<Props>();

const { t } = useI18n();
const bar = computed(() => usageBar(t, props.tally));

// The look, chosen from the two the console keeps rather than written here: which of them a bar
// wears is the business of the place it stands in, and what either of them looks like is not.
const legendLook = computed(() => (props.legend === "folded" ? FOLDED_LEGEND : INLINE_LEGEND));

// A segment as the group takes it: the tokens are the width, the kind's word is what the legend
// names it by, and its figure rides along for the legend to read out in place of the percent the
// group would otherwise print. The figure is what a reader of this popover came for — a percent
// of a row is a shape they can already see in the bar.
const items = computed(() =>
  (bar.value?.segments ?? []).map((one) => ({
    label: one.figure.label,
    value: one.tokens,
    color: one.color,
    text: one.figure.text
  }))
);
</script>
