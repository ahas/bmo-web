<template>
  <!-- An item's form block, where an approval form puts its approval box (docs/web.md, the TODO modal's form block):
       the approval line, each cell its name over who gave it and when, and under it whatever the dialog stands as the
       document's fields. One box: the cells inside it are parted by lines and a tint, never boxed again. -->
  <section class="overflow-hidden rounded-lg border border-default text-sm" :aria-label="$t('todo.aria.item_form')" data-item-form>
    <ol class="grid grid-cols-3 divide-x divide-default" data-item-approvals>
      <li v-for="cell in props.cells" :key="cell.key" class="flex min-w-0 flex-col" :data-approval-cell="cell.key">
        <span class="flex h-8 items-center justify-center border-b border-default bg-muted text-muted">{{ cell.label }}</span>
        <SkeletonStatus v-if="cell.who === null" as="span" class="flex h-12 items-center justify-center px-2" :label="$t('todo.status.approvals_loading')">
          <SkeletonBar class="h-4 w-2/3" />
        </SkeletonStatus>
        <span v-else class="flex min-h-12 flex-col items-center justify-center px-2 py-1 text-center">
          <span class="max-w-full break-words" :class="TONES[cell.tone]">{{ cell.who }}</span>
          <span v-if="cell.at !== null" class="tabular-nums text-muted">{{ formatDayClock(cell.at) }}</span>
        </span>
      </li>
    </ol>

    <slot />
  </section>
</template>

<script setup lang="ts">
import { formatDayClock } from "bmo-ui/app/domain/time";

import type { ApprovalCell } from "~/domain/todos";

interface Props {
  cells: readonly ApprovalCell[];
}

const props = defineProps<Props>();

// The chat agent's recommendation wears its own colour, as the approval record draws it, so it is never read as an
// approval; an approval still awaited stands in the warning colour.
const TONES: Record<ApprovalCell["tone"], string> = {
  given: "text-highlighted",
  recommended: "badge-ink text-info",
  awaiting: "text-warning",
  quiet: "text-muted"
};
</script>
