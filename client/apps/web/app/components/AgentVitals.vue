<template>
  <!-- The figures one agent has, each its own word. They wrap rather than being crammed onto a
       line, so at a phone's width they stack and every one of them is read whole instead of
       being cut off at the edge. A figure the machine records nowhere is not here at all — an
       empty place says the console does not know, and a nought would say it measured none. -->
  <!-- The placeholder is one line at every width, so a card that narrows while it waits — the
       count beside it landing — does not fold it onto a second line and change its shape. -->
  <ContentSkeleton v-if="props.loading" :label="$t('agents.status.vitals_loading')">
    <div class="flex h-5 items-center gap-x-2 overflow-hidden">
      <SkeletonBar class="h-4 w-16" />
      <SkeletonBar class="h-4 w-24" />
      <SkeletonBar class="h-4 w-20" />
    </div>
  </ContentSkeleton>
  <div v-else-if="shown" class="flex flex-col gap-1 text-sm">
    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
      <template v-if="props.vitals.work !== null">
        <span class="text-primary">{{ props.vitals.work.label }}</span>
        <!-- Nothing writes down when a session began, so what is counted is the run that is going
             right now. An agent that is not running has no uptime and shows none. -->
        <RollingSentence
          class="text-dimmed"
          :keypath="'agents.label.uptime'"
          :figures="{ time: { value: props.now - props.vitals.work.since, text: uptimeClock(props.now - props.vitals.work.since) } }"
        />
      </template>

      <span v-if="props.vitals.model !== null" class="text-dimmed">
        <template v-if="props.vitals.mode !== null">{{ modeLabel($t, props.vitals.mode) }} · </template>{{ modelLabel(props.vitals.model) }}
      </span>

      <RollingSentence
        v-if="props.vitals.contextTokens !== null"
        class="text-dimmed"
        :keypath="'agents.label.context_tokens'"
        :figures="{ tokens: { value: props.vitals.contextTokens, text: tokenText(props.vitals.contextTokens) } }"
      />

      <!-- What the week burnt, as one number. The total is mostly the same cached prefix read
           again on every resumed turn, so it says how much went past rather than what the agent
           cost, and it stands over the kinds rather than instead of them. Where some of the
           week's runs were written before the kinds were kept apart, what those runs carry
           stands beside it, which is also the answer to a track that stops short of its end. -->
      <template v-if="props.vitals.usage !== null">
        <span class="text-dimmed">{{ $t("agents.label.weekly") }}</span>
        <span class="tabular-nums text-dimmed">{{ totalText($t, props.vitals.usage) }}</span>
        <span v-if="unaccounted !== ''" class="tabular-nums text-dimmed">{{ unaccounted }}</span>
      </template>
    </div>

    <!-- The week itself, as the one picture this console draws whenever parts divide a whole: one
         track cut into the four kinds, with the parts named under it. It is the same bar the
         usage popover puts under a model's row and it is drawn by the same component, because
         what an agent's week divided into is one thing however the screen came to be showing it.
         A week none of whose runs took its share leaves the place blank, with no bar and no dashes:
         the unsplit count beside the total already says the whole week is undivided. -->
    <UsageSplit v-if="props.vitals.usage !== null && kindsKnown(props.vitals.usage)" :tally="props.vitals.usage" :legend="props.legend" />
  </div>
</template>

<script setup lang="ts">
import { modeLabel, modelLabel, uptimeClock } from "~/domain/status";
import { kindsKnown, tokenText, totalText, unsplitText } from "~/domain/usage";

import type { AgentVitals } from "~/domain/vitals";

interface Props {
  vitals: AgentVitals;
  loading?: boolean;
  // The second the whole screen is counting from, so every row on it ticks together and none
  // keeps a clock of its own.
  now: number;
  // Whether the week's four kinds are named under their track. A row of a list on a phone has no
  // line to lay four of them across and folds them away; a block standing on its own — a popover
  // opened on purpose — has the room and shows them, which is what it was opened for.
  legend?: "inline" | "folded";
}

const props = withDefaults(defineProps<Props>(), { legend: "folded" });
const { t } = useI18n();

// What this agent's week could not account for: the runs of it written before the kinds were kept
// apart. Nothing to say is said as nothing at all.
const unaccounted = computed<string>(() => (props.vitals.usage === null ? "" : unsplitText(t, [props.vitals.usage])));

// An agent nothing at all is known about leaves no line behind, rather than an empty one that
// takes up room and says nothing.
const shown = computed<boolean>(
  () =>
    props.vitals.work !== null ||
    props.vitals.model !== null ||
    props.vitals.contextTokens !== null ||
    props.vitals.usage !== null
);
</script>
