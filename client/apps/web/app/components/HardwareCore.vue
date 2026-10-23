<!-- One core of the chip, a cell of the chip's drawing: the neutral colour fills it from its leading
     edge as far across as its use reaches, since a busy core is no danger (bmo-node's docs/hardware.md, 「The
     chip」); its name and use, its clock, and its temperature where a sensor reports one per core.
     Compact, only the fill stands. -->
<template>
  <div v-if="compact" class="relative min-h-0 bg-default">
    <div class="absolute inset-0 origin-left bg-inverted/20" :style="{ transform: fill }" />
  </div>
  <div v-else role="group" class="relative flex min-w-0 flex-1 flex-col bg-default px-2 py-1 text-sm" :aria-label="$t('hardware.aria.core_usage', { name: core.label, usage: percentText($t, core.usage), clock: mhzText($t, core.mhz) })">
    <div class="absolute inset-0 origin-left bg-inverted/20" :style="{ transform: fill }" aria-hidden="true" />
    <div class="relative flex items-center justify-between gap-2">
      <span class="font-medium">{{ core.label }}</span>
      <span class="tabular-nums">{{ percentText($t, core.usage) }}</span>
    </div>
    <span class="relative truncate tabular-nums text-toned">{{ mhzText($t, core.mhz) }}</span>
    <span v-if="core.celsius !== null" class="relative tabular-nums text-toned">{{ celsiusText($t, core.celsius) }}</span>
  </div>
</template>

<script setup lang="ts">
import { celsiusText, mhzText, percentText } from "~/domain/hardware";

import type { CoreView } from "#shared/types";

const props = withDefaults(defineProps<{ core: CoreView; compact?: boolean }>(), { compact: false });

// The use as how far across the cell its fill reaches, drawn as a scale so a reading lays nothing out
// again.
const fill = computed(() => `scaleX(${Math.round(Math.min(1, Math.max(0, props.core.usage ?? 0)) * 1000) / 1000})`);
</script>
