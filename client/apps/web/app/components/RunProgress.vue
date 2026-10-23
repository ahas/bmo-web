<template>
  <!-- What a row of this conversation holds while the turn it stands for is still running. It is
       the row's words and nothing else: the side, the picture, the header and the chip line under
       it belong to the row, which is the very row the answer will be drawn in, so nothing around
       these two lines has to be matched against anything.

       The two lines stand one step apart, and it is the row's own step — the same one between the
       name above them and the chip line below, so the whole row reads at one rhythm. What the turn
       is at right now stands under what opened it: it is the one line that is read over and over
       while the turn runs, and a line that moves down the screen on every call is one a reader has
       to find again each time. -->
  <div class="flex min-w-0 flex-col items-start gap-(--chat-meta-gap)">
    <!-- What this turn was handed. A turn that read three messages piled up while the last
         answer was being written and a turn that read one look the same otherwise, and a turn
         that read nothing but a quiet instruction looks like nothing at all. -->
    <RollingSentence v-if="received !== null" tag="p" class="text-sm leading-(--chat-meta-line) text-muted" :keypath="received.keypath" :figures="received.figures" />

    <!-- The state, in this room's own words and under the answering agent's own name, and
         shimmering so it reads as something still going. It names the tool being worked while one is out, and stands in every phase, so
         the words are the one place the state is said; what each gate said stands under the
         message it judged, not here. The shimmer is the whole of the sign that the turn is
         going: no mark spins beside it.

         A tool named on the line can run long enough to wrap on a phone, and Korean wraps
         wherever it likes by default — which folds a short Korean word across two lines a letter at a time.
         The line breaks at its spaces instead, and only inside a word where a word on its own
         is wider than the column, which is the one case a tool's own identifier makes. -->
    <!-- Listening is no turn going, so it stands still in the room's muted words, its lines standing
         where a turn's handed line, state and chip line stand, so a turn beginning or ending moves
         nothing above it. -->
    <ListeningLine v-if="props.run.listening" :name="name" :closes-at="props.run.listening.closesAt" />
    <ItemTip v-else :id="waitingItem" class="min-w-0 text-sm leading-(--chat-meta-line)">
      <UChatShimmer :text="look.label" class="text-sm leading-(--chat-meta-line) break-keep wrap-anywhere" />
    </ItemTip>
  </div>
</template>

<script setup lang="ts">
import { phaseLook, receivedLine, turnName } from "~/domain/working";

import type { RunState } from "~/domain/events";

interface Props {
  run: RunState;
}

const props = defineProps<Props>();

const { t } = useI18n();
// The line names whoever this row is the turn of, which is the name the answer will stand under.
const name = computed(() => turnName(t, props.run.speaker));
// The chat agent's turn runs the draft process, whose question under way the line names; a companion's runs none.
const look = computed(() => phaseLook(t, name.value, props.run.progress, props.run.speaker === undefined ? props.run.draft ?? null : null));
const received = computed(() => receivedLine(props.run.received));
// The item whose Job holds the engine this turn waits on, which the line names on hover.
const waitingItem = computed(() => (props.run.progress?.phase === "waiting" ? props.run.progress.waitingFor?.todoId ?? null : null));
</script>
