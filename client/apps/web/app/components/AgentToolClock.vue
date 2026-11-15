<template>
  <!-- A call's clock (docs/web.md, 「A call's clock lines are no line of the log either」): one line that says whether it
       runs and for how long, or how it ended and how long it took, its process named in a tooltip; and under it, one
       short line for each thing the supervisor's side said of it while it ran. -->
  <div class="flex min-w-0 flex-col gap-1 text-sm" data-tool-clock :data-state="props.clock.state">
    <p class="flex min-w-0 flex-wrap items-center gap-x-2 tabular-nums text-muted">
      <!-- The clock's own mark, where it stands on a row of its own: spinning while the call runs, still where the
           reader asked for less movement. -->
      <UIcon
        v-if="props.mark"
        :name="look.icon"
        class="size-4 shrink-0"
        :class="[look.tone, running ? 'animate-spin motion-reduce:animate-none' : '']"
        :aria-label="look.word"
        role="img"
      />
      <HintTip :text="pidText ?? undefined" :disabled="pidText === null" class="flex min-w-0 items-center gap-x-2" data-tool-clock-state>
        <ToolClockElapsed v-if="running" :started-at="props.clock.startedAt" />
        <template v-else>
          <span :class="look.tone">{{ look.word }}</span>
          <template v-if="cutWord !== null">
            <span aria-hidden="true">·</span>
            <span>{{ cutWord }}</span>
          </template>
          <template v-if="props.clock.tookMs !== null">
            <span aria-hidden="true">·</span>
            <span data-tool-clock-took>{{ spanClock($t, props.clock.tookMs / 1000) }}</span>
          </template>
        </template>
      </HintTip>
    </p>

    <!-- The supervisor's reason for a cut, as it was given. -->
    <p v-if="props.clock.state === 'cut' && props.clock.why" class="break-words text-muted" data-tool-clock-why>{{ props.clock.why }}</p>

    <ul v-if="moments.length > 0" class="flex min-w-0 flex-col gap-1" data-tool-clock-moments>
      <li v-for="(moment, index) in moments" :key="index" class="flex min-w-0 items-start gap-2 text-muted">
        <time class="shrink-0 tabular-nums text-dimmed">{{ formatTime(moment.at) }}</time>
        <HintTip :text="moment.why ?? undefined" :disabled="moment.why === null" class="min-w-0 break-words">{{ moment.words }}</HintTip>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { elapsedText, formatClock, formatTime, spanClock } from "bmo-ui/app/domain/time";

import type { ToolClockState, ToolClockView } from "~/domain/tool-clock";

interface Props {
  clock: ToolClockView;
  // Whether the clock wears a mark of its own: a call's block already wears one on its top line.
  mark?: boolean;
}

const props = withDefaults(defineProps<Props>(), { mark: false });
const { t } = useI18n();

const running = computed(() => props.clock.state === "running");

// Each state's mark, tone and word: done in the success tone, failed in the error tone, and the rest quiet, since a
// long or a cut call is nothing gone wrong with the screen.
const LOOKS: Record<ToolClockState, { icon: string; tone: string; word: string }> = {
  running: { icon: "i-material-symbols-progress-activity", tone: "text-primary", word: "agents.status.call_running" },
  completed: { icon: "i-material-symbols-check-circle-outline", tone: "text-success", word: "agents.label.call_done" },
  failed: { icon: "i-material-symbols-error-outline", tone: "text-error", word: "agents.label.call_failed" },
  "ended-with-turn": { icon: "i-material-symbols-stop-circle-outline", tone: "text-muted", word: "agents.label.clock_turn_ended" },
  cut: { icon: "i-material-symbols-stop-circle-outline", tone: "text-muted", word: "agents.label.clock_cut" }
};

const CUT_WORDS: Record<NonNullable<ToolClockView["cut"]>, string> = {
  "no-progress": "agents.label.clock_cut_no_progress",
  "no-process": "agents.label.clock_cut_no_process",
  supervisor: "agents.label.clock_cut_supervisor",
  stop: "agents.label.clock_cut_stop"
};

const look = computed(() => {
  const held = LOOKS[props.clock.state];

  return { ...held, word: t(held.word) };
});

const cutWord = computed(() => (props.clock.state === "cut" && props.clock.cut !== null ? t(CUT_WORDS[props.clock.cut]) : null));
const pidText = computed(() => (props.clock.pid === null ? null : t("agents.label.clock_pid", { pid: props.clock.pid })));

// Each moment in the console's words, with the reason a failed ask gave for its tooltip.
const moments = computed(() =>
  props.clock.moments.map((moment) => {
    switch (moment.event) {
      case "asked":
        return {
          at: moment.at,
          why: null,
          words: moment.silentMs === null ? t("agents.label.clock_asked") : t("agents.label.clock_asked_silent", { time: elapsedText(t, moment.silentMs / 1000) })
        };
      case "kept":
        return {
          at: moment.at,
          why: null,
          words: moment.until === null ? t("agents.label.clock_kept") : t("agents.label.clock_kept_until", { time: formatClock(moment.until) })
        };
      default:
        return { at: moment.at, why: moment.why, words: t("agents.label.clock_ask_failed") };
    }
  })
);
</script>
