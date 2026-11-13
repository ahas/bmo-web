<template>
  <!-- A long wait the running job marked for itself: what it waits on, the target and what is left of the time it
       gave. The same mark `bun scripts/running.ts` prints. It is a line of the row, with no hover or press of its own:
       the row opens by its title. It reads the panel's clock itself, so a tick redraws this line alone, and only once
       its words change (docs/web.md, the TODO panel's section). -->
  <p class="flex items-start gap-1 pt-1 text-sm break-words" :class="overdue ? 'badge-ink text-warning' : 'text-muted'">
    <UIcon name="i-material-symbols-hourglass-top" class="mt-0.5 size-4 shrink-0" />
    <SearchText class="min-w-0" :text="line" :query="query" />
  </p>
</template>

<script setup lang="ts">
import { useTodoClock } from "~/domain/todo-clock";
import { waitingLine, waitingOverdue } from "~/domain/todos";

import type { TodoItem } from "#shared/types";

interface Props {
  item: TodoItem;
  query: string;
}

const props = defineProps<Props>();
const { t } = useI18n();
const clock = useTodoClock();

const line = computed(() => waitingLine(t, props.item, clock.value) ?? "");
const overdue = computed(() => waitingOverdue(props.item, clock.value));
</script>
