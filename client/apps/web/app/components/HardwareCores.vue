<!-- One side of a group of cores beside its cache (bmo-node's docs/hardware.md, 「The chip」): the cores in
     columns of at most four, side by side and filled in the order they come, so a long run grows
     across rather than down. Every column has the same rows; a place a short last column leaves keeps
     its room unfilled. -->
<template>
  <div class="flex min-w-0 divide-x divide-default">
    <div v-for="(column, c) in columns" :key="c" class="grid min-w-0 flex-1 divide-y divide-default" :style="{ gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }">
      <HardwareCore v-for="core in column" :key="core.label" :core="core" :compact="compact" />
      <div v-for="n in rows - column.length" :key="`empty${n}`" class="bg-default" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CoreView } from "#shared/types";

const props = withDefaults(defineProps<{ cores: CoreView[]; compact?: boolean }>(), { compact: false });

const COLUMN = 4;

const rows = computed(() => Math.min(COLUMN, props.cores.length));
const columns = computed(() => Array.from({ length: Math.ceil(props.cores.length / COLUMN) }, (_, index) => props.cores.slice(index * COLUMN, (index + 1) * COLUMN)));
</script>
