<template>
  <!-- The changed lines as the terminal draws them: the number a line had, the number it has, its
       mark and its text. A long line wraps inside the diff, so the log never scrolls sideways. -->
  <div class="flex flex-col font-mono text-sm" :class="props.bare ? '' : 'overflow-hidden rounded-md border border-default py-1'">
    <template v-for="(row, index) in props.view.rows" :key="index">
      <div v-if="row.kind === 'gap'" class="px-2 text-dimmed" :aria-label="$t('agents.label.diff_omitted')">⋯</div>
      <div v-else class="flex gap-2 px-2" :class="tone(row.mark)">
        <span class="shrink-0 text-end tabular-nums text-dimmed" :style="numberWidth">{{ row.old ?? "" }}</span>
        <span class="shrink-0 text-end tabular-nums text-dimmed" :style="numberWidth">{{ row.new ?? "" }}</span>
        <span class="shrink-0" :class="markTone(row.mark)">{{ row.mark }}</span>
        <span class="min-w-0 grow break-words whitespace-pre-wrap">{{ row.text }}</span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { DiffMark, DiffView } from "~/domain/patch";

interface Props {
  view: DiffView;
  // Drawn inside a call's own block, which is the box: no border of its own.
  bare?: boolean;
}

const props = withDefaults(defineProps<Props>(), { bare: false });

// Both number columns are as wide as the largest number either holds, so the marks stand in one
// column down the whole diff.
const numberWidth = computed(() => {
  const largest = props.view.rows.reduce(
    (most, row) => (row.kind === "line" ? Math.max(most, row.old ?? 0, row.new ?? 0) : most),
    0
  );

  return { width: `${String(largest).length}ch` };
});

function tone(mark: DiffMark): string {
  return mark === "+" ? "bg-success/10" : mark === "-" ? "bg-error/10" : "";
}

function markTone(mark: DiffMark): string {
  return mark === "+" ? "text-success" : mark === "-" ? "text-error" : "text-dimmed";
}
</script>
