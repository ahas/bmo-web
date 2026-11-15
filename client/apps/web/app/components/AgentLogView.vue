<template>
  <!-- The log fills what the work view leaves under its head and stages, and grows past it with its lines. Its height
       is never read off the view's own: that counts the head and stages twice, and the view's foot then ends above
       the log's, where the head held at the top is carried away with the view. -->
  <UContainer ref="feed" class="flex flex-1 flex-col gap-3 py-4 sm:py-6">
    <UAlert v-if="log.failure.value" color="error" variant="subtle" :description="log.failure.value" />

    <!-- The head: reaching it reads the lines above, and once none stand above it says the log starts here. -->
    <div ref="head" class="min-h-1 self-center">
      <p v-if="!log.older.value && shownRows.length > 0" class="text-sm text-dimmed">{{ $t("agents.message.log_start") }}</p>
    </div>

    <ContentSkeleton v-if="(log.loading.value || !opened) && rows.length === 0" :rows="3" listClass="flex flex-col gap-3" :label="$t('agents.status.log_loading')">
      <ProgressStepSkeleton />
    </ContentSkeleton>
    <!-- An empty log is the whole of the body, so its line stands in the middle of it. -->
    <p v-else-if="shownRows.length === 0 && !log.failure.value" class="m-auto text-center text-sm text-muted">{{ $t("agents.status.no_log") }}</p>

    <ContentSkeleton v-if="log.loadingOlder.value" listClass="flex flex-col gap-3" :label="$t('agents.status.older_loading')">
      <ProgressStepSkeleton />
    </ContentSkeleton>

    <!-- One agent's log, flat: a line after another in the order written, a run opening at its start line and ending at
         its end line with what it spent under it (docs/web.md, 「The log is flat」). -->
    <!-- Laid out unseen and stood at its opening place first, then shown, so nothing is seen scrolling. -->
    <ul v-if="shownRows.length > 0" class="flex flex-col gap-3" :class="{ invisible: !opened }" :aria-label="$t('agents.title.work_log')" data-agent-log>
      <template v-for="row in shownRows" :key="row.key">
        <AgentLogRow :row="row" />

        <!-- A run ends with what it spent: for a turn of the chat agent's, the whole round it answered. -->
        <li v-if="chipOf(row) !== null" class="list-none">
          <RunSpend :chip="chipOf(row)!" />
        </li>
      </template>
    </ul>

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
    <!-- The tail: reaching it, where lines stand past what is held, reads them. -->
    <div ref="tail" class="min-h-1" />

    <!-- Once the reader has scrolled up off the end, a way back to it that follows the end again. -->
    <div v-if="opened && !stick && shownRows.length > 0" class="pointer-events-none sticky bottom-4 z-10 flex justify-end">
      <UTooltip :text="$t('agents.action.to_end')">
        <UButton
          class="pointer-events-auto shadow-md"
          color="neutral"
          variant="outline"
          icon="i-material-symbols-arrow-downward"
          :aria-label="$t('agents.action.to_end')"
          data-log-to-end
          @click="toEnd"
        />
      </UTooltip>
    </div>
  </UContainer>
</template>

<script setup lang="ts">
// One agent's log as a reader sees it. The agent's own page fills its panel with this, and the
// dialog a room opens over a running agent fills itself with the same thing, so what a log looks
// like is written down once. Whatever encloses it does the scrolling: this finds the scrolling
// ancestor it was put inside and holds the reader's place in it.

import { AGENT_LOG_POLL_MS } from "#shared/config";
import { useLiveRefresh } from "~/domain/events";
import { useAgentLog } from "~/domain/log";
import { useNextPages } from "~/domain/next-pages";
import { useFootInView } from "bmo-ui/app/domain/foot";
import { SCROLL_BOTTOM_THRESHOLD_PX, usePolling } from "~/domain/polling";
import { liveChip, runEnds, useRunChips } from "~/domain/turns";

import type { AgentLogLine, RunProgress } from "#shared/types";
import type { LogPlace, LogRow } from "~/domain/log";
import type { SpendChip } from "~/domain/turns";

interface Props {
  name: string;
  // Where to open: at one run's place, or at the end of the log where it is still being written.
  place?: LogPlace | null;
  // The turns of this agent's chat that are running now, with what their streams have said.
  live?: { chatId: number; progress: RunProgress | null }[];
  // One run's name, where the view stands at a stage's run and shows its lines alone.
  only?: string | null;
  // Whether the log opens at its end, the newest lines in view, whatever place it was opened at.
  end?: boolean;
}

const props = withDefaults(defineProps<Props>(), { place: null, live: () => [], only: null, end: false });
const emit = defineEmits<{ rows: [rows: LogRow[]]; lines: [lines: AgentLogLine[]] }>();

const feedRef = useTemplateRef<{ $el?: HTMLElement }>("feed");

// One view reads one agent's log, so whoever shows a second agent keys this by the name and
// gets a view of its own rather than a changed one.
const { t } = useI18n();
const log = useAgentLog(t, props.name, props.only);

// Whether the reader is still at the newest line. New lines arrive while they read, so what
// keeps the view at the end is this, not the scroll position.
const stick = ref(true);

// Whether the log stands at its opening place and is shown. Until then its lines are laid out unseen and nothing
// above or below them is read, so the reader never sees it scroll into place.
const opened = ref(false);

const rows = computed(() => log.rows.value);

// The lines shown: every one, or one run's alone where the view stands at a stage's run.
const shownRows = computed<LogRow[]>(() => (props.only === null ? rows.value : rows.value.filter((row) => row.line.run === props.only)));

// Whoever holds the view reads what the log says as it grows: what the session is doing now, and the plan it laid out.
watch(shownRows, (now) => emit("rows", now), { immediate: true });
watch(log.lines, (now) => emit("lines", now), { immediate: true });

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
    anchor.value = null;
  }
}

// The line held at the top of the view, where the log opened at one run's place, until the reader scrolls: the id of the
// first line of the page the place named. Null once the reader has scrolled, and for a log opened at its end.
const anchor = ref<number | null>(null);

// The top of what the reader sees of the log: the scroller's own top, or the foot of whatever stays stuck above the log
// in it, a work view's head among them.
function viewTop(element: HTMLElement): number {
  let top = element.getBoundingClientRect().top;
  let inner: Element | null = feedRef.value?.$el ?? null;

  while (inner !== null && inner !== element) {
    for (let before = inner.previousElementSibling; before !== null; before = before.previousElementSibling) {
      const style = getComputedStyle(before);

      if (style.position === "sticky" && style.top !== "auto") top = Math.max(top, before.getBoundingClientRect().bottom);
    }

    inner = inner.parentElement;
  }

  return top;
}

// The row the anchor's line stands in: its own, or the first after it where it stands folded under another.
function anchorRow(id: number): HTMLElement | null {
  const row = shownRows.value.find((one) => one.line.id >= id);

  return row === undefined ? null : (feedRef.value?.$el?.querySelector<HTMLElement>(`[data-log-row="${row.key}"]`) ?? null);
}

// How far the anchor's row stands below the top of the view, or null where it stands nowhere.
function anchorOffset(element: HTMLElement): number | null {
  const row = anchor.value === null ? null : anchorRow(anchor.value);

  return row === null ? null : row.getBoundingClientRect().top - viewTop(element);
}

// The anchor's row stood at the top of the view.
function holdAnchor(): void {
  const element = scroller();
  const offset = element === null ? null : anchorOffset(element);

  if (element !== null && offset !== null) element.scrollTop += offset;
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

  // A view held at its opening line is carried along by the layout, and let go once the reader scrolls it away.
  if (anchor.value !== null) {
    if (resized) holdAnchor();
    else if (Math.abs(anchorOffset(element) ?? Infinity) > 1) anchor.value = null;

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
  } else if (anchor.value !== null) {
    holdAnchor();
  }
}

let grewWatch: ResizeObserver | null = null;

// Reading upward: the older page is prepended, so the log is nudged back down by exactly
// what grew above the reader. Answers how many lines it brought.
async function loadOlder(): Promise<number> {
  const element = scroller();
  const height = element?.scrollHeight ?? 0;
  const added = await log.loadOlder();

  if (element === null || added === 0) {
    return added;
  }

  await nextTick();
  element.scrollTop += element.scrollHeight - height;

  if (anchor.value !== null) holdAnchor();

  return added;
}

// What arrived after the last line held, read as the reader reaches the tail. The archive is what is asked, not the bot.
const following = ref(false);

// The log's two ends read on as the reader reaches them, a page ahead so the next is already coming: the head the
// lines above, the tail the lines past what is held. Neither reads while the first read is going or after a read
// failed; the failure above the log says why.
const head = useTemplateRef<HTMLElement>("head");
const tail = useTemplateRef<HTMLElement>("tail");
const headBusy = computed(() => !opened.value || log.loading.value || log.loadingOlder.value);
const tailBusy = computed(() => !opened.value || log.loading.value || following.value);
const atHead = useFootInView(head, headBusy, { rootMargin: "200px" });
const atTail = useFootInView(tail, tailBusy, { rootMargin: "200px" });

useNextPages({
  atFoot: atHead,
  more: () => log.older.value && !log.failure.value,
  busy: () => headBusy.value,
  next: async () => (await loadOlder()) > 0
});

useNextPages({
  atFoot: atTail,
  more: () => log.newer.value && !log.failure.value,
  busy: () => tailBusy.value,
  next: async () => {
    following.value = true;

    try {
      const added = await log.follow();

      if (added > 0 && stick.value) await scrollToBottom();

      return added > 0;
    } finally {
      following.value = false;
    }
  }
});

async function follow(): Promise<void> {
  const added = await log.follow();

  if (added > 0 && stick.value) {
    await scrollToBottom();
  }
}

// Back to the end of the log, reading what lies past what is held first, and following the end again.
async function toEnd(): Promise<void> {
  while (log.newer.value) {
    if ((await log.follow()) === 0) break;
  }

  await scrollToBottom();
}

// The lines stood at the end and shown at the first frame they stand there in. Nothing else is waited for: the rest of
// the page starting holds the frames after that one back, and a wait for a row's height to hold would keep the newest
// lines unseen for as long as that takes. A row that settles its height later — its markdown, its chip arriving —
// moves the end as anything else in the box does, and the watch on every block of the box carries a reader standing
// there along.
async function settleAtEnd(): Promise<void> {
  await nextTick();

  const element = scroller();

  if (element === null) return;

  element.scrollTop = element.scrollHeight;
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  element.scrollTop = element.scrollHeight;
  stick.value = true;
}

async function open(): Promise<void> {
  const asked = props.place;

  try {
    if (asked === null || props.end) {
      await log.load();
      await settleAtEnd();

      return;
    }

    // Nothing carries the view to the end while the place is read: the reader lands at the place.
    stick.value = false;

    const first = await log.loadAt(asked);

    // The lines above the place are read in while the log is unseen, so the place's first line is the top of the view
    // when it is shown, with lines above it to read on into rather than another agent's line over it.
    if (first !== null && log.older.value) await log.loadOlder();

    await nextTick();
    anchor.value = first;
    holdAnchor();
  } finally {
    opened.value = true;
  }
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

  // What stands above the log in the same box — a work view's head, its prompt and its stages, read after the
  // lines — moves the end too as it arrives, so every block the box holds is watched beside the lines.
  for (const block of element?.children ?? []) {
    grewWatch.observe(block);
  }

  await open();
});

onBeforeUnmount(() => {
  scroller()?.removeEventListener("scroll", onScroll);
  grewWatch?.disconnect();
  grewWatch = null;
});

// New lines are followed only while the screen holds the end of the log. One opened at an
// older run stands still until the reader has read forward to the end of it. The log is read again
// the moment the agency's stream says one of this agent's runs or sessions moved, a turn went out or
// ended or a job moved (docs/web.md, 「The flat log」), and on the clock while that stream is down.
// The agency announces no single line, so while one of the agent's runs is going the clock carries
// its lines as well; a log whose runs have all ended reads on the stream alone. Nothing is read until the log stands
// at its opening place, so a slow opening read is never joined by a second, larger one: a word of the stream or a turn
// of the clock that came meanwhile is owed, and read once it stands.
const opening = computed(() => !opened.value || log.loading.value);

function followEnd(): void {
  if (!opening.value && !log.newer.value) {
    void follow();
  }
}

const runGoing = computed(() => {
  if (props.live.length > 0) return true;

  const last = [...rows.value].reverse().find((row) => row.depth === 0);

  return last !== undefined && last.line.kind !== "end";
});

useLiveRefresh(followEnd, {
  on: ["agency-run", "agency-turn", "worker-run"],
  where: (event) => event.type !== "agency-run" || event.agent === null || event.agent === props.name,
  everyMs: AGENT_LOG_POLL_MS,
  busy: () => opening.value
});
usePolling(() => {
  if (runGoing.value) followEnd();
}, AGENT_LOG_POLL_MS);

defineExpose({ follow });
</script>
