<template>
  <!-- An item waiting on the owner's answer says so with one chip, on its row beside its state and in the opened item
       beside its state (docs/web.md, 「A job standing on a question says so where the owner looks」). A question is open
       until it is settled, whether its time has run out or not, so the chip stands as long as one is unsettled. It is
       pressed to reach the card the question is answered on, so it is a chip of the row's own size and shape, coloured
       on hover and press like every pressed thing. -->
  <UBadge
    v-if="open"
    as="button"
    type="button"
    color="warning"
    variant="subtle"
    size="sm"
    icon="i-material-symbols-help-outline"
    class="cursor-pointer transition-colors hover:bg-warning/20 active:bg-warning/30"
    data-awaiting-question
    @click.stop="emit('press')"
  >{{ $t("todo.label.awaiting_question") }}</UBadge>
</template>

<script setup lang="ts">
import { questionState } from "~/domain/questions";

import type { JobQuestion } from "#shared/types";

interface Props {
  // The questions the item's jobs asked that are not yet settled.
  questions: JobQuestion[];
}

const props = defineProps<Props>();

const emit = defineEmits<{
  // The reader asked for the card the question is answered on.
  press: [];
}>();

const open = computed(() => props.questions.some((question) => questionState(question) === "open"));
</script>
