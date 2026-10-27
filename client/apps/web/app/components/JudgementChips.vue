<template>
  <!-- The foot of a bubble: its meta line, and under it whatever a chip of that line spreads, both
       inside the bubble (docs/web.md, the room screen's meta line section, the room screen's chip line section). The line is one row for a message and for
       the turn still running alike, drawn by this one part. It stands in the bubble's own flow: at
       the end of the words' last line where it is their time and marks alone and that line leaves it
       room, else on a line of its own under them; over the foot of a picture with nothing under it,
       it stands on a ground of its own. -->
  <div v-if="shown || spreading" :class="frame">
    <!-- Everything on the line is one size, one line height and one colour on one middle line, and
         its figures are tabular. What the turn did, spent and wrote down stands at the leading end;
         how long the room waited, the verdicts, the time and the send mark at the trailing end. The
         line breaks between its two ends before it breaks among the chips: where they do not fit on one line, the chips keep a
         line of their own and the trailing end takes the line under them, and the chips wrap among
         themselves only where they alone are wider than the bubble.
         Each chip is a mark with a figure or nothing beside it, named by its tooltip. How full the
         session stood stands first, where it was placed, and arrives with the answer; the rest stand
         in the order their own clock puts them in: the documents the turn was handed and what it
         spends stand from its first second, a call joins them the moment it is made, and what it
         wrote down and the full reading arrive with the answer, so they stand last. A chip that
         arrives late standing first would push every chip already there sideways the moment it
         landed, and a reader watching a turn would see the line taken away and built again rather
         than filled. -->
    <div data-meta :data-meta-inline="inline ? '' : undefined" class="flex min-w-0 flex-wrap items-end gap-(--chat-meta-gap) text-sm leading-(--chat-meta-line) whitespace-nowrap tabular-nums" :class="lineLook">
      <span v-if="chipped" data-meta-lead class="flex min-w-0 flex-wrap items-center gap-(--chat-meta-gap)">
        <!-- What the turn was handed and what it called, each a count that opens its own list: on a
             turn that has ended the lines are read out of the log the moment one is opened, and on
             one still running they are what its stream has said so far. A document the session
             already held went as a mark and is listed but not counted, so a turn that read nothing
             new still opens its list from a chip standing at nought. How full the session stood stands
             before them, once the turn has ended and only where the session reported it. -->
        <ContextChip v-if="context !== null" :ratio="context" />

        <!-- What the session holds read, and what this round read new as a green plus (docs/web.md, the room screen's brain chip). -->
        <LineChip v-if="counts.documents + counts.held + counts.brain > 0" :icon="CHIP_ICONS.brain" :label="brainLabel" :open="listOpen('context')" @toggle="openActions('context')">
          <span data-brain-figure class="inline-flex items-center">
            <RollingNumber v-if="counts.held > 0 || fresh === 0" :value="counts.held" />
            <span v-if="fresh > 0" data-brain-new class="inline-flex items-center text-success">+<RollingNumber :value="fresh" /></span>
          </span>
        </LineChip>

        <!-- What the answer wrote, filling while the turn runs and the round's own figure afterwards. -->
        <TokenChip v-if="chip !== null" :chip="chip" :open="spendOpen" @toggle="spendOpen = !spendOpen" />

        <LineChip v-if="counts.tools > 0" :icon="CHIP_ICONS.tools" :label="$t(CHIP_LABELS.tools)" :open="listOpen('tool')" @toggle="openActions('tool')">
          <RollingNumber :value="counts.tools" />
        </LineChip>

        <!-- What the turn wrote down, carried whole on the answer, so it spreads without a read. -->
        <LineChip v-if="records.length > 0" :icon="CHIP_ICONS.records" :label="$t(CHIP_LABELS.records)" :open="recordsOpen" @toggle="recordsOpen = !recordsOpen">
          <RollingNumber :value="records.length" />
        </LineChip>

        <!-- How the round's draft process made the answer, which arrives with it: the count of the rounds it asked,
             spreading the summary and the round log's rows, read the first time it opens. -->
        <LineChip v-if="drafted" :icon="CHIP_ICONS.drafts" :label="$t(CHIP_LABELS.drafts)" :open="draftsOpen" @toggle="openDrafts">
          <RollingNumber :value="draftCount" />
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

        <!-- The one place the verdicts open and close from: the mark alone, beating while the message
             is being judged and then coloured by how the whole of it went, named by its tooltip.
             Opening it spreads every stage's card at once, and a stage that arrives while it is open
             stands open with the rest; closing it puts them all away. A mark that comes with its
             verdicts already settled while the message is on screen pops in; a message read in with
             it stands it at once. A message sent a moment ago keeps the mark's room, so the time
             beside it does not move when it comes. -->
        <LineChip
          v-if="marked"
          :icon="CHIP_ICONS.verdicts"
          :icon-class="markClass"
          :label="$t(markLook.label)"
          :open="expanded"
          :over="over"
          @toggle="expanded = !expanded"
        />
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
        <AudioPlayer
          v-else-if="briefingState === 'ready' && briefingSrc !== null"
          class="w-80 max-w-full"
          :src="briefingSrc"
          :download="`${briefingSrc}?as=download`"
          :name="$t('room.label.chip_briefing')"
          :size="null"
          autoplay
          data-briefing-reading
        />
        <p v-else-if="briefingState === 'failed'" class="text-sm text-error">{{ $t("briefing.error.not_made") }}</p>
        <p v-else-if="briefingState === 'ready'" class="text-sm text-dimmed">{{ $t("room.label.unreceivable") }}</p>
        <p v-else class="text-sm text-dimmed">{{ $t("briefing.status.making") }}</p>
      </template>

      <template v-for="kind in ACTION_KINDS" :key="kind">
        <!-- A turn still running has its lines already and stands them bare, the way it did while it
             was the only thing there was to read; a turn that has ended reads them out of the log. -->
        <TurnActions v-if="listOpen(kind) && props.live !== null" :actions="liveOf(kind)" :dropped="liveDropped(kind)" />

        <div v-else-if="listOpen(kind)" class="w-full min-w-0">
          <!-- What the round's end names as read from the brain stands with the page; the brain calls the log holds
               follow it, read the first time the list opens. -->
          <BrainReads v-if="kind === 'context' && reads.length > 0" :reads="reads" :chat-id="props.chatId" :agent="done?.agent ?? null" :class="logListed(kind) ? 'mb-2' : ''" />

          <template v-if="logListed(kind)">
            <ContentSkeleton v-if="loadingActions" :rows="3" listClass="flex flex-col gap-1" :label="$t('room.status.records_loading')">
              <div class="flex h-5 items-center gap-2">
                <SkeletonBar class="size-4 shrink-0 rounded-sm" />
                <SkeletonBar class="h-4 min-w-0 flex-1" />
              </div>
            </ContentSkeleton>
            <p v-else-if="actionsFailure !== null" class="text-sm text-dimmed">{{ actionsFailure }}</p>
            <p v-else-if="loadedOf(kind).length === 0" class="text-sm text-dimmed">{{ $t("room.status.no_records_left") }}</p>
            <!-- An ended turn's calls stand as the agent's log draws them, the command under its prompt. -->
            <div v-else-if="kind === 'tool'" class="flex min-w-0 flex-col gap-2">
              <AgentToolCall v-for="row in callRows" :key="row.key" :row="row" />
              <RollingSentence v-if="restOf(kind) > 0" tag="p" class="mt-1 text-sm text-dimmed" :keypath="'room.status.more_records'" :figures="{ n: restOf(kind) }" />
            </div>
            <template v-else>
              <TurnActions :actions="loadedOf(kind)" />
              <!-- A turn longer than one page of the log comes back short of its own count, and the rest
                   stands on the agent's own screen rather than being quietly left out here. -->
              <RollingSentence v-if="restOf(kind) > 0" tag="p" class="mt-1 text-sm text-dimmed" :keypath="'room.status.more_records'" :figures="{ n: restOf(kind) }" />
            </template>
          </template>
        </div>
      </template>

      <TurnRecords v-if="recordsOpen" :records="records" class="w-full" />

      <DraftRows
        v-if="draftsOpen && drafted"
        :rows="draftRows"
        :loading="loadingDrafts"
        :failure="draftsFailure"
        :drafts="split.drafts"
        :checks="checks"
        :summary="props.drafts"
        :reads="reads"
        :chat-id="props.chatId"
        :agent="done?.agent ?? null"
      />

      <AgentTurnFigures v-if="chip !== null && spendOpen" :lines="chip.lines" :boxed="false" class="w-full" />

      <!-- What became of the message, one line: its outcome in words, the message it links to by that message's
           time, and a press for the gates' cards where there are any (docs/web.md, the room screen's verdicts). -->
      <div v-if="expanded && marked" data-outcome class="flex w-full min-w-0 flex-wrap items-center gap-x-2 text-sm">
        <span data-outcome-kind :data-outcome="outcomeKind" class="text-highlighted" :class="outcomeKind === 'failed' ? 'text-error' : ''">{{ outcomeWords }}</span>
        <UButton
          v-if="props.outcome?.target != null"
          size="xs"
          color="primary"
          variant="link"
          data-outcome-target
          class="px-0 tabular-nums"
          :label="$t(outcomeKind === 'read-with' ? 'room.label.outcome_with_message' : 'room.label.outcome_answer_at', { time: formatClock(props.outcome.target.sentAt) })"
          @click.stop="emit('jump', props.outcome.target.messageId)"
        />
        <UButton
          v-if="cardsHeld"
          size="xs"
          color="neutral"
          variant="ghost"
          trailing-icon="i-material-symbols-chevron-right"
          :ui="{ trailingIcon: detailsOpen ? 'rotate-90 transition-transform' : 'transition-transform' }"
          :label="$t('room.action.outcome_details')"
          :aria-expanded="detailsOpen"
          data-outcome-details
          class="ms-auto"
          @click.stop="detailsOpen = !detailsOpen"
        />
      </div>

      <!-- Each turn's cards stand under what opened it, said once for the turn whichever gates it
           ran. Inside the bubble they are parted by its own step, never boxed a second time. -->
      <template v-for="turn in turns" :key="turn.key">
        <TurnOpening
          v-if="turn.opening !== null && turn.opening.instructions.length > 0"
          :instructions="turn.opening.instructions"
          :chat-id="props.chatId"
          class="w-full"
        />

        <div
          v-for="{ judgement, narrowed, kept, words } in turn.cards"
          :key="judgement.id"
          class="w-full"
        >
          <div class="flex flex-wrap items-center gap-2 text-sm">
            <span class="font-medium text-highlighted">{{ stageLabel($t, judgement.stage) }}</span>
            <time class="text-dimmed">{{ formatStamp(judgement.createdAt) }}</time>
            <span v-if="tookOf(judgement) !== ''" class="text-dimmed tabular-nums">{{ tookOf(judgement) }}</span>
          </div>

          <!-- The verdict in words, with the names it chose as the records' own names (docs/web.md, the room screen's verdicts). -->
          <p data-card-words class="mt-1 flex flex-wrap items-baseline gap-x-2 text-sm break-words">
            <span :class="TONE_CLASSES[words.tone]">{{ words.words }}</span>
            <span v-if="words.names.length > 0" class="font-mono break-all text-muted">{{ words.names.join(", ") }}</span>
          </p>
          <!-- What a picker's model was asked of its candidates, each line as it read it with its answer beside it, in
               place of the list of picked names the detail holds. -->
          <ol v-if="(judgement.lines ?? []).length > 0" data-judgement-lines class="mt-2 flex flex-col gap-1">
            <li v-for="(one, at) in judgement.lines" :key="at" class="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm">
              <span class="min-w-0 flex-1 font-mono break-words whitespace-pre-wrap text-muted">{{ one.line }}</span>
              <span class="shrink-0" :class="lineKept(one.answer) ? 'text-success' : 'text-dimmed'" data-line-answer>{{ lineAnswer($t, one.answer) }}</span>
            </li>
          </ol>

          <!-- A gate asked about none says what its narrowing started from and left, and that it kept
               by the item rule alone where it did. -->
          <template v-if="narrowed !== null">
            <p v-if="narrowed.itemRule" class="mt-1 text-sm text-dimmed">{{ $t("room.label.offer_item_rule") }}</p>
            <p class="mt-1 text-sm text-dimmed tabular-nums">
              {{ $t("room.label.offer_counts", { held: countText(narrowed.held), left: countText(narrowed.left) }) }}
            </p>
          </template>

          <!-- What each of the gate's rules kept, where its round's offers record holds a row for the gate. -->
          <p v-if="kept !== null" data-kept class="mt-1 text-sm text-dimmed tabular-nums">
            {{ $t("room.label.offer_kept", { item: countText(kept.item), keyword: countText(kept.keyword), word: countText(kept.word), person: countText(kept.person), recent: countText(kept.recent) }) }}
          </p>

          <!-- Which road the answer came by, and what was waited out before it. The provider and the
               model stand as the record wrote them, so they are monospaced the way every other
               recorded name on this screen is. -->
          <ul v-if="roadsOf(judgement).length > 0" class="mt-2 flex flex-col gap-1">
            <li
              v-for="road in roadsOf(judgement)"
              :key="road.id"
              class="flex flex-wrap items-baseline gap-2 text-sm text-dimmed"
            >
              <span class="font-mono break-all text-muted">{{ roadName(road) }}</span>
              <!-- How it ended and how long it took are one fact, so a narrow screen wraps after the
                   name rather than between them. -->
              <span class="flex items-baseline gap-2 whitespace-nowrap">
                <span>{{ roadOutcome($t, road.outcome) }}</span>
                <span class="tabular-nums">{{ secondsText($t, road.ms) }}</span>
              </span>
            </li>
          </ul>

          <!-- What the gate wrote, as it wrote it, folded under the original and never spread with the card. -->
          <UChatTool :text="$t('common.label.original')" chevron="leading" data-card-original class="mt-1">
            <pre class="font-mono text-sm whitespace-pre-wrap wrap-anywhere text-dimmed">{{ originalOf(judgement) }}</pre>
          </UChatTool>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { briefingChip, CHIP_ICONS, CHIP_LABELS, verdictChip } from "~/domain/chips";
import { briefingSoundUrl, mediaUrl } from "~/domain/player";
import { failureText } from "bmo-ui/app/domain/errors";
import { useBotEvents } from "~/domain/events";
import { useTurnActionsFold } from "~/domain/turn-actions-fold";
import { readRunLines } from "~/domain/log";
import { countText, secondsText } from "~/domain/numbers";
import { decidesMessage, judgesAnswer, keptOffer, lineAnswer, lineKept, narrowedOffer, openedCards, openedTurns, outcomeText, readingCards, roadName, roadOutcome, stageLabel, verdictState, verdictWords } from "~/domain/judgements";
import { brainActions, turnActions } from "~/domain/working";
import { formatClock, formatStamp } from "bmo-ui/app/domain/time";
import { roundChip } from "~/domain/turns";
import { draftAsked, draftRound, splitDraftJudgements } from "~/domain/draft-process";

import type { AgentLogLine, BriefingReading, Judgement, JudgementRoad, MessageBriefing, RoundSpend, TurnAction, TurnActionsRef, TurnRecord } from "#shared/types";
import type { LogRow } from "~/domain/log";
import type { DraftRead, DraftRow, DraftSummary } from "#shared/drafting";
import type { BriefingChip, VerdictChip } from "~/domain/chips";
import type { SpendChip } from "~/domain/turns";
import type { OutcomeKind } from "~/domain/judgements";
import type { OutcomeView } from "~/domain/room";
import type { LiveTurn } from "~/domain/working";

interface Props {
  judgements: Judgement[];
  // What the round this message ended cost, on the message that ended it.
  spend?: RoundSpend | null;
  // Where what that turn did is kept, on the same message.
  actionsAt?: TurnActionsRef | null;
  // How the round's draft process made the answer, on the same message.
  drafts?: DraftSummary | null;
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
  // What became of a person's message, and the message its line links to.
  outcome?: OutcomeView | null;
}

const props = withDefaults(defineProps<Props>(), {
  spend: null,
  actionsAt: null,
  drafts: null,
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
  answer: false,
  outcome: null
});

// How wide the line stands at the end of the words' last line, which the words keep blank for it;
// null while it stands on a line of its own.
const emit = defineEmits<{ room: [width: number | null]; jump: [messageId: number] }>();
const { t } = useI18n();
const slots = useSlots();

const expanded = ref(false);
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

// Spreads the reading's player where it stands; pressed where none was made, or where it failed, asks the receiver
// for it and spreads the line saying it is being made, which the player takes the place of once the engine says it
// ended done.
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

// The engine's word on the reading this line waits on: ended done, it is there to play; ended failed, it says so.
useBotEvents((event) => {
  if (event.type !== "voice-briefing" || event.voice.kind !== "full" || event.voice.messageId !== props.messageId || event.voice.chatId !== props.chatId) return;

  const voice = event.voice;
  const state: MessageBriefing["state"] = voice.state === "done" ? "ready" : voice.state === "failed" ? "failed" : "making";

  briefingHeld.value = { id: voice.id, state, source: voice.spoken ? "kept" : voice.voiceMessageId === null ? null : "voice", voiceMessageId: voice.voiceMessageId };
});

// The two sorts of action a turn has, each a chip and a list of its own.
type ActionKind = TurnAction["kind"];

const ACTION_KINDS: readonly ActionKind[] = ["context", "tool"];

// Whether this one message's lists stand spread, each on its own. Until the reader presses a chip
// here, a turn still running stands each list as the browser last saw a running turn's left — it
// is being watched, so a browser never told stands both spread — and a turn that has ended stands
// both folded. A press sets that one list on this row and nothing else.
const pressed = reactive<Record<ActionKind, boolean | null>>({ context: null, tool: null });
const { folded, setFolded } = useTurnActionsFold();
const loadingActions = ref(false);
const actionsFailure = ref<string | null>(null);
const actions = ref<TurnAction[]>([]);
// The lines the record holds of the turn's runs, which its calls stand on as the agent's log draws them.
const loadedLines = ref<AgentLogLine[]>([]);
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

function listOpen(kind: ActionKind): boolean {
  return pressed[kind] ?? (props.live !== null && !folded.value[kind]);
}

const done = computed<TurnActionsRef | null>(() => props.actionsAt ?? null);

// What the round's end names as read from the brain, on a turn that has ended; where it names any, they are the
// documents the brain chip lists and counts, in place of the ones the log says the turn was handed.
const reads = computed<DraftRead[]>(() => (props.live === null ? (props.drafts?.reads ?? []) : []));

// What each chip counts: the whole round either way — for a turn still running, what its stream has
// said plus what fell off the front of its block. A reference document the session already held is
// counted apart, since it went as a mark and nothing of it was read on this turn. The brain chip counts
// the documents handed and the calls that read the brain; the tool chip counts every call, those among them.
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

// What the round read new: the pieces handed whole or read by the agent itself, and the brain calls; what the session
// already held stands as the chip's plain figure before it.
const fresh = computed<number>(() => counts.value.documents + counts.value.brain);
const brainLabel = computed<string>(() => (fresh.value > 0 ? t("room.label.chip_brain_new", { n: countText(fresh.value) }) : t(CHIP_LABELS.brain)));

// One chip's list: the brain's — the documents handed and the calls that read the brain — or every call.
function listOf(kind: ActionKind, actions: readonly TurnAction[]): TurnAction[] {
  if (kind === "tool") return actions.filter((action) => action.kind === "tool");

  const brain = brainActions(actions);

  return reads.value.length > 0 ? brain.filter((action) => action.kind === "tool") : brain;
}

// Whether a list stands what the log holds: every list but the brain's where the round's end names its documents
// and the round made no brain call.
function logListed(kind: ActionKind): boolean {
  return kind === "tool" || reads.value.length === 0 || counts.value.brain > 0;
}

function liveOf(kind: ActionKind): TurnAction[] {
  return listOf(kind, props.live?.actions ?? []);
}

function liveDropped(kind: ActionKind): number {
  const live = props.live;

  return live === null ? 0 : kind === "context" ? live.droppedContext : live.dropped - live.droppedContext;
}

function loadedOf(kind: ActionKind): TurnAction[] {
  return listOf(kind, actions.value);
}

// How many of the turn's actions of one sort the list did not get: the record counted them all,
// and a page of the log holds only so many lines.
function restOf(kind: ActionKind): number {
  const listed = kind === "tool" ? counts.value.tools : reads.value.length > 0 ? counts.value.brain : counts.value.documents + counts.value.held + counts.value.brain;

  return Math.max(0, listed - loadedOf(kind).length);
}

// Opening asks the log for that run's lines, once, and each list stands its own sort of them. They
// are the archive's own answer, so a reader who closes a list and opens either again is shown the
// same lines without asking for them twice.
async function openActions(kind: ActionKind): Promise<void> {
  const next = !listOpen(kind);

  pressed[kind] = next;

  // A turn still running has its lines already. How the reader left this list is where the next
  // running turn's starts, and no row already standing moves with it.
  if (props.live !== null) {
    setFolded(kind, !next);

    return;
  }

  const at = done.value;

  if (!next || at === null || actions.value.length > 0 || loadingActions.value || !logListed(kind)) {
    return;
  }

  loadingActions.value = true;
  actionsFailure.value = null;

  try {
    // Every run of the round, its own turn first and then each question its draft process asked, read as one.
    const lines = await Promise.all(at.runs.map((run) => readRunLines(at.agent, run)));

    loadedLines.value = lines.flat();
    actions.value = turnActions(loadedLines.value);
  } catch (error) {
    actionsFailure.value = failureText(error, t("room.error.actions_read_failed"));
  } finally {
    loadingActions.value = false;
  }
}

const chip = computed<SpendChip | null>(() =>
  props.live !== null ? props.live.chip : props.spend === null ? null : roundChip(t, props.spend)
);

// The gate's rows of the round's draft process stand in the answer's draft spread, with the answer's send and checks;
// every other verdict is a person's message's own.
const split = computed(() => splitDraftJudgements(props.judgements));
// A person's message's own verdicts, which its mark is coloured by; an answer carries none (docs/web.md, the room screen's verdicts).
const verdicts = computed<Judgement[]>(() => (props.answer ? [] : split.value.verdicts.filter((one) => !judgesAnswer(one))));
// The answer's send and checks, which stand in its draft spread.
const checks = computed<Judgement[]>(() => (props.answer ? split.value.verdicts.filter(judgesAnswer) : []));
// The gates' cards under a person's message's outcome, spread by its details press.
const cards = computed<Judgement[]>(() => readingCards(verdicts.value));
const detailsOpen = ref(false);
// Whether the outcome line has more behind it: a gate's card, or an instruction the turn carried.
const cardsHeld = computed<boolean>(() => cards.value.length > 0 || verdicts.value.some((one) => (one.opening?.instructions.length ?? 0) > 0));

const opened = computed<Judgement[]>(() => openedCards(verdicts.value, expanded.value && detailsOpen.value));

// What became of the message, or that it is still being judged.
const outcomeKind = computed<OutcomeKind | "judging">(() => (props.judging ? "judging" : (props.outcome?.kind ?? "undecided")));
const outcomeWords = computed<string>(() => (props.judging ? t("room.label.chip_verdicts_judging") : outcomeText(t, props.outcome?.kind ?? "undecided")));

// The draft chip stands on a turn that has ended and whose round's process the page read or the gate wrote of.
const draftsOpen = ref(false);
const loadingDrafts = ref(false);
const draftsFailure = ref<string | null>(null);
const draftRows = ref<DraftRow[] | null>(null);
const roundOfDrafts = computed<string | null>(() => draftRound(props.drafts, split.value.drafts));
const drafted = computed<boolean>(() => props.answer && props.live === null && roundOfDrafts.value !== null && (props.drafts !== null || split.value.drafts.length > 0));
const draftCount = computed<number>(() => draftAsked(props.drafts, split.value.drafts));

// Opening reads the round's rows from the receiver's round log, once; a read that failed is asked again on the next
// opening.
async function openDrafts(): Promise<void> {
  draftsOpen.value = !draftsOpen.value;

  const round = roundOfDrafts.value;

  if (!draftsOpen.value || round === null || draftRows.value !== null || loadingDrafts.value) return;

  loadingDrafts.value = true;
  draftsFailure.value = null;

  try {
    draftRows.value = (await $fetch<{ rows: DraftRow[] }>(`/api/rooms/${props.chatId}/drafts`, { query: { round } })).rows;
  } catch (error) {
    draftsFailure.value = failureText(error, t("room.error.drafts_read_failed"));
  } finally {
    loadingDrafts.value = false;
  }
}

// The spread cards by the turn they belong to, each with what its narrowing says where it says
// anything.
const turns = computed(() =>
  openedTurns(opened.value).map((turn) => ({
    key: turn.key,
    opening: turn.opening,
    cards: turn.judgements.filter((judgement) => !decidesMessage(judgement)).map((judgement) => ({ judgement, narrowed: narrowedOffer(judgement), kept: keptOffer(judgement), words: verdictWords(t, judgement) })),
  }))
);
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
    props.briefing !== null
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
    ACTION_KINDS.some((kind) => listOpen(kind)) ||
    recordsOpen.value ||
    (draftsOpen.value && drafted.value) ||
    (chip.value !== null && spendOpen.value) ||
    (expanded.value && marked.value)
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
// room from the start, so nothing beside it moves when it comes. A line over a picture keeps none: it
// stands at the picture's trailing corner and grows away from the time, and room kept there would
// stand as a hole in the overlay chip.
const JUDGED_WITHIN_SECONDS = 600;
const roomForMark = !props.overPicture && !props.besidePicture && props.sentAt > 0 && Date.now() / 1000 - props.sentAt < JUDGED_WITHIN_SECONDS;


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
