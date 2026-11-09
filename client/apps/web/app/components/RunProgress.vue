<template>
  <!-- What a row of this conversation holds while the turn it stands for is still running. It is
       the row's words and nothing else: the side, the picture, the header and the chip line under
       it belong to the row, which is the very row the answer will be drawn in, so nothing around
       these lines has to be matched against anything.

       The two lines stand one step apart, and it is the row's own step — the same one between the
       name above them and the chip line below, so the whole row reads at one rhythm. What the turn
       is at right now stands under what opened it and the few lines the agent wrote as it worked,
       and it spreads the turn's own detail under it:
       the state in the pack's words and every call the turn has made so far, in the order it made
       them, whole and never cut. The detail is open while the turn runs, since a reader watching a
       long turn wants what it is doing rather than only that it is doing something. -->
  <div class="flex min-w-0 flex-col items-start gap-(--chat-meta-gap)">
    <!-- What this turn was handed. A turn that read three messages piled up while the last
         answer was being written and a turn that read one look the same otherwise, and a turn
         that read nothing but a quiet instruction looks like nothing at all. -->
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
    <!-- The state is the face of the turn's reasoning block: a shimmering press at the row's left
         edge that says the agent is thinking, and under it the turn's own detail — the state it is at
         and every document and call it has taken so far, oldest first. The row's own header already
         names the agent, so no name column stands beside the block and the detail reads from the
         row's edge. The shimmer is the whole of the sign that the turn is going: no mark spins
         beside it.

         The detail is the turn's own list, so nothing on it is cut on a line and nothing scrolls in a
         box of its own: a long word, path or command wraps at the row's width, and the row grows by
         what it holds (docs/web.md, the room screen's running line). -->
    <ItemTip v-else :id="waitingItem" as="div" class="flex min-w-0 flex-col text-sm leading-(--chat-meta-line)">
      <UChatReasoning
        :streaming="true"
        class="min-w-0"
        :ui="{
          trigger: 'w-auto',
          label: 'whitespace-normal overflow-visible text-clip',
          body: 'max-h-none overflow-visible whitespace-normal'
        }"
      >
        <div class="flex min-w-0 flex-col gap-1">
          <!-- The run's last thinking block, where the bot's picture carries one: as it was written, its line
               breaks kept, a newer block taking its place (docs/web.md, the room screen's running line). -->
          <p v-if="thinking !== null" data-thinking class="text-sm leading-(--chat-meta-line) text-muted whitespace-pre-wrap wrap-anywhere">{{ thinking }}</p>
          <p v-if="detail !== null" class="text-sm leading-(--chat-meta-line) text-muted break-keep wrap-anywhere">{{ detail }}</p>
          <TurnActions v-if="actions.length > 0" :actions="actions" :dropped="dropped" />
        </div>
      </UChatReasoning>
    </ItemTip>
  </div>
</template>

<script setup lang="ts">
import { otherAnswererOf } from "~/domain/agents";
import { phaseDetail, receivedLine, saidLines, thinkingBlock, turnName } from "~/domain/working";

import type { RunState } from "~/domain/events";

interface Props {
  run: RunState;
}

const props = defineProps<Props>();

const { t } = useI18n();
// The line names whoever this row is the turn of, which is the name the answer will stand under.
const name = computed(() => turnName(t, otherAnswererOf(props.run.speaker)));
// What the chat agent's draft process is on, which another supervisor's turn runs none of; the detail says it in place of
// the state.
const detail = computed(() => phaseDetail(t, props.run.progress, otherAnswererOf(props.run.speaker) === undefined ? props.run.draft ?? null : null));
// The last thinking block the turn's run wrote, where its picture carries one.
const thinking = computed(() => thinkingBlock(props.run.progress));
// What the turn has done so far, oldest first, each at its whole length as the agent's log keeps it.
const actions = computed(() => props.run.progress?.actions ?? []);
const dropped = computed(() => props.run.progress?.droppedActions ?? 0);
// What the turn has written as it works, the newest apart from the few before it.
const said = computed(() => saidLines(props.run.progress));
// What the turn was handed, in the room's own words.
const received = computed(() => receivedLine(props.run.received));
// The item whose Job holds the engine this turn waits on, which the line names on hover.
const waitingItem = computed(() => (props.run.progress?.phase === "waiting" ? props.run.progress.waitingFor?.todoId ?? null : null));
</script>
