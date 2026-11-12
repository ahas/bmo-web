<template>
  <!-- The foot of a bubble: its meta line, and under it whatever a chip of that line spreads, both
       inside the bubble (docs/web.md, the room screen's meta line section, the room screen's chip line section). The line is one row for a message and for
       the turn still running alike, drawn by this one part. It stands in the bubble's own flow: at
       the end of the words' last line where it is their time and marks alone and that line leaves it
       room, else on a line of its own under them; over the foot of a picture with nothing under it,
       it stands on a ground of its own. -->
  <div v-if="shown || spreading" :class="frame">
    <!-- Everything on the line is one size, one line height and one colour on one middle line, and
         its figures are tabular. The turn's record, what it spent and what it wrote down stand at the
         leading end; how long the room waited, the verdict mark, the time and the send mark at the
         trailing end. The line breaks between its two ends before it breaks among the chips: where
         they do not fit on one line, the chips keep a line of their own and the trailing end takes the
         line under them, and the chips wrap among themselves only where they alone are wider than the
         bubble.
         How full the session stood stands first, where it was placed, and arrives with the answer; the
         turn's record stands beside it, its parts a mark and a word each; what the turn spends and
         writes down follows, and the full reading arrives last. A chip that arrives late standing
         first would push every chip already there sideways the moment it landed, and a reader watching
         a turn would see the line taken away and built again rather than filled. -->
    <div data-meta :data-meta-inline="inline ? '' : undefined" class="flex min-w-0 flex-wrap items-end gap-(--chat-meta-gap) text-sm leading-(--chat-meta-line) whitespace-nowrap tabular-nums" :class="lineLook">
      <span v-if="chipped" data-meta-lead class="flex min-w-0 flex-wrap items-center gap-(--chat-meta-gap)">
        <!-- What the message's own row puts first on its line: its reactions, which stand where the messenger puts
             them, at the leading end of the time's line. -->
        <slot name="lead" />

        <!-- A message the record holds under the thinking kind says what it is here, where an answer's chips stand;
             it carries none of them (docs/web.md, the room screen's thinking messages). -->
        <span v-if="props.thinking" data-thinking-label class="inline-flex h-(--chat-meta-line) items-center gap-1">
          <UIcon :name="THINKING_ICON" class="size-4 shrink-0" aria-hidden="true" />
          {{ $t("room.label.thinking_line") }}
        </span>

        <!-- What the round spent and did is read after the page, and its place at the leading end is kept by one
             chip-sized placeholder until it lands (docs/web.md, the room screen's chip line). -->
        <SkeletonStatus v-if="props.figuring" data-figures-loading class="inline-flex" :label="$t('room.status.figures_loading')">
          <SkeletonBar class="h-(--chat-meta-line) w-14 rounded-sm" />
        </SkeletonStatus>

        <!-- How full the session stood, once the turn has ended and only where the session reported it. It spreads
             nothing, so it stands where the owner placed it, before the record. -->
        <ContextChip v-if="context !== null" :ratio="context" />

        <!-- The turn's own record, as one press: what it read from the brain, what it called, how its answer was
             drafted and how the round was judged, each a mark and a word in the one button (docs/web.md, the room
             screen's chip line). Pressing it spreads the whole record in the order the turn made it. -->
        <LineChip v-if="recorded" data-record-chip class="h-auto!" :label="$t('room.label.chip_record')" :open="recordOpen" @toggle="toggleRecord">
          <span class="inline-flex flex-wrap items-center gap-2">
            <span v-if="brainCounted" data-record-brain class="inline-flex items-center gap-1">
              <UIcon :name="CHIP_ICONS.brain" role="img" :aria-label="$t(CHIP_LABELS.brain)" class="size-4" />
              <span class="inline-flex items-center">
                <RollingNumber v-if="counts.held > 0 || fresh === 0" :value="counts.held" />
                <span v-if="fresh > 0" data-brain-new class="inline-flex items-center text-success">+<RollingNumber :value="fresh" /></span>
              </span>
            </span>
            <span v-if="counts.tools > 0" data-record-tools class="inline-flex items-center gap-1">
              <UIcon :name="CHIP_ICONS.tools" role="img" :aria-label="$t(CHIP_LABELS.tools)" class="size-4" />
              <RollingNumber :value="counts.tools" />
            </span>
            <span v-if="drafted" data-record-drafts class="inline-flex items-center gap-1">
              <UIcon :name="CHIP_ICONS.drafts" role="img" :aria-label="$t(CHIP_LABELS.drafts)" class="size-4" />
              <RollingNumber :value="draftCount" />
            </span>
            <span v-if="judgedRecorded" data-record-verdicts class="inline-flex items-center gap-1">
              <UIcon :name="CHIP_ICONS.verdicts" role="img" :aria-label="$t(CHIP_LABELS.verdicts)" class="size-4" />
            </span>
          </span>
        </LineChip>

        <!-- What the answer wrote, filling while the turn runs and the round's own figure afterwards. -->
        <TokenChip v-if="chip !== null" :chip="chip" :open="spendOpen" @toggle="spendOpen = !spendOpen" />

        <!-- What the turn wrote down, carried whole on the answer, so it spreads without a read. -->
        <LineChip v-if="records.length > 0" :icon="CHIP_ICONS.records" :label="$t(CHIP_LABELS.records)" :open="recordsOpen" @toggle="recordsOpen = !recordsOpen">
          <RollingNumber :value="records.length" />
        </LineChip>

        <!-- The line's full reading, where one stands. It comes after the answer has gone out, so it
             stands last. Its mark turns to the error colour where the reading could not be made;
             pressing it spreads the player, or says no reading was made where there is none to play. -->
        <LineChip
          v-if="props.briefing !== null"
          :icon="briefingLook.icon"
          :icon-class="briefingLook.iconClass"
          :label="$t(briefingLook.label)"
          :open="briefingOpen"
          @toggle="toggleBriefing"
        />
      </span>

      <span ref="trail" data-meta-trail class="ms-auto flex shrink-0 items-center gap-(--chat-meta-gap)">
        <!-- How long the room waited for the answer, which arrives with it, so it never pushes a chip;
             it travels with the time it is measured to. -->
        <slot name="took" />

        <!-- The verdict mark alone, beating while the message is being judged and then coloured by how
             the whole of it went, named by its tooltip; it presses nothing, since what judged the round
             stands in the answer's record (docs/web.md, the room screen's verdicts). A mark that comes
             with its verdicts already settled while the message is on screen pops in; a message read in
             with it stands it at once. A message sent a moment ago keeps the mark's room, so the time
             beside it does not move when it comes. -->
        <HintTip
          v-if="marked"
          data-verdict-mark
          :text="$t(markLook.label)"
          :side="over ? 'top' : undefined"
          class="flex h-(--chat-meta-line) items-center"
          role="img"
          :aria-label="$t(markLook.label)"
        >
          <UIcon :name="CHIP_ICONS.verdicts" class="size-4 shrink-0" :class="markClass" />
        </HintTip>
        <span v-else-if="roomForMark && props.clock" aria-hidden="true" class="invisible h-(--chat-meta-line) w-6" />

        <!-- The time and the send mark, which are the message's own. -->
        <slot name="clock" />
      </span>
    </div>

    <!-- What the chips spread is an item of the bubble's wrapping row, which would otherwise take
         its longest unbroken word as its least width and stand wider than the bubble that cuts it.
         Held to the bubble's width, a long word wraps there and a code block or table scrolls inside
         its own box. -->
    <div v-if="spreading" data-spread class="flex min-w-0 basis-full flex-col gap-3 border-t border-default pt-2">
      <template v-if="briefingOpen && props.briefing !== null">
        <p v-if="briefingRefused !== ''" role="alert" class="text-sm text-error">{{ briefingRefused }}</p>
        <!-- The player waits for its play press, and folds itself a moment after it played to its end unless the reader
             paused or moved it along (docs/web.md, the room screen's voice briefing chip). The sound's own events do
             not bubble, so they are heard on their way down. -->
        <div
          v-else-if="briefingState === 'ready' && briefingSrc !== null"
          class="w-80 max-w-full"
          @pause.capture="readingPaused"
          @seeking.capture="readingMoved"
          @ended.capture="readingEnded"
        >
          <AudioPlayer
            :src="briefingSrc"
            :download="`${briefingSrc}?as=download`"
            :name="$t('room.label.chip_briefing')"
            :size="null"
            data-briefing-reading
          />
        </div>
        <p v-else-if="briefingState === 'failed'" class="text-sm text-error">{{ $t("briefing.error.not_made") }}</p>
        <p v-else-if="briefingState === 'stopped'" class="text-sm text-dimmed">{{ $t("briefing.status.stopped") }}</p>
        <p v-else-if="briefingState === 'ready'" class="text-sm text-dimmed">{{ $t("room.label.unreceivable") }}</p>
        <p v-else class="text-sm text-dimmed">{{ $t("briefing.status.making") }}</p>
      </template>

      <!-- The turn's whole record, in the order the turn made it: what it was handed from the brain, every call it
           made and what came back, each question of its draft process, the round's judgement, and the situation note
           as that round read it. Nothing here is cut on a line and nothing scrolls in a box of its own; the bubble's
           width wraps what is long and the panel grows by what it holds. -->
      <div v-if="recordOpen" data-record class="flex w-full min-w-0 flex-col gap-3">
        <ContentSkeleton v-if="loadingRecord" :rows="3" listClass="flex flex-col gap-1" :label="$t('room.status.records_loading')">
          <div class="flex h-5 items-center gap-2">
            <SkeletonBar class="size-4 shrink-0 rounded-sm" />
            <SkeletonBar class="h-4 min-w-0 flex-1" />
          </div>
        </ContentSkeleton>
        <p v-else-if="recordFailure !== null" class="text-sm text-dimmed">{{ recordFailure }}</p>
        <template v-else>
          <p v-if="timeline.length === 0" class="text-sm text-dimmed">{{ $t("room.status.no_records_left") }}</p>

          <template v-for="(entry, index) in timeline" :key="index">
            <BrainReads v-if="entry.kind === 'reads'" :reads="entry.reads" :chat-id="props.chatId" :agent="done?.agent ?? null" class="w-full" />

            <TurnActions v-else-if="entry.kind === 'actions'" :actions="entry.actions" />

            <AgentToolCall v-else-if="entry.kind === 'call'" :row="entry.row" />

            <!-- A line the turn wrote and then went on working, at its moment among the calls: one muted line of
                 words that wraps, no message of its own. -->
            <p v-else-if="entry.kind === 'said'" data-record-said class="px-1 text-sm text-muted whitespace-normal break-keep wrap-anywhere">{{ entry.text }}</p>

            <TurnOpening v-else-if="entry.kind === 'opening'" :instructions="entry.opening.instructions" :chat-id="props.chatId" class="w-full" />

            <!-- One question of the round's draft process, with what it was asked, what it answered, and the answer
                 or the change it wrote, whole. -->
            <div v-else-if="entry.kind === 'draft'" data-record-draft class="flex w-full min-w-0 flex-col gap-1">
              <div class="flex w-full min-w-0 flex-wrap items-center gap-x-2 px-1 text-sm text-muted tabular-nums">
                <span class="text-dimmed">{{ countText(entry.line.number) }}</span>
                <span class="text-highlighted">{{ entry.line.asked }}</span>
                <span :class="entry.line.failed ? 'text-error' : ''">{{ entry.line.decided }}</span>
                <span v-if="entry.line.chars !== null">{{ $t("room.label.draft_chars", { n: countText(entry.line.chars) }) }}</span>
                <span v-if="entry.line.changed">{{ $t("room.label.draft_changed") }}</span>
                <span v-if="entry.line.ms !== null" class="inline-flex items-center gap-1" :class="entry.line.slow ? 'text-warning' : ''">
                  <UIcon v-if="entry.line.slow" name="i-material-symbols-schedule-outline" class="size-4" :aria-label="$t('room.label.draft_slow')" role="img" />
                  {{ secondsText($t, entry.line.ms) }}
                </span>
                <time class="ms-auto text-dimmed">{{ formatClock(entry.at) }}</time>
              </div>
              <pre v-if="entry.diff.length === 0 && entry.line.answer !== null" data-draft-answer class="mb-1 ms-7 font-sans text-sm whitespace-pre-wrap wrap-anywhere text-muted">{{ entry.line.answer }}</pre>
              <pre v-else-if="entry.diff.length > 0" data-draft-diff class="mb-1 ms-7 font-sans text-sm whitespace-pre-wrap wrap-anywhere"><span v-for="(line, at) in entry.diff" :key="at" :data-diff="line.kind" :class="line.kind === 'removed' ? 'text-error/80 line-through' : line.kind === 'added' ? 'text-success' : 'text-muted'">{{ line.text }}
</span></pre>
            </div>

            <p v-else-if="entry.kind === 'end'" data-draft-end class="flex flex-wrap items-center gap-x-2 px-1 text-sm text-muted tabular-nums">
              <UIcon name="i-material-symbols-flag-outline" aria-hidden="true" class="size-4 shrink-0 text-dimmed" />
              <span class="text-highlighted" :class="entry.withheld ? 'text-error' : ''">{{ entry.outcome }}</span>
              <span v-if="entry.ms !== null">{{ secondsText($t, entry.ms) }}</span>
              <time v-if="entry.at !== null" class="ms-auto text-dimmed">{{ formatClock(entry.at) }}</time>
            </p>

            <!-- One gate's card, as it judged the round: what it decided, the names it chose, each line its model
                 read, what it narrowed and kept, the roads it walked, and its original verdict whole. -->
            <div v-else-if="entry.kind === 'judgement'" class="w-full" data-record-card>
              <div class="flex flex-wrap items-center gap-2 text-sm">
                <span class="font-medium text-highlighted">{{ stageLabel($t, entry.judgement.stage) }}</span>
                <time class="text-dimmed">{{ formatStamp(entry.judgement.createdAt) }}</time>
                <span v-if="tookOf(entry.judgement) !== ''" class="text-dimmed tabular-nums">{{ tookOf(entry.judgement) }}</span>
              </div>

              <p data-card-words class="mt-1 flex flex-wrap items-baseline gap-x-2 text-sm break-words">
                <span :class="TONE_CLASSES[entry.view.words.tone]">{{ entry.view.words.words }}</span>
                <span v-if="entry.view.words.names.length > 0" class="font-mono break-all text-muted">{{ entry.view.words.names.join(", ") }}</span>
              </p>

              <ol v-if="(entry.judgement.lines ?? []).length > 0" data-judgement-lines class="mt-2 flex flex-col gap-1">
                <li v-for="(one, at) in entry.judgement.lines" :key="at" class="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm">
                  <span class="min-w-0 flex-1 font-mono break-words whitespace-pre-wrap text-muted">{{ one.line }}</span>
                  <span class="shrink-0" :class="lineKept(one.answer) ? 'text-success' : 'text-dimmed'" data-line-answer>{{ lineAnswer($t, one.answer) }}</span>
                </li>
              </ol>

              <template v-if="entry.view.narrowed !== null">
                <p v-if="entry.view.narrowed.itemRule" class="mt-1 text-sm text-dimmed">{{ $t("room.label.offer_item_rule") }}</p>
                <p class="mt-1 text-sm text-dimmed tabular-nums">
                  {{ $t("room.label.offer_counts", { held: countText(entry.view.narrowed.held), left: countText(entry.view.narrowed.left) }) }}
                </p>
              </template>

              <p v-if="entry.view.kept !== null" data-kept class="mt-1 text-sm text-dimmed tabular-nums">
                {{ $t("room.label.offer_kept", { item: countText(entry.view.kept.item), keyword: countText(entry.view.kept.keyword), word: countText(entry.view.kept.word), person: countText(entry.view.kept.person), recent: countText(entry.view.kept.recent) }) }}
              </p>

              <ul v-if="roadsOf(entry.judgement).length > 0" class="mt-2 flex flex-col gap-1">
                <li v-for="road in roadsOf(entry.judgement)" :key="road.id" class="flex flex-wrap items-baseline gap-2 text-sm text-dimmed">
                  <span class="font-mono break-all text-muted">{{ roadName(road) }}</span>
                  <span class="flex items-baseline gap-2 whitespace-nowrap">
                    <span>{{ roadOutcome($t, road.outcome) }}</span>
                    <span class="tabular-nums">{{ secondsText($t, road.ms) }}</span>
                  </span>
                </li>
              </ul>

              <UChatTool :text="$t('common.label.original')" chevron="leading" data-card-original class="mt-1">
                <pre class="font-mono text-sm whitespace-pre-wrap wrap-anywhere text-dimmed">{{ originalOf(entry.judgement) }}</pre>
              </UChatTool>
            </div>

            <!-- The room's situation note as the round read it, and whether the round wrote it afresh. -->
            <p v-else-if="entry.kind === 'situation'" data-situation class="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm">
              <span class="shrink-0 text-muted">{{ $t("room.label.situation") }}</span>
              <span class="min-w-0 break-words text-highlighted">{{ entry.situation.text }}</span>
              <UBadge v-if="entry.situation.changed" color="primary" variant="subtle" size="sm" data-situation-changed>{{ $t("room.label.situation_changed") }}</UBadge>
            </p>
          </template>

          <!-- A turn longer than the page the log answers, or than the picture the bot holds, comes back short of its
               own count; the rest stands on the agent's own screen rather than being quietly left out here. -->
          <RollingSentence v-if="missed > 0" tag="p" class="text-sm text-dimmed" :keypath="'room.status.more_records'" :figures="{ n: missed }" />
        </template>
      </div>

      <TurnRecords v-if="recordsOpen" :records="records" class="w-full" />

      <AgentTurnFigures v-if="chip !== null && spendOpen" :lines="chip.lines" :boxed="false" class="w-full" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { briefingChip, CHIP_ICONS, CHIP_LABELS, verdictChip } from "~/domain/chips";
import { briefingSoundUrl, mediaUrl } from "~/domain/player";
import { BRIEFING_SETTLE_MS } from "~/domain/briefing";
import { readingStateOf } from "#shared/voice-briefings";
import { failureText } from "bmo-ui/app/domain/errors";
import { useBotEvents } from "~/domain/events";
import { readRunLines } from "~/domain/log";
import { countText, secondsText } from "~/domain/numbers";
import { decidesMessage, judgesAnswer, keptOffer, lineAnswer, lineKept, narrowedOffer, roadName, roadOutcome, stageLabel, verdictState, verdictWords } from "~/domain/judgements";
import { brainActions, progressLines, turnActions } from "~/domain/working";
import { formatClock, formatStamp } from "bmo-ui/app/domain/time";
import { roundChip } from "~/domain/turns";
import { draftAsked, draftDiff, draftRound, endLine, gateRoundLines, roundLines, splitDraftJudgements } from "~/domain/draft-process";

import type { AgentLogLine, BriefingReading, Judgement, JudgementRoad, MessageBriefing, RoundSpend, TurnAction, TurnActionsRef, TurnRecord } from "#shared/types";
import type { LogRow } from "~/domain/log";
import type { DraftDiffLine, RoundLine } from "~/domain/draft-process";
import type { DraftRead, DraftRow, DraftSummary } from "#shared/drafting";
import type { BriefingChip, VerdictChip } from "~/domain/chips";
import type { SpendChip } from "~/domain/turns";
import type { Situation } from "#shared/types";
import type { LiveTurn } from "~/domain/working";

interface Props {
  judgements: Judgement[];
  // What the round this message ended cost, on the message that ended it.
  spend?: RoundSpend | null;
  // Where what that turn did is kept, on the same message.
  actionsAt?: TurnActionsRef | null;
  // How the round's draft process made the answer, on the same message.
  drafts?: DraftSummary | null;
  // The round's whole record as the page reads it, for the answer's one record press: the gates that read the
  // person's message and the send and checks of the answer alike.
  roundJudgements?: Judgement[];
  // The room's situation note as that round read it, spread in the answer's record press.
  roundSituation?: Situation | null;
  // The turn still running, where this line belongs to one: what it has done so far and what it
  // has spent so far, both of which it carries itself rather than leaving in a record to read.
  live?: LiveTurn | null;
  // The room the row stands in and the line itself, which its reading is asked for and served by.
  chatId?: number;
  messageId?: number;
  // Where the line's full reading stands.
  briefing?: MessageBriefing | null;
  // When the message was sent, in seconds: a message sent a moment ago may still be judged.
  sentAt?: number;
  // Whether the message is being judged right now.
  judging?: boolean;
  // Whether the line closes a picture with nothing under it, so it may stand over the picture's foot.
  overPicture?: boolean;
  // Whether the line closes a sticker standing with no bubble, so it may stand beside the sticker's foot.
  besidePicture?: boolean;
  // Whether anything stands in the line's clock: a message's time and send mark, which a running
  // turn has none of.
  clock?: boolean;
  // Whether the line follows the words straight, with nothing between them, so it may stand at the
  // end of their last line.
  afterWords?: boolean;
  // Whether the message is an agent's answer, which carries no verdict chip of its own: what judged it stands in its
  // draft spread (docs/web.md, the room screen's verdicts).
  answer?: boolean;
  // Whether what the round this message ends spent and did is still being read.
  figuring?: boolean;
  // Whether the record holds the message under the thinking kind, which stands under its own label and is no answer.
  thinking?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  spend: null,
  actionsAt: null,
  drafts: null,
  roundJudgements: () => [],
  roundSituation: null,
  live: null,
  chatId: 0,
  messageId: 0,
  briefing: null,
  sentAt: 0,
  judging: false,
  overPicture: false,
  besidePicture: false,
  clock: true,
  afterWords: false,
  figuring: false,
  answer: false,
  thinking: false
});

// How wide the line stands at the end of the words' last line, which the words keep blank for it;
// null while it stands on a line of its own.
const emit = defineEmits<{ room: [width: number | null] }>();
const { t } = useI18n();
const slots = useSlots();

const spendOpen = ref(false);
const recordsOpen = ref(false);
const briefingOpen = ref(false);
// What the press was told where the line carries no reading to play.
const briefingRefused = ref("");

// Where the line's full reading stands: as the page read it, then as this chip asked for it and the voice engine's
// stream moved it (docs/web.md, the room screen's voice briefing chip).
const briefingHeld = ref<{ id: number | null; state: MessageBriefing["state"]; source: MessageBriefing["source"]; voiceMessageId: number | null } | null>(null);
const briefingState = computed<MessageBriefing["state"]>(() => briefingHeld.value?.state ?? props.briefing?.state ?? "idle");
const briefingLook = computed<BriefingChip>(() => briefingChip(briefingState.value));
// Where the reading is served from: the voice engine's sound of it, or the voice message a line was read out as
// before the engine spoke readings.
const briefingSrc = computed(() => {
  const held = briefingHeld.value ?? (props.briefing === null ? null : { id: props.briefing.briefingId ?? null, source: props.briefing.source, voiceMessageId: props.briefing.voiceMessageId });

  if (held === null) return null;
  if (held.source === "voice" && held.voiceMessageId !== null) return mediaUrl("audio", props.chatId, held.voiceMessageId);

  return held.id === null ? null : briefingSoundUrl(held.id);
});

// Spreads the reading's player where it stands; pressed where none was made, or where it failed or was stopped, asks
// the receiver for it and spreads the line saying it is being made, which the player takes the place of once the
// engine says it ended done.
async function toggleBriefing(): Promise<void> {
  briefingOpen.value = !briefingOpen.value;
  briefingRefused.value = "";

  if (!briefingOpen.value || briefingState.value === "ready" || briefingState.value === "making") return;

  try {
    const asked = await $fetch<BriefingReading>(`/api/rooms/${props.chatId}/messages/${props.messageId}/reading`, { method: "POST" });

    briefingHeld.value = { id: asked.briefingId, state: asked.state === "ready" ? "ready" : "making", source: "kept", voiceMessageId: null };
  } catch (error) {
    briefingRefused.value = failureText(error, t("briefing.error.not_made"));
  }
}

// Whether the reader paused the reading or moved it along while it played, which keeps the player spread at its end,
// and whether the player is about to go back to its start as it does on ending, the one move that is not the reader's.
let readingTouched = false;
let readingRewinding = false;

function readingPaused(event: Event): void {
  if (!(event.target instanceof HTMLMediaElement) || event.target.ended) return;

  readingTouched = true;
}

function readingMoved(): void {
  if (readingRewinding) readingRewinding = false;
  else readingTouched = true;
}

function readingEnded(event: Event): void {
  readingRewinding = true;

  window.setTimeout(() => {
    const playing = event.target instanceof HTMLMediaElement && !event.target.paused;

    if (!readingTouched && !playing) briefingOpen.value = false;
  }, BRIEFING_SETTLE_MS);
}

watch(briefingOpen, (open) => {
  if (open) readingTouched = false;
});

// The engine's word on the reading this line waits on: ended done, it is there to play; ended failed or stopped, it
// says so.
useBotEvents((event) => {
  if (event.type !== "voice-briefing" || event.voice.kind !== "full" || event.voice.messageId !== props.messageId || event.voice.chatId !== props.chatId) return;

  const voice = event.voice;
  const state = readingStateOf(voice.state);

  briefingHeld.value = { id: voice.id, state, source: voice.spoken ? "kept" : voice.voiceMessageId === null ? null : "voice", voiceMessageId: voice.voiceMessageId };
});

// The turn's record, spread as one panel in the order the turn made it (docs/web.md, the room screen's chip line):
// what it read from the brain, every call and what came back, each question of its draft process, the round's
// judgement, and the situation note as that round read it.
const recordOpen = ref(false);
const loadingRecord = ref(false);
const recordFailure = ref<string | null>(null);
const actions = ref<TurnAction[]>([]);
// The lines the record holds of the turn's runs, which its calls stand on as the agent's log draws them.
const loadedLines = ref<AgentLogLine[]>([]);
// The round log's rows, read the first time the record opens.
const draftRows = ref<DraftRow[] | null>(null);
const callRows = computed<LogRow[]>(() =>
  loadedLines.value
    .filter((line) => line.kind === "tool")
    .map((line) => ({
      key: `call:${line.id}`,
      line,
      results: loadedLines.value.filter((one) => one.kind === "tool-result" && one.ref !== null && one.ref === line.ref),
      depth: 0
    }))
);

const done = computed<TurnActionsRef | null>(() => props.actionsAt ?? null);

// What the round's end names as read from the brain, on a turn that has ended; where it names any, they are the
// documents the brain chip lists and counts, in place of the ones the log says the turn was handed.
const reads = computed<DraftRead[]>(() => (props.live === null ? (props.drafts?.reads ?? []) : []));

// What each chip counts: the whole round either way — for a turn still running, what its stream has
// said plus what fell off the front of its block. The brain chip's held figure is the pieces the session
// already held on this round; its new figure is the documents handed in full or read directly, never the
// calls, which the tool chip counts. The round's reads name both.
const counts = computed<{ documents: number; held: number; tools: number; brain: number }>(() => {
  const live = props.live;

  if (live === null) {
    const named = reads.value.length > 0;
    const held = reads.value.filter((read) => read.how === "held").length;

    return {
      documents: named ? reads.value.length - held : (done.value?.documents ?? 0),
      held: named ? held : (done.value?.held ?? 0),
      tools: done.value?.tools ?? 0,
      brain: done.value?.brain ?? 0
    };
  }

  const handed = live.actions.filter((action) => action.kind === "context");
  const held = handed.filter((action) => action.state === "held").length;
  const documents = handed.length - held + live.droppedContext;
  const brain = brainActions(live.actions).filter((action) => action.kind === "tool").length;

  return { documents, held, tools: live.actions.length + live.dropped - handed.length - live.droppedContext, brain };
});

const records = computed<TurnRecord[]>(() => done.value?.records ?? []);

// What the round read new: the pieces handed whole or read by the agent itself, never the calls; what the session
// already held stands as the record button's plain figure before it.
const fresh = computed<number>(() => counts.value.documents);

// The round's judgement as the record stands it: the gates that read the person's message and the answer's send and
// checks alike.
const recordSplit = computed(() => splitDraftJudgements(props.roundJudgements));
const recordCards = computed<Judgement[]>(() => recordSplit.value.verdicts.filter((one) => !decidesMessage(one)));

// One line of the record, in the order the turn made it.
type RecordEntry =
  | { kind: "reads"; reads: DraftRead[] }
  | { kind: "actions"; actions: TurnAction[] }
  | { kind: "call"; row: LogRow }
  | { kind: "said"; text: string }
  | { kind: "draft"; line: RoundLine; diff: DraftDiffLine[]; at: number }
  | { kind: "end"; outcome: string; withheld: boolean; ms: number | null; at: number | null }
  | { kind: "opening"; opening: NonNullable<Judgement["opening"]> }
  | {
      kind: "judgement";
      judgement: Judgement;
      view: { narrowed: ReturnType<typeof narrowedOffer>; kept: ReturnType<typeof keptOffer>; words: ReturnType<typeof verdictWords> };
    }
  | { kind: "situation"; situation: Situation };

const timeline = computed<RecordEntry[]>(() => {
  const head: RecordEntry[] = [];
  const tail: RecordEntry[] = [];
  const timed: { at: number | null; seq: number; entry: RecordEntry }[] = [];
  let seq = 0;

  const push = (at: number | null, entry: RecordEntry): void => {
    timed.push({ at, seq: seq++, entry });
  };

  if (props.live !== null) {
    // A turn still running carries what it has done so far already, in the order it did it.
    if (props.live.actions.length > 0) push(null, { kind: "actions", actions: props.live.actions });
  } else {
    // What the round's end names as read from the brain stands first; without it, the documents the log says the turn
    // was handed.
    if (reads.value.length > 0) {
      head.push({ kind: "reads", reads: reads.value });
    } else {
      const read = actions.value.filter((action) => action.kind === "context");

      if (read.length > 0) head.push({ kind: "actions", actions: read });
    }

    // Every call, as the agent's log draws it, the result under the call, and what the turn wrote and then went on
    // working, each in the order the log holds them so a line stands before the call it led to.
    const calls = new Map(callRows.value.map((row) => [row.line.id, row]));
    const said = new Set(progressLines(loadedLines.value).map((line) => line.id));

    for (const line of loadedLines.value) {
      const row = calls.get(line.id);

      if (row !== undefined) push(row.line.at, { kind: "call", row });
      else if (said.has(line.id)) push(line.at, { kind: "said", text: line.text });
    }

    // Each question of the round's draft process, with the answer or the change it wrote.
    const rows = draftRows.value;

    if (rows !== null && rows.length > 0) {
      const lines = new Map(roundLines(t, rows).map((line) => [line.key, line]));

      for (const row of rows) {
        if (row.kind === "end") continue;

        const line = lines.get(`row:${row.id}`);

        if (line === undefined) continue;

        const before = row.before ?? null;

        push(row.at, {
          kind: "draft",
          line,
          diff: before !== null && line.answer !== null && before !== line.answer ? draftDiff(before, line.answer) : [],
          at: row.at
        });
      }
    } else {
      // The gate wrote the round's questions where the round log holds none; they stand as the rounds they name.
      for (const line of gateRoundLines(t, recordSplit.value.drafts)) {
        const judgement = props.roundJudgements.find((one) => `judgement:${one.id}` === line.key);

        if (judgement !== undefined) push(judgement.createdAt, { kind: "draft", line, diff: [], at: judgement.createdAt });
      }
    }

    const endRow = rows?.findLast((row) => row.kind === "end") ?? null;
    const end = endLine(t, rows, recordSplit.value.drafts, props.drafts);

    if (end !== null) push(endRow?.at ?? null, { kind: "end", ...end, at: endRow?.at ?? null });

    // What judged the round, each card at its own moment; what opened a turn stands once, before its first card.
    const seen = new Set<string>();

    for (const judgement of recordCards.value) {
      const round = judgement.round ?? `judgement:${judgement.id}`;

      if (!seen.has(round)) {
        seen.add(round);

        if (judgement.opening !== undefined && judgement.opening.instructions.length > 0) push(judgement.createdAt, { kind: "opening", opening: judgement.opening });
      }

      push(judgement.createdAt, {
        kind: "judgement",
        judgement,
        view: { narrowed: narrowedOffer(judgement), kept: keptOffer(judgement), words: verdictWords(t, judgement) }
      });
    }

    if (props.roundSituation != null) tail.push({ kind: "situation", situation: props.roundSituation });
  }

  timed.sort((left, right) => (left.at ?? 0) - (right.at ?? 0) || left.seq - right.seq);

  return [...head, ...timed.map((one) => one.entry), ...tail];
});

// How much of the turn the record could not stand: a page of a run's log holds only so many lines, and the bot's
// picture of a running turn keeps only the newest actions.
const missed = computed<number>(() => {
  const live = props.live;

  return live !== null ? live.dropped + live.droppedContext : Math.max(0, counts.value.tools - callRows.value.length);
});

// What the record button says it holds: each part stands a mark and a word while it holds anything, and the press is
// there only where one of them does.
const brainCounted = computed<boolean>(() => counts.value.documents + counts.value.held + counts.value.brain > 0);
const judgedRecorded = computed<boolean>(() => props.answer && (recordCards.value.length > 0 || props.roundSituation != null));
const recorded = computed<boolean>(() => brainCounted.value || counts.value.tools > 0 || drafted.value || judgedRecorded.value);

// Opening the record reads the round's log and its draft rows once; a read that failed is asked again on the next
// opening. A turn still running holds its lines already.
async function toggleRecord(): Promise<void> {
  recordOpen.value = !recordOpen.value;

  if (!recordOpen.value || props.live !== null || loadingRecord.value) return;

  const at = done.value;
  const round = roundOfDrafts.value;
  const needLines = at !== null && loadedLines.value.length === 0;
  const needDrafts = drafted.value && round !== null && draftRows.value === null;

  if (!needLines && !needDrafts) return;

  loadingRecord.value = true;
  recordFailure.value = null;

  try {
    if (needLines && at !== null) {
      // Every run of the round, its own turn first and then each question its draft process asked, read as one.
      try {
        const lines = await Promise.all(at.runs.map((run) => readRunLines(at.agent, run)));

        loadedLines.value = lines.flat();
        actions.value = turnActions(loadedLines.value);
      } catch (error) {
        recordFailure.value = failureText(error, t("room.error.actions_read_failed"));
      }
    }

    if (needDrafts && round !== null) {
      try {
        draftRows.value = (await $fetch<{ rows: DraftRow[] }>(`/api/rooms/${props.chatId}/drafts`, { query: { round } })).rows;
      } catch (error) {
        recordFailure.value ??= failureText(error, t("room.error.drafts_read_failed"));
      }
    }
  } finally {
    loadingRecord.value = false;
  }
}

const chip = computed<SpendChip | null>(() =>
  props.live !== null ? props.live.chip : props.spend === null ? null : roundChip(t, props.spend)
);

// The message's own verdicts: a person's message carries the gates that read it, and an answer carries none here,
// since what judged the round stands in its record press.
const split = computed(() => splitDraftJudgements(props.judgements));
// A person's message's own verdicts, which its mark is coloured by; an answer carries none (docs/web.md, the room screen's verdicts).
const verdicts = computed<Judgement[]>(() => (props.answer ? [] : split.value.verdicts.filter((one) => !judgesAnswer(one))));

// The record's draft part stands on a turn that has ended and whose round's process the page read or the gate wrote of.
const roundOfDrafts = computed<string | null>(() => draftRound(props.drafts, split.value.drafts));
const drafted = computed<boolean>(() => props.answer && props.live === null && roundOfDrafts.value !== null && (props.drafts !== null || split.value.drafts.length > 0));
const draftCount = computed<number>(() => drafted.value ? draftAsked(props.drafts, split.value.drafts) : 0);

// How full the session stood once the turn ended, on a turn that has ended and whose round reported it.
const context = computed<number | null>(() => (props.live === null ? (props.spend?.context ?? null) : null));

// Whether the line has a leading end: a chip of how full the session stood, or of what the turn did,
// spent or wrote down.
const chipped = computed<boolean>(
  () =>
    context.value !== null ||
    counts.value.documents + counts.value.held + counts.value.brain > 0 ||
    chip.value !== null ||
    counts.value.tools > 0 ||
    records.value.length > 0 ||
    drafted.value ||
    judgedRecorded.value ||
    props.briefing !== null ||
    props.figuring ||
    props.thinking ||
    slots.lead !== undefined
);

// Whether the line is more than the time and its marks: a chip, or how long the room waited. Such a
// line stands on a line of its own under what the bubble holds, never at the end of the words or over
// a picture.
const full = computed<boolean>(() => chipped.value || slots.took !== undefined);

// Whether the verdict mark stands: once the message is being judged, and from then on wherever it
// has a verdict.
const marked = computed<boolean>(() => !props.answer && (props.judging || verdicts.value.length > 0));

// Whether the line has anything to stand: a chip, the wait, the verdict mark, or the clock. A running
// turn with none of them carries no line at all.
const shown = computed<boolean>(() => full.value || marked.value || props.clock);

// Whether anything a chip spreads stands under the line.
const spreading = computed<boolean>(
  () =>
    (briefingOpen.value && props.briefing !== null) ||
    recordOpen.value ||
    recordsOpen.value ||
    (chip.value !== null && spendOpen.value)
);

// The line stands over a picture's foot, or beside a sticker's, only where it is the time and its marks
// alone, with nothing spread under it: anything longer, or anything under it, stands below the picture
// in the bubble's own room, or below the sticker, instead.
const over = computed<boolean>(() => (props.overPicture || props.besidePicture) && !full.value && !spreading.value);

// The frame the line stands in. In the words' own flow it is no box at all, so the line and what it
// spreads are laid out with the words; under a picture it keeps the bubble's inner room itself.
const frame = computed<string>(() => {
  if (props.overPicture && !over.value) {
    return "flex flex-wrap gap-y-(--chat-meta-gap) px-(--chat-pad-x) pt-(--chat-meta-gap) pb-(--chat-pad-y)";
  }

  return "contents";
});

// How wide the trailing end stands, read off the page as it is drawn: the verdict mark coming and
// a send mark changing move it, so a width fixed in advance would be wrong. It is read once the
// moment the line is put in, in the same update that puts it in, so the line stands at the end of the
// words from the bubble's first layout: a sent bubble's flight copies it then, and a width first told
// by the observer a frame later would leave the copy with the line under the words (docs/web.md,
// 「What arrives comes in at the end」).
const trail = useTemplateRef<HTMLElement>("trail");
const trailWidth = ref<number | null>(null);

watch(
  trail,
  (element, _was, onCleanup) => {
    if (element === null || typeof ResizeObserver === "undefined") {
      trailWidth.value = null;

      return;
    }

    const measure = (): void => {
      trailWidth.value = Math.ceil(element.getBoundingClientRect().width);
    };
    const observer = new ResizeObserver(measure);

    measure();

    observer.observe(element);
    onCleanup(() => observer.disconnect());
  },
  { immediate: true }
);

// The line stands at the end of the words' last line, as Telegram lays it, only where it is the
// time and its marks alone straight after the words with nothing spread under it, and once its width is
// known for the words to keep blank (docs/web.md, the room screen's meta line section); otherwise it stands on a line of its own.
const inline = computed<boolean>(() => props.afterWords && !full.value && !spreading.value && !over.value && trailWidth.value !== null);

watch(
  () => (inline.value ? trailWidth.value : null),
  (width) => emit("room", width),
  { immediate: true }
);

// The line's own look: over a picture it is the image overlay chip (docs/web.md, 「The image overlay
// chip」), on a dark translucent ground in light letters, 4px in from the picture's corner and in the
// corners that inset leaves, or the same chip in the sticker row's flow beside the sticker, 8px of room at both ends and 4px between its parts, and nothing in it
// picked up or dragged by a held finger. In the words' flow it is muted: at the end of their last
// line, laid over the blank they keep for it at the bubble's trailing foot, or else on a line of its
// own under them, its trailing end at the bubble's trailing edge (docs/web.md, the room screen's meta line section).
const lineLook = computed<string>(() => {
  if (over.value) {
    const chip = "rounded-sm px-2 text-white select-none [-webkit-user-drag:none]";

    // Beside a sticker it stands on the page's own ground, whose light theme needs a darker step
    // for its letters to read at 4.5:1.
    return props.besidePicture ? `bg-black/60 ${chip}` : `absolute end-1 bottom-1 bg-black/50 ${chip}`;
  }

  if (inline.value) {
    return "absolute end-(--chat-pad-x) bottom-(--chat-pad-y) text-muted";
  }

  return "basis-full text-muted";
});

// What the mark says of the message's verdicts as a whole, and how it says it. Its colour changes on
// the quick length. A row read in with its mark stands it at once; a mark that comes later pops in
// only where it comes with its verdicts settled, since one that comes beating has said it came.
const markLook = computed<VerdictChip>(() => verdictChip(verdictState(verdicts.value, props.judging)));
const markStood = marked.value;
const beaten = ref(props.judging);

watch(
  () => props.judging,
  (judging) => {
    beaten.value ||= judging;
  }
);

const markClass = computed<string>(() => ["transition-colors", markLook.value.iconClass, !markStood && !beaten.value ? "verdict-pop" : ""].join(" "));

// How long after it was sent a message may still come to be judged: such a message keeps the mark's
// room from the start, so nothing beside it moves when it comes. An answer keeps none, since no mark
// ever comes to it and the room would stand as a gap between its wait and its time. A line over a
// picture keeps none: it stands at the picture's trailing corner and grows away from the time, and
// room kept there would stand as a hole in the overlay chip.
const JUDGED_WITHIN_SECONDS = 600;
const roomForMark = !props.answer && !props.overPicture && !props.besidePicture && props.sentAt > 0 && Date.now() / 1000 - props.sentAt < JUDGED_WITHIN_SECONDS;

// The mark a thinking message's label wears.
const THINKING_ICON = "i-material-symbols-lightbulb-outline";


// The roads that stage walked, where the archive carries them. A judgement the live stream
// announced carries none until the archived row arrives beside it.
function roadsOf(judgement: Judgement): JudgementRoad[] {
  return judgement.roads ?? [];
}

// How long the stage itself took, which is the whole of it — the roads below account for where
// that time went.
function tookOf(judgement: Judgement): string {
  const ms = judgement.ms;

  return ms === null || ms === undefined ? "" : secondsText(t, ms);
}

const TONE_CLASSES = { success: "text-success", error: "text-error", neutral: "text-muted" } as const;

// What the stage wrote, whole: the verdict, and its detail where it says more.
function originalOf(judgement: Judgement): string {
  const detail = judgement.detail?.trim() ?? "";

  return detail === "" || detail === judgement.verdict.trim() ? judgement.verdict : `${judgement.verdict}\n${detail}`;
}
</script>
