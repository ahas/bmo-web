<template>
  <UContainer ref="feed" class="flex min-h-full flex-1 flex-col gap-3 py-4 sm:py-6">
    <UAlert v-if="log.failure.value" color="error" variant="subtle" :description="log.failure.value" />

    <div class="self-center">
      <UButton
        v-if="log.older.value"
        :loading="log.loadingOlder.value"
        size="sm"
        color="neutral"
        variant="subtle"
        :label="$t('agents.action.older_lines')"
        @click="loadOlder"
      />
      <p v-else-if="rows.length > 0" class="text-sm text-dimmed">{{ $t("agents.message.log_start") }}</p>
    </div>

    <ContentSkeleton v-if="log.loading.value && rows.length === 0" :rows="3" listClass="flex flex-col gap-3" :label="$t('agents.status.log_loading')">
      <ProgressStepSkeleton />
    </ContentSkeleton>
    <!-- An empty log is the whole of the body, so its line stands in the middle of it. -->
    <p v-else-if="rows.length === 0 && !log.failure.value" class="m-auto text-center text-sm text-muted">{{ $t("agents.status.no_log") }}</p>

    <ContentSkeleton v-if="log.loadingOlder.value" listClass="flex flex-col gap-3" :label="$t('agents.status.older_loading')">
      <ProgressStepSkeleton />
    </ContentSkeleton>

    <!-- One agent's log is its runs, a step each on the console's one stepper: the head says how the
         run went and when, and the body is the run's lines with what it spent under its end. -->
    <ProgressStepper v-if="steps.length > 0" :steps="steps" :label="$t('agents.label.run_steps')">
      <template #body="{ step }">
        <ul class="flex flex-col gap-3">
          <template v-for="row in step.rows" :key="row.key">
            <AgentLogRow :row="row" />

            <!-- A run ends with what it spent: for a turn of the chat agent's, the whole round it answered. -->
            <li v-if="chipOf(row) !== null" class="list-none">
              <RunSpend :chip="chipOf(row)!" />
            </li>
          </template>
        </ul>
      </template>
    </ProgressStepper>

    <!-- The turns of the chat agent's going right now, each with what it has spent so far. -->
    <ul v-if="props.live.length > 0" class="flex flex-col gap-1">
      <li v-for="one in props.live" :key="one.chatId" class="list-none">
        <RunSpend :chip="liveChip($t, one.progress)" />
      </li>
    </ul>

    <!-- A screen that opened at one run's place has the rest of the log ahead of it, and
         follows new lines again once it has been read to the end. -->
    <ContentSkeleton v-if="following" listClass="flex flex-col gap-3" :label="$t('agents.status.newer_loading')">
      <ProgressStepSkeleton />
    </ContentSkeleton>
    <div v-if="log.newer.value" class="self-center">
      <UButton size="sm" color="neutral" variant="subtle" :label="$t('agents.action.newer_lines')" @click="followRequested" />
    </div>
  </UContainer>
</template>

<script setup lang="ts">
// One agent's log as a reader sees it. The agent's own page fills its panel with this, and the
// dialog a room opens over a running agent fills itself with the same thing, so what a log looks
// like is written down once. Whatever encloses it does the scrolling: this finds the scrolling
// ancestor it was put inside and holds the reader's place in it.

import { AGENT_LOG_POLL_MS } from "#shared/config";
import { logRuns, openedRun, runStep, useAgentLog } from "~/domain/log";
import { SCROLL_BOTTOM_THRESHOLD_PX, usePolling } from "~/domain/polling";
import { liveChip, runEnds, useRunChips } from "~/domain/turns";

import type { RunProgress } from "#shared/types";
import type { LogPlace, LogRow } from "~/domain/log";
import type { StepperStep } from "~/domain/stepper";
import type { SpendChip } from "~/domain/turns";

interface Props {
  name: string;
  // Where to open: at one run's place, or at the end of the log where it is still being written.
  place?: LogPlace | null;
  // The turns of this agent's chat that are running now, with what their streams have said.
  live?: { chatId: number; progress: RunProgress | null }[];
}

const props = withDefaults(defineProps<Props>(), { place: null, live: () => [] });

const feedRef = useTemplateRef<{ $el?: HTMLElement }>("feed");

// One view reads one agent's log, so whoever shows a second agent keys this by the name and
// gets a view of its own rather than a changed one.
const { t } = useI18n();
const log = useAgentLog(t, props.name);

// Whether the reader is still at the newest line. New lines arrive while they read, so what
// keeps the view at the end is this, not the scroll position.
const stick = ref(true);

const rows = computed(() => log.rows.value);

// The runs on the page, each a step: the newest open, and the one the screen was opened at.
const runs = computed(() => logRuns(rows.value));
const steps = computed<(StepperStep & { rows: LogRow[] })[]>(() => {
  const opened = openedRun(runs.value, props.place);
  const newest = runs.value.at(-1)?.run;

  return runs.value.map((run) => ({
    ...runStep(t, run, { newest: run.run === newest, atEnd: !log.newer.value, opened: run.run === opened }),
    rows: run.rows
  }));
});

// What each run on the page spent, standing under the line it ended on.
const chips = useRunChips(t, props.name, rows);
const ends = computed(() => runEnds(rows.value));

function chipOf(row: LogRow): SpendChip | null {
  const run = ends.value.get(row.key);

  return run === undefined ? null : (chips.value.get(run) ?? null);
}

// Whatever holds this view does the scrolling — a dashboard panel's body on the agent's page,
// the dialog's own body in a room. Either way it is the nearest ancestor that scrolls.
function scroller(): HTMLElement | null {
  let element = feedRef.value?.$el?.parentElement ?? null;

  while (element !== null) {
    if (/(auto|scroll)/.test(getComputedStyle(element).overflowY)) {
      return element;
    }

    element = element.parentElement;
  }

  return feedRef.value?.$el?.parentElement ?? null;
}

function atBottom(): boolean {
  const element = scroller();

  return element === null || element.scrollHeight - element.scrollTop - element.clientHeight < SCROLL_BOTTOM_THRESHOLD_PX;
}

async function scrollToBottom(): Promise<void> {
  await nextTick();

  const element = scroller();

  if (element !== null) {
    element.scrollTop = element.scrollHeight;
    stick.value = true;
  }
}

// The scroller's size as the last scroll met it. A scroll arriving with it changed was made by the
// layout — the box at the foot of a worker's screen arriving and taking its height out of the
// window, the lines reflowing — rather than by the reader, so it does not take a reader off the end.
let measured = { window: 0, content: 0 };

function onScroll(): void {
  const element = scroller();

  if (element === null) {
    return;
  }

  const resized = element.clientHeight !== measured.window || element.scrollHeight !== measured.content;

  measured = { window: element.clientHeight, content: element.scrollHeight };

  if (resized && stick.value) {
    void scrollToBottom();

    return;
  }

  stick.value = atBottom();
}

// The end of the log moved, so a reader standing on it is carried along. The lines themselves are
// only half of what moves it: the window the log is read through gets shorter too — the box the
// owner types work into stands at the foot of an agent's screen and arrives once the catalogue
// has said this agent is one that can be launched into. Both boxes are watched rather than a list
// of the things that change them, which is the same rule the room's own feed is held to.
function onContentGrew(): void {
  if (stick.value) {
    void scrollToBottom();
  }
}

let grewWatch: ResizeObserver | null = null;

// Reading upward: the older page is prepended, so the log is nudged back down by exactly
// what grew above the reader.
async function loadOlder(): Promise<void> {
  const element = scroller();
  const height = element?.scrollHeight ?? 0;
  const added = await log.loadOlder();

  if (element === null || added === 0) {
    return;
  }

  await nextTick();
  element.scrollTop += element.scrollHeight - height;
}

// What arrived after the last line held. The archive is what is asked, not the bot.
const following = ref(false);
async function followRequested(): Promise<void> {
  if (following.value) return;
  following.value = true;
  try { await follow(); } finally { following.value = false; }
}

async function follow(): Promise<void> {
  const added = await log.follow();

  if (added > 0 && stick.value) {
    await scrollToBottom();
  }
}

async function open(): Promise<void> {
  const asked = props.place;

  if (asked === null) {
    await log.load();
    await scrollToBottom();

    return;
  }

  await log.loadAt(asked);
  await nextTick();

  // The run stands at the head of what was loaded, so the top of it is where the reader lands.
  const element = scroller();

  if (element !== null) {
    element.scrollTop = 0;
  }

  stick.value = false;
}

onMounted(async () => {
  const element = scroller();

  element?.addEventListener("scroll", onScroll, { passive: true });

  grewWatch = new ResizeObserver(() => onContentGrew());

  for (const box of [feedRef.value?.$el, element]) {
    if (box !== undefined && box !== null) {
      grewWatch.observe(box);
    }
  }

  await open();
});

onBeforeUnmount(() => {
  scroller()?.removeEventListener("scroll", onScroll);
  grewWatch?.disconnect();
  grewWatch = null;
});

// New lines are followed only while the screen holds the end of the log. One opened at an
// older run stands still until the reader has read forward to the end of it. The agents write
// their lines into the archive themselves and this reads them from there, with the bot nowhere
// in the way and no event to follow them by, so the clock is what carries them — and it runs
// only while a log is open.
usePolling(() => {
  if (!log.newer.value) {
    void follow();
  }
}, AGENT_LOG_POLL_MS);

defineExpose({ follow });
</script>
