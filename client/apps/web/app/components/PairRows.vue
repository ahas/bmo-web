<template>
  <!-- A group of a record's details as the console's one name and value list (docs/web.md, 「Name and value
       lists」): the name beside its value from the small breakpoint up and over it on a phone, no value cut. While the
       rows are read, the names known already stand and only their values wait as bars. -->
  <SkeletonStatus v-if="props.rows === null" as="div" :label="props.label">
    <dl class="pair-list gap-x-4 gap-y-2 py-3 text-sm">
      <template v-for="name in props.skeleton" :key="name">
        <dt class="text-muted">{{ name }}</dt>
        <dd class="flex h-5 items-center"><SkeletonBar class="h-4 w-1/2" /></dd>
      </template>
    </dl>
  </SkeletonStatus>
  <dl v-else class="pair-list gap-x-4 gap-y-2 py-3 text-sm">
    <template v-for="row in props.rows" :key="row.key">
      <dt class="text-muted">{{ row.label }}</dt>
      <dd class="flex min-w-0 flex-col break-words" :data-pair="row.key">
        <slot :name="row.key">
          <span class="text-highlighted">{{ row.value }}</span>
        </slot>
        <span v-if="row.under !== undefined" class="text-muted">{{ row.under }}</span>
      </dd>
    </template>
  </dl>
</template>

<script setup lang="ts">
import type { PairRow } from "~/domain/pair-rows";

interface Props {
  // The rows, or none while they are read.
  rows: readonly PairRow[] | null;
  // The names that stand while the values are read.
  skeleton: readonly string[];
  // What a screen reader is told while they are read.
  label: string;
}

const props = defineProps<Props>();
</script>
