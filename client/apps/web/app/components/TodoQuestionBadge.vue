<template>
  <!-- A job standing still behind a question says so on its row (docs/web.md, the TODO panel's section): a badge
       beside the state, so it is seen without opening the item. A question is open until it is settled or its time
       runs out, so the badge reads the panel's clock itself and a tick redraws it alone. -->
  <UBadge v-if="open" color="warning" variant="subtle" size="sm" icon="i-material-symbols-help-outline" data-awaiting-question>{{ $t("todo.label.awaiting_question") }}</UBadge>
</template>

<script setup lang="ts">
import { questionState } from "~/domain/questions";
import { useTodoClock } from "~/domain/todo-clock";

import type { JobQuestion } from "#shared/types";

interface Props {
  // The questions the item's jobs asked that are not yet settled.
  questions: JobQuestion[];
}

const props = defineProps<Props>();
const clock = useTodoClock();

const open = computed(() => props.questions.some((question) => questionState(question, clock.value) === "open"));
</script>
