<template>
  <!-- How a round made its answer and sent it, spread from its draft chip inside the bubble (docs/web.md, the room
       screen's draft chip), in a person's words: the rounds one line each, the slow one marked, each pressed for its
       answer; then the end; then what the round read from the brain, the brain list itself; then the send and the
       answer's checks. Nothing stands in the receiver's or the gate's own form. -->
  <div data-draft class="flex w-full min-w-0 flex-col gap-2">
    <ContentSkeleton v-if="props.loading" :rows="3" listClass="flex flex-col gap-1" :label="$t('room.status.draft_loading')">
      <div class="flex h-5 items-center gap-2">
        <SkeletonBar class="h-4 w-6 shrink-0" />
        <SkeletonBar class="h-4 min-w-0 flex-1" />
      </div>
    </ContentSkeleton>
    <p v-else-if="props.failure !== null" class="text-sm text-dimmed">{{ props.failure }}</p>
    <p v-else-if="props.rows !== null && rounds.length === 0 && end === null" class="text-sm text-dimmed">{{ $t("room.status.draft_none") }}</p>

    <template v-else>
      <ol v-if="rounds.length > 0" data-draft-rounds class="flex min-w-0 flex-col">
        <li v-for="round in rounds" :key="round.key" class="min-w-0" :data-draft-round="round.number" :data-slow="round.slow ? '' : undefined">
          <!-- Every round stands open (docs/web.md, the room screen's draft chip): its number, what was asked and
               what it answered, each readable without a press. -->
          <div class="flex w-full min-w-0 flex-wrap items-center gap-x-2 rounded-sm px-1 text-start text-sm text-muted tabular-nums">
            <span class="text-dimmed">{{ countText(round.number) }}</span>
            <span class="text-highlighted">{{ round.asked }}</span>
            <span :class="round.failed ? 'text-error' : ''">{{ round.decided }}</span>
            <span v-if="round.chars !== null">{{ $t("room.label.draft_chars", { n: countText(round.chars) }) }}</span>
            <span v-if="round.changed">{{ $t("room.label.draft_changed") }}</span>
            <span v-if="round.ms !== null" class="inline-flex items-center gap-1" :class="round.slow ? 'text-warning' : ''">
              <UIcon v-if="round.slow" name="i-material-symbols-schedule-outline" class="size-4" :aria-label="$t('room.label.draft_slow')" role="img" />
              {{ secondsText($t, round.ms) }}
            </span>
          </div>

          <!-- A round that rewrote the message stands its change as a diff: what it dropped, what it brought, and what
               it kept plain (docs/web.md, the room screen's draft chip). A round that changed nothing stands its answer
               once, with no marks. -->
          <pre
            v-if="round.answer !== null && round.diff.length === 0"
            data-draft-answer
            class="mt-1 mb-2 ms-7 font-sans text-sm whitespace-pre-wrap wrap-anywhere text-muted"
          >{{ round.answer }}</pre>
          <pre v-else-if="round.diff.length > 0" data-draft-diff class="mt-1 mb-2 ms-7 font-sans text-sm whitespace-pre-wrap wrap-anywhere"><span v-for="(line, at) in round.diff" :key="at" :data-diff="line.kind" :class="line.kind === 'removed' ? 'text-error/80 line-through' : line.kind === 'added' ? 'text-success' : 'text-muted'">{{ line.text }}
</span></pre>
        </li>
      </ol>

      <p v-if="end !== null" data-draft-end class="flex flex-wrap items-center gap-x-2 px-1 text-sm text-muted tabular-nums">
        <UIcon name="i-material-symbols-flag-outline" aria-hidden="true" class="size-4 shrink-0 text-dimmed" />
        <span class="text-highlighted" :class="end.withheld ? 'text-error' : ''">{{ end.outcome }}</span>
        <span v-if="end.ms !== null">{{ secondsText($t, end.ms) }}</span>
      </p>

      <div v-if="props.reads.length > 0" data-draft-reads class="flex min-w-0 flex-col">
        <p class="flex items-center gap-x-2 px-1 text-sm text-highlighted">
          <UIcon :name="CHIP_ICONS.brain" aria-hidden="true" class="size-4 shrink-0 text-dimmed" />
          {{ $t(CHIP_LABELS.brain) }}
        </p>
        <BrainReads :reads="props.reads" :chat-id="props.chatId" :agent="props.agent" class="ms-6" />
      </div>

      <ul v-if="sent.length > 0" data-draft-sent class="flex min-w-0 flex-col">
        <li v-for="line in sent" :key="line.id" class="flex min-w-0 flex-wrap items-center gap-x-2 px-1 text-sm text-muted tabular-nums">
          <UIcon :name="line.icon" aria-hidden="true" class="size-4 shrink-0 text-dimmed" />
          <span class="text-highlighted">{{ line.stage }}</span>
          <span :class="line.toneClass">{{ line.words }}</span>
          <span v-if="line.names !== ''" class="font-mono break-all">{{ line.names }}</span>
          <time class="text-dimmed">{{ line.at }}</time>
        </li>
      </ul>
    </template>
  </div>
</template>

<script setup lang="ts">
import { formatClock } from "bmo-ui/app/domain/time";

import { CHIP_ICONS, CHIP_LABELS } from "~/domain/chips";

import { draftDiff, endLine, gateRoundLines, roundLines } from "~/domain/draft-process";
import { stageLabel, verdictWords } from "~/domain/judgements";
import { countText, secondsText } from "~/domain/numbers";

import type { DraftRead, DraftRow, DraftSummary } from "#shared/drafting";
import type { Judgement } from "#shared/types";

interface Props {
  // The round log's rows, null until they are read.
  rows: DraftRow[] | null;
  loading: boolean;
  failure: string | null;
  // The gate's rows of the round's process, which stand for the rounds where the log holds none.
  drafts: Judgement[];
  // The answer's other verdicts: its send and the checks it went through on its way out.
  checks: Judgement[];
  summary: DraftSummary | null;
  reads: DraftRead[];
  chatId: number;
  agent: string | null;
}

const props = defineProps<Props>();
const { t } = useI18n();

const rounds = computed(() => {
  const logged = props.rows === null ? [] : roundLines(t, props.rows).map((round) => ({ ...round, diff: diffFor(props.rows ?? [], round) }));

  return logged.length > 0 ? logged : gateRoundLines(t, props.drafts).map((round) => ({ ...round, diff: [] }));
});

// A row's own change, as its diff: the answer it rewrote against what stood before it, where the round rewrote the
// message. A round that changed nothing has no diff, and stands its answer once.
function diffFor(rows: readonly DraftRow[], round: { key: string; answer: string | null }) {
  const row = rows.find((one) => String(one.id) === round.key);
  const before = row?.before ?? null;

  return row === undefined || before === null || round.answer === null || before === round.answer ? [] : draftDiff(before, round.answer);
}
const end = computed(() => endLine(t, props.rows, props.drafts, props.summary));


const TONE_CLASSES = { success: "text-success", error: "text-error", neutral: "" } as const;
const SEND_STAGE = "send";

const sent = computed(() =>
  [...props.checks]
    .sort((one, other) => one.createdAt - other.createdAt || one.id - other.id)
    .map((judgement) => {
      const words = verdictWords(t, judgement);

      return {
        id: judgement.id,
        icon: judgement.stage === SEND_STAGE ? "i-material-symbols-send-outline" : "i-material-symbols-rule",
        stage: stageLabel(t, judgement.stage),
        words: words.words,
        names: words.names.join(", "),
        toneClass: TONE_CLASSES[words.tone],
        at: formatClock(judgement.createdAt)
      };
    })
);
</script>
