<template>
  <!-- A record's fields as a form's cells, two to a row: each name in a tinted cell beside its value, the cells parted
       by lines, the way a paper form lays its fields out (docs/web.md, 「Name and value lists」: a form's label and
       field keeps its own columns). It takes the rows and the slots a name and value list takes, so a screen stands
       the same fields either way; a row's muted line stands in its value's tooltip, since a cell holds one line. -->
  <dl class="grid grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] border-t border-default" data-field-grid>
    <template v-for="(row, index) in props.rows" :key="row.key">
      <dt class="flex items-center bg-muted px-2 py-1 text-muted" :class="cellLines(index, index % 2 === 1)">{{ row.label }}</dt>
      <!-- The value cell is the shared tooltip's own box, so the grid keeps its cells; what a cell holds may act on a tap,
           so a finger rests on it to read the note. -->
      <HintTip
        as="dd"
        :text="row.under"
        :disabled="row.under === undefined"
        press
        class="flex min-h-10 min-w-0 items-center break-words border-s border-default px-2 py-1"
        :class="[cellLines(index, false), index % 2 === 0 && index === props.rows.length - 1 ? 'col-span-3' : '']"
        :data-pair="row.key"
      >
        <slot :name="row.key">
          <span class="text-highlighted">{{ row.value }}</span>
        </slot>
      </HintTip>
    </template>
  </dl>
</template>

<script setup lang="ts">
import type { PairRow } from "~/domain/pair-rows";

interface Props {
  rows: readonly PairRow[];
}

const props = defineProps<Props>();

// A cell under the first row is parted from the row above by a line, and the second pair of a row from the first. A
// pair left alone on the last row takes the row's width, so no empty cell stands beside it.
function cellLines(index: number, second: boolean): string[] {
  return [index >= 2 ? "border-t border-default" : "", second ? "border-s border-default" : ""];
}
</script>
