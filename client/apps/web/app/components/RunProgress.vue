<template>
  <!-- What a row of this conversation holds while the turn it stands for is still running. It is
       the row's words and nothing else: the side, the picture, the header and the chip line under
       it belong to the row, which is the very row the answer will be drawn in, so nothing around
       these lines has to be matched against anything.

       The two lines stand one step apart, and it is the row's own step — the same one between the
       name above them and the chip line below, so the whole row reads at one rhythm. What the turn
       is at right now stands under what opened it and the few lines the agent wrote as it worked,
       and under the state stand only the newest things the turn did: its last call and the tail of
       its last thinking block, since a reader watching a long turn wants what it is doing now and
       the verdict chips open the whole of it. -->
  <div class="flex min-w-0 flex-col items-start gap-(--chat-meta-gap)">
    <!-- What this turn was handed. A turn that read three messages piled up while the last
         answer was being written and a turn that read one look the same otherwise, and a turn
         that read nothing but a quiet instruction looks like nothing at all. While the turn is on
         a system instruction of its pipeline, a stage or the arrived check, nothing was received
         and the line stands nothing. -->
    <RollingSentence v-if="received !== null" tag="p" class="text-sm leading-(--chat-meta-line) text-muted" :keypath="received.keypath" :figures="received.figures" />

    <!-- What the agent writes as it works: the newest of its progress lines in the row's own words, read as a line
         of the chat, and the few before it above it in the muted ink. They are no messages, so nothing on them
         presses, and each is one line of words that wraps at the row's width, a long run breaking inside itself,
         so nothing takes the room sideways on a phone (docs/web.md, the room screen's progress lines). -->
    <div v-if="said.newest !== null" data-said class="flex min-w-0 max-w-full flex-col gap-1">
      <p v-for="(line, index) in said.earlier" :key="index" data-said-earlier class="text-sm leading-(--chat-meta-line) text-muted whitespace-normal break-keep wrap-anywhere">{{ line }}</p>
      <p data-said-newest class="whitespace-normal break-keep wrap-anywhere text-default">{{ said.newest }}</p>
    </div>

    <!-- Listening is no turn going, so it stands still in the room's muted words, its lines standing
         where a turn's handed line, state and chip line stand, so a turn beginning or ending moves
         nothing above it. -->
    <ListeningLine v-if="props.run.listening" :name="name" :closes-at="props.run.listening.closesAt" />
    <!-- The state is the turn's own account of what it is at: a shimmering line at the row's left edge that says
         what the turn is doing now — thinking, writing, a named tool in use, or the Job it waits on. The row's own
         header already names the agent, so no name column stands beside it, and nothing on it presses or folds: the
         verdict chips under the row open the whole of what the turn did. Under it stand the turn's last call, one
         line that turns like a page as a new call comes, and the last thinking block's tail, streamed in. -->
    <ItemTip v-else :id="waitingItem" as="div" class="flex min-w-0 flex-col gap-1 text-sm leading-(--chat-meta-line)">
      <UChatShimmer data-state :text="state" class="min-w-0 whitespace-normal break-keep wrap-anywhere" />
      <LastAction v-if="last !== null" :action="last" :at="lastAt" />
      <ThinkingPreview v-if="thinking !== null" :text="thinking" />
    </ItemTip>
  </div>
</template>

<script setup lang="ts">
import { otherAnswererOf } from "~/domain/agents";
import { lastAction, receivedLine, saidLines, stateLine, thinkingBlock, turnName } from "~/domain/working";

import type { RunState } from "~/domain/events";

interface Props {
  run: RunState;
}

const props = defineProps<Props>();

const { t } = useI18n();
// The line names whoever this row is the turn of, which is the name the answer will stand under.
const name = computed(() => turnName(t, otherAnswererOf(props.run.speaker)));
// The turn of the round's instruction pipeline the turn is on, where one has started.
const step = computed(() => props.run.step ?? null);
// What the turn is at, in the pack's words, its pipeline's step named there.
const state = computed(() => stateLine(t, props.run.progress, step.value));
// The last thinking block the turn's run wrote, where its picture carries one.
const thinking = computed(() => thinkingBlock(props.run.progress));
// The last call the turn made, and which call of the turn it is, counting the ones the picture dropped.
const last = computed(() => lastAction(props.run.progress));
const lastAt = computed(() => (props.run.progress?.droppedActions ?? 0) + (props.run.progress?.actions.length ?? 0));
// What the turn has written as it works, the newest apart from the few before it.
const said = computed(() => saidLines(props.run.progress));
// What the turn was handed, in the room's own words.
const received = computed(() => receivedLine(props.run.received, step.value));
// The item whose Job holds the engine this turn waits on, which the line names on hover.
const waitingItem = computed(() => (props.run.progress?.phase === "waiting" ? props.run.progress.waitingFor?.todoId ?? null : null));
</script>
