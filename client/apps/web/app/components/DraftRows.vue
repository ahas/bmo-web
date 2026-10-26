<template>
  <!-- What a round's draft process did, spread from its chip inside the bubble (docs/web.md, the room screen's draft
       chip): the summary first — the gate's rows as it wrote them, or how the process ended — then one line per row
       of the round log, and under each question's line its answer, whole as it was written. Nothing here folds. -->
  <div class="flex w-full min-w-0 flex-col gap-2">
    <ul v-if="props.summary.length > 0" data-draft-summary class="flex flex-col gap-0.5">
      <li v-for="(line, index) in props.summary" :key="index" class="text-sm break-words text-muted">{{ line }}</li>
    </ul>

    <ContentSkeleton v-if="props.loading" :rows="3" listClass="flex flex-col gap-1" :label="$t('room.status.draft_loading')">
      <div class="flex h-5 items-center gap-2">
        <SkeletonBar class="h-4 w-6 shrink-0" />
        <SkeletonBar class="h-4 min-w-0 flex-1" />
      </div>
    </ContentSkeleton>
    <p v-else-if="props.failure !== null" class="text-sm text-dimmed">{{ props.failure }}</p>
    <p v-else-if="props.rows !== null && props.rows.length === 0" class="text-sm text-dimmed">{{ $t("room.status.draft_none") }}</p>

    <ol v-else-if="props.rows !== null" data-draft-rows class="flex flex-col gap-1">
      <li v-for="row in props.rows" :key="row.id" class="min-w-0">
        <!-- The row's facts on one line where they fit; its number, its question and its kind say which turn it
             was, and how it ended, how long its answer is, whether it changed and how long it took follow. -->
        <div class="flex flex-wrap items-baseline gap-x-2 text-sm text-dimmed tabular-nums">
          <span class="text-muted">{{ countText(row.number) }}</span>
          <span v-if="row.question !== ''" class="font-mono break-all text-highlighted">{{ row.question }}</span>
          <span>{{ draftKindText($t, row.kind) }}</span>
          <span :class="row.outcome === 'failed' || row.outcome === 'withheld' ? 'text-error' : ''">{{ draftOutcomeText($t, row.outcome, row.kind) }}</span>
          <span v-if="row.kind !== 'end'">{{ $t("room.label.draft_chars", { n: countText(row.answerChars) }) }}</span>
          <span v-if="row.changed && row.kind !== 'end'">{{ $t("room.label.draft_changed") }}</span>
          <span v-if="row.kind !== 'end'">{{ countText(row.ms) }}ms</span>
        </div>

        <div v-if="draftAnswerShown(row)" data-draft-answer class="mt-1 flex min-w-0 flex-col gap-0.5">
          <p class="text-sm text-dimmed">{{ $t("room.label.draft_answer") }}</p>
          <pre class="font-sans text-sm whitespace-pre-wrap wrap-anywhere text-muted">{{ row.answer }}</pre>
        </div>
      </li>
    </ol>
  </div>
</template>

<script setup lang="ts">
import { draftAnswerShown, draftKindText, draftOutcomeText } from "~/domain/draft-process";
import { countText } from "~/domain/numbers";

import type { DraftRow } from "#shared/drafting";

interface Props {
  // The summary's lines, said before the rows are read.
  summary: string[];
  // The round log's rows, null until they are read.
  rows: DraftRow[] | null;
  loading: boolean;
  failure: string | null;
}

const props = defineProps<Props>();
</script>
