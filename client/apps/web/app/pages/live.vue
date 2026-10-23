<template>
  <UDashboardPanel id="live">
    <template #header>
      <UDashboardNavbar :title="$t('screens.label.live')" icon="i-material-symbols-monitor-heart-outline">
        <template #right>
          <DeployMark />
          <TodoOpenButton />
          <UsageMeters />
        </template>
      </UDashboardNavbar>

      <!-- A section to a tab, one of them standing at a time. The tab is in the address, so a link
           opens the section it was taken on. -->
      <div :class="['flex h-12 shrink-0 items-center sm:ps-4 sm:pe-4', TAB_ROW_LINE]">
        <UTabs
          :model-value="tab"
          :items="tabItems"
          :content="false"
          color="neutral"
          variant="link"
          size="sm"
          class="min-w-0 flex-1 self-stretch"
          :ui="TAB_ROW_UI"
          :aria-label="$t('live.aria.sections')"
          @update:model-value="(value: string | number) => setTab(String(value))"
        />
      </div>

      <!-- The machine's line takes what width the row has and is cut short before the refresh is. -->
      <UDashboardToolbar :ui="{ left: 'min-w-0 flex-1', right: 'shrink-0' }">
        <template #left>
          <MachineRoom :standing="status.machine ?? null" :nodes="status.nodes ?? null" :as-of="machineAsOf" :loaded="loaded" />
        </template>
        <template #right>
          <!-- When the bot's picture was taken, and the way to ask for it again: the board is a
               picture of a moment, so the moment itself is what leads back to a fresher one. -->
          <UTooltip :text="$t('common.action.refresh')">
            <UButton
              icon="i-material-symbols-refresh"
              :label="standing"
              :color="controlTone(link)"
              variant="ghost"
              size="sm"
              :loading="reading"
              :aria-label="standing === '' ? $t('common.action.refresh') : $t('common.aria.refresh_standing', { standing })"
              :ui="{ label: 'tabular-nums' }"
              @click="load()"
            />
          </UTooltip>
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <ReadFailure :failure="readFailure" :message="loadError" :reading="reading" @retry="load()" />
      <div v-if="loaded || !loadError" class="flex flex-col gap-8">
        <!-- Every section is drawn and one of them shows. So the pool goes on reading while another
             tab stands, and a tab opened again is full rather than starting over. -->
        <section v-show="tab === 'pool'" :aria-label="$t('live.label.tab_pool')">
          <CoworkerPoolBoard :now="now * 1000" :rooms="rooms" />
        </section>

        <section v-show="tab === 'executions'" class="flex flex-col gap-3" :aria-label="$t('live.aria.herdr_log')">
          <ContentSkeleton v-if="!loaded" :rows="4" listClass="flex flex-col gap-2" :label="$t('live.status.log_loading')">
            <LiveRunSkeleton />
          </ContentSkeleton>

          <p v-else-if="(status.executions ?? []).length === 0" class="text-sm text-muted">{{ $t("common.label.no_record") }}</p>

          <ul v-else class="flex flex-col gap-2">
            <li v-for="execution in status.executions" :key="execution.id" class="flex gap-3 rounded-lg border border-default px-4 py-3 text-sm break-words">
              <UIcon :name="executionIcon(execution.nativeState ?? execution.state)" class="size-5 shrink-0" :class="executionTone(execution.nativeState ?? execution.state)" />
              <div class="min-w-0 grow">
              {{ execution.provider }}<span v-if="execution.model"> · {{ execution.model }}</span> · {{ execution.workKey ?? execution.line }} · {{ execution.nativeState ? nativeState(execution.nativeState) : executionState(execution.state) }}
              <span v-if="execution.attempt"> · {{ $t("live.label.attempt", { n: execution.attempt }) }}</span>
              <span v-if="execution.sharedPane"> · {{ $t("live.label.shares_parent_pane") }}</span>
              <span v-if="execution.exitCode !== null"> · {{ $t("live.label.exit_code", { code: execution.exitCode }) }}</span>
              <details class="mt-2 text-muted break-all">
                <summary class="cursor-pointer hover:text-toned active:text-highlighted">{{ $t("live.label.run_link") }}</summary>
                <p>{{ $t("live.label.execution_id", { id: execution.id }) }}</p>
                <p v-if="execution.root">{{ $t("live.label.execution_root", { id: execution.root }) }}</p>
                <p v-if="execution.parent">{{ $t("live.label.execution_parent", { id: execution.parent }) }}</p>
              </details>
              </div>
            </li>
          </ul>
        </section>
        <section v-for="group in groups" v-show="tab === group.key" :key="group.key" class="flex flex-col gap-3" :aria-label="group.label">
          <!-- The tab standing over it already names the group, so this line says only what is
               missing. -->
          <ContentSkeleton v-if="!loaded" :rows="4" listClass="flex flex-col gap-2" :label="$t('live.status.runs_loading')">
            <LiveRunSkeleton />
          </ContentSkeleton>

          <p v-else-if="(running[group.key] ?? []).length === 0" class="text-sm text-muted">
            {{ status.reachable ? $t("live.status.nothing_running") : $t("live.status.unknown_now") }}
          </p>

          <ul v-else class="flex flex-col gap-2">
            <li v-for="run in running[group.key]" :key="`${run.kind}:${run.id}`" class="flex min-w-0 flex-col">
              <!-- A row leads to the log of the agent that is running it; a run still going
                   is read at the end of that log, where its next line lands. -->
              <NuxtLink
                class="flex items-center gap-3 rounded-lg border border-default px-4 py-3 transition-colors hover:bg-elevated active:bg-accented"
                :to="liveRunLink(run)"
              >
                <!-- A run standing still on a person wears that as its status icon. -->
                <UIcon v-if="waitingLabel($t, run) !== null" name="i-material-symbols-front-hand-outline" class="size-5 shrink-0 text-warning" />
                <UIcon v-else :name="agentIcon(run.agent)" class="size-5 shrink-0 text-primary" />

                <div class="min-w-0 grow">
                  <MarqueeLine class="text-sm font-medium">
                    {{ agentLabel($t, run.agent) }}
                    <span class="font-normal text-muted">· {{ roomTitle($t, rooms, run.chatId) }}</span>
                    <!-- A run of the queue wears the item it is a run of; nothing wears a job
                         number. -->
                    <ItemTip v-if="runningWorkLabel($t, run) !== null" :id="run.todoId" press class="font-normal text-muted">· {{ runningWorkLabel($t, run) }}</ItemTip>
                    <!-- A run that is one step of a planned series shows how many steps before it are done. -->
                    <span v-if="run.step" class="font-normal text-muted tabular-nums">· {{ progressText(run.step.step - 1, run.step.steps) }}</span>
                    <span v-if="run.messageId !== null" class="font-normal text-dimmed">#{{ run.messageId }}</span>
                  </MarqueeLine>
                  <!-- What is elapsed and what is left tick every second, so this line's
                       digits are fixed-width and the words after them stay where they are. -->
                  <MarqueeLine class="text-sm tabular-nums text-muted">
                    <template v-if="launcherLabel($t, run, rooms) !== null">
                      {{ $t("live.label.launched_by", { name: launcherLabel($t, run, rooms) }) }} ·
                    </template>{{ $t("live.label.started_at", { time: formatTime(run.startedAt) }) }} ·
                    <RollingSentence
                      :keypath="'live.label.elapsed'"
                      :figures="{ time: { value: now - run.startedAt, text: formatElapsed($t, now - run.startedAt) } }"
                    /><template
                      v-if="run.capSeconds !== null"
                    >
                      · {{ $t("live.label.cap", { time: formatElapsed($t, run.capSeconds) }) }} ·
                      <RollingNumber :value="run.capSeconds - (now - run.startedAt)" :text="formatRemaining($t, now - run.startedAt, run.capSeconds)" /></template>
                  </MarqueeLine>
                </div>

                <div class="flex shrink-0 items-center gap-2">
                  <UBadge v-if="run.depth !== null" color="neutral" variant="subtle" :label="depthLabel($t, run.depth)" />
                  <UBadge v-if="waitingLabel($t, run) !== null" color="warning" variant="subtle" :label="waitingLabel($t, run)!" />
                  <!-- On a phone the row has room for one chip, and what the run waits on is the one that matters. -->
                  <UBadge
                    v-if="run.model !== null"
                    color="neutral"
                    variant="subtle"
                    :class="{ 'max-sm:hidden': waitingLabel($t, run) !== null }"
                    :label="[run.mode ? modeLabel($t, run.mode) : null, modelLabel(run.model)].filter(Boolean).join(' · ')"
                  />
                  <!-- A stop the bot has taken but not confirmed: the run is winding itself up,
                       and the row says so until the picture stops drawing it. -->
                  <UBadge
                    v-if="stoppable(run) && stops.isStopping(stopTargetOf(run)!)"
                    color="warning"
                    variant="subtle"
                    :label="$t('live.status.stopping')"
                  />
                  <UButton
                    v-else-if="stoppable(run) && !stops.isAsking(stopTargetOf(run)!)"
                    :label="$t('live.action.stop')"
                    size="sm"
                    color="neutral"
                    variant="outline"
                    class="min-h-11"
                    :disabled="stops.busy()"
                    :aria-label="$t('live.aria.stop_named', { name: agentLabel($t, run.agent) })"
                    @click.prevent.stop="stops.ask(stopTargetOf(run)!)"
                  />
                  <UIcon name="i-material-symbols-chevron-right" class="size-4 shrink-0 text-dimmed" />
                </div>
              </NuxtLink>

              <WatchDetail v-if="watchOfRun(watches, run) !== null" :watch="watchOfRun(watches, run)!" :now="now" class="mt-2" />

              <!-- The row asks once more where it stands rather than stopping on the first
                   press, and what a refused stop was told stays on the row with it. -->
              <StopConfirm
                v-if="stoppable(run)"
                :target="stopTargetOf(run)!"
                :label="agentLabel($t, run.agent)"
                :stops="stops"
                class="mt-2"
              />
            </li>
          </ul>

          <template v-if="group.key === 'runner' && loose.length > 0">
            <h3 class="mt-2 text-base font-medium text-toned">{{ status.reachable ? $t("live.label.watch_without_runner") : $t("live.label.watch") }}</h3>

            <ul class="flex flex-col gap-2">
              <!-- A watch no run holds is its one line too: its room and its state open with the
                   rest of it. -->
              <li v-for="watch in loose" :key="watch.id" class="flex items-start gap-3 rounded-lg border border-default px-4 py-3">
                <UIcon :name="watch.kind === 'timer' ? 'i-material-symbols-timer-outline' : 'i-material-symbols-hourglass-outline'" class="mt-1.5 size-5 shrink-0 text-primary" />
                <WatchDetail
                  :watch="watch"
                  :now="now"
                  :context="`${roomTitle($t, rooms, watch.chatId)} · ${watch.kind === 'timer' ? $t('live.label.timer') : status.reachable ? $t('live.status.waiting_next_check') : $t('live.status.check_runner_unknown')}`"
                  class="min-w-0 grow"
                />
              </li>
            </ul>
          </template>

          <h3 class="mt-2 text-base font-medium text-toned">{{ $t("live.title.recent_log") }}</h3>

          <p v-if="(recent[group.key] ?? []).length === 0" class="text-sm text-muted">{{ $t("common.label.no_record") }}</p>

          <ul v-else class="flex flex-col gap-2">
            <li v-for="row in recent[group.key]" :key="row.key">
              <!-- A run that is over is read from the place in the log where it began. -->
              <NuxtLink
                class="flex items-center gap-3 rounded-lg border border-default px-4 py-3 transition-colors hover:bg-elevated active:bg-accented"
                :to="row.to"
              >
                <UIcon :name="toneIcon(row.tone)" class="size-5 shrink-0" :class="toneText(row.tone)" />

                <div class="min-w-0 grow">
                  <MarqueeLine class="text-sm font-medium">
                    {{ row.agent }}
                    <span class="font-normal text-muted">· {{ row.room }}</span>
                    <span v-if="row.note !== null" class="font-normal text-dimmed">· {{ row.note }}</span>
                  </MarqueeLine>
                  <!-- The moment stands still. A marquee is for a line of words, where what
                       clipping costs is the end of the words and moving them is the only way to
                       read it; a moment is a datum of fixed width and reading it is a glance, so
                       a clock that will not hold still is worse than one that is merely narrow.
                       Given no room it breaks between the day and the hour instead — nothing is
                       lost, and nothing moves. -->
                  <time class="block text-sm tabular-nums text-muted">{{ formatStamp(row.at) }}</time>
                </div>

                <div class="flex shrink-0 items-center gap-2">
                  <span v-if="row.duration !== null" class="text-sm tabular-nums text-muted">{{ row.duration }}</span>
                  <UBadge :color="row.tone" variant="subtle" :label="row.outcome" />
                  <UIcon name="i-material-symbols-chevron-right" class="size-4 shrink-0 text-dimmed" />
                </div>
              </NuxtLink>
            </li>
          </ul>
        </section>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { POLL_INTERVAL_MS } from "#shared/config";
import { controlLine, controlLink, controlTone } from "~/domain/control";
import type { ControlLink } from "~/domain/control";
import { agentIcon, agentLabel, roomTitle } from "~/domain/agents";
import { failureText } from "bmo-ui/app/domain/errors";
import { TURN_ENDED, useBotEvents, useLiveRefresh, useReadFailure } from "~/domain/events";
import { useBackClose } from "bmo-ui/app/domain/layers";
import { progressText } from "~/domain/numbers";
import { useNarrow } from "bmo-ui/app/domain/screen";
import {
  depthLabel,
  formatElapsed,
  formatRemaining,
  gateRows,
  jobRows,
  launcherLabel,
  liveRunLink,
  liveRunsOf,
  modelLabel,
  modeLabel,
  runningWorkLabel,
  runRows,
  stoppable,
  stopTargetOf,
  waitingLabel,
  isLiveTab,
  LIVE_TABS,
  statusGroups
} from "~/domain/status";
import { stopKey, useStops } from "~/domain/stopping";
import { TAB_ROW_LINE, TAB_ROW_UI } from "bmo-ui/app/domain/tabs";
import { formatStamp, formatTime, toUnixSeconds } from "bmo-ui/app/domain/time";
import { unheldWatches, watchOfRun } from "~/domain/watches";

import type { BotEventType, LiveRun, RoomSummary, StatusView, WatchView } from "#shared/types";
import type { LiveTab, OutcomeTone, RecentRow, StatusGroup } from "~/domain/status";

// The elapsed figures are redrawn once a second; nothing else on this page is held open.
const TICK_MS = 1_000;

// The news that moves what this page shows: a run's whole picture, a gate's verdict written
// down, a turn coming to an end — the chat's, or any agent's as the agency says it — and the queue moving,
// which a job starting or ending moves. A room saying something moves the archive of that room and
// nothing here, so it is not on the list — and a busy room says a great deal.
const MOVES_HISTORY: readonly BotEventType[] = ["live", "judgement", "agency-turn", "todo", ...TURN_ENDED];

// The mark a finished row wears beside its outcome word, in the outcome's own colour.
const TONE_ICONS: Record<OutcomeTone, string> = {
  success: "i-material-symbols-check-circle-outline",
  error: "i-material-symbols-cancel-outline",
  warning: "i-material-symbols-warning-outline",
  neutral: "i-material-symbols-radio-button-checked-outline"
};

const TONE_TEXT: Record<OutcomeTone, string> = {
  success: "text-success",
  error: "text-error",
  warning: "text-warning",
  neutral: "text-muted"
};

function toneIcon(tone: OutcomeTone): string {
  return TONE_ICONS[tone];
}

function toneText(tone: OutcomeTone): string {
  return TONE_TEXT[tone];
}

// An execution record's state read as an outcome, so it wears the same marks as the rows below.
function executionOutcome(state: string): OutcomeTone {
  if (["completed", "exited"].includes(state)) return "success";
  if (["failed", "launch-error", "timeout"].includes(state)) return "error";
  if (["cancelled", "unresolved", "unknown"].includes(state)) return "warning";

  return "neutral";
}

function executionIcon(state: string): string {
  return ["requested", "started", "launching", "running"].includes(state) ? "i-material-symbols-progress-activity" : toneIcon(executionOutcome(state));
}

function executionTone(state: string): string {
  return toneText(executionOutcome(state));
}

function nativeState(state: string): string {
  return ({ requested: t("live.label.child_requested"), started: t("live.label.child_started"), completed: t("live.label.child_done"), failed: t("live.label.child_failed"), unresolved: t("live.label.child_unknown") } as Record<string, string>)[state] ?? t("live.label.child_unknown");
}

function executionState(state: string): string {
  return ({ launching: t("live.label.start_requested"), running: t("live.label.run_started"), exited: t("live.label.process_ended"), cancelled: t("common.action.cancel"), timeout: t("live.label.timed_out"), "launch-error": t("live.label.start_failed"), unknown: t("live.label.state_unknown") } as Record<string, string>)[state] ?? t("live.label.state_unknown");
}

function emptyStatus(): StatusView {
  return { reachable: false, live: [], compacting: [], liveAt: null, gates: [], runners: [], jobs: [] };
}

const status = ref<StatusView>(emptyStatus());
const now = ref(Math.floor(Date.now() / 1000));

// Every row that names a target carries a stop button, whichever section it stands in: what a row is
// stopped by is the bot's own answer and not this screen's reading of the row (`docs/web.md`,
// 「Live status screen」). The row closes when the run's own ending reaches it, so what the board
// shows next comes from the bot's picture rather than from the call.
const { t } = useI18n();
const stops = useStops(t, async (target) => {
  const answer = await $fetch<{ state?: string }>("/api/run-stop", { method: "POST", body: { target } });

  void load();

  return answer;
});

// An open question is a step this screen went into, so the back gesture takes it back the way it
// takes back everything else drawn over or gone into (`~/domain/layers`).
useBackClose(computed(() => stops.asking.value !== null), () => stops.cancel());

// Which section of the board stands. It is in the address and nowhere else, so a link opens the
// section it was taken on, and moving to another is a step of the history.
const route = useRoute();
const router = useRouter();

const tab = computed<LiveTab>(() => (isLiveTab(route.query.tab) ? route.query.tab : "pool"));
// On a phone the row has not the width for both a mark and a name on six tabs, and the name is
// what a reader picks a section by, so the marks are what gives way.
const narrow = useNarrow();

const tabItems = computed(() => LIVE_TABS.map((one) => (narrow.value ? { value: one.value, label: t(one.label) } : { ...one, label: t(one.label) })));

function setTab(next: string): void {
  if (!isLiveTab(next) || next === tab.value) return;

  void router.push({ query: { ...route.query, tab: next === LIVE_TABS[0]?.value ? undefined : next } });
}

// The groups of runs, each standing under its own tab.
const groups = computed<readonly StatusGroup[]>(() => statusGroups(t));

const { data: roomList } = useFetch<RoomSummary[]>("/api/rooms", {
  key: "rooms",
  lazy: true,
  server: false,
  default: () => []
});

const rooms = computed<RoomSummary[]>(() => roomList.value ?? []);

// Nothing is known of the bot until the first picture of it has come back, or the stream has
// said it is up; what the button carries before that is the calm line, not the failure.
const link = computed<ControlLink>(() => controlLink(loaded.value || status.value.reachable ? status.value.reachable : null, status.value.slow === true));

const standing = computed<string>(() => {
  if (link.value !== "reachable") {
    return controlLine(t, link.value);
  }

  return status.value.liveAt === null ? "" : t("live.label.as_of", { time: formatTime(status.value.liveAt) });
});

// When the bot last read the machine, in the same words the picture's own moment is given.
const machineAsOf = computed<string>(() => {
  const at = status.value.machine?.reading?.at ?? null;

  return at === null ? "" : formatTime(Math.floor(at / 1000));
});

const running = computed<Record<string, LiveRun[]>>(() =>
  Object.fromEntries(statusGroups(t).map((group) => [group.key, liveRunsOf(status.value.live, group)]))
);

// A row the picture no longer draws is a run that ended, and what was standing on it — the word
// saying it is stopping, a refusal it was told — ends with it. Sections are not what prunes any of this: a
// section nobody is looking at still has its rows.
watch(
  () => status.value.live,
  (runs) => stops.seen(runs.flatMap((run) => { const target = stopTargetOf(run); return target === null ? [] : [stopKey(target)]; })),
  { immediate: true }
);

const watches = computed<WatchView[]>(() => status.value.watches ?? []);

// The watches the runner group shows apart. While the bot does not answer no run is known, so
// every standing watch stands here, under a heading that does not claim no run holds it.
const loose = computed<WatchView[]>(() => unheldWatches(watches.value, status.value.live));

// A run whose row was never closed and which the bot's live list no longer carries is one that
// died without reporting, so both halves are built together. The runners and the editors write
// their rows into the same table and are told apart by what kind of agent ran them, so each
// block is read out of that table under its own kind.
const recent = computed<Record<string, RecentRow[]>>(() => ({
  gate: gateRows(t, status.value.gates, rooms.value),
  runner: runRows(t, status.value.runners, status.value.live, rooms.value, "runner"),
  editor: runRows(t, status.value.runners, status.value.live, rooms.value, "editor"),
  worker: jobRows(t, status.value.jobs, status.value.live, rooms.value)
}));

let ticker: ReturnType<typeof setInterval> | null = null;
const loaded = ref(false), loadError = ref("");
let loading = false;
const reading = ref(false);
let disposed = false;
onScopeDispose(() => { disposed = true; });
let owed = false;

async function load(): Promise<void> {
  if (disposed) return;
  // One request at a time; news that arrived while it was in flight is asked for again.
  if (loading) {
    owed = true;

    return;
  }

  loading = true;
  reading.value = true;

  try {
    const answer = await $fetch<StatusView>("/api/status");
    if (disposed) return;
    status.value = answer;
    loaded.value = true;
    loadError.value = "";
  } catch (error) {
    if (disposed) return;
    loadError.value = failureText(error, t("live.error.load_failed"));
    // The route answers whether or not the bot does, so a failure here is this app's own;
    // what is on the screen stands until the next read.
  } finally {
    loading = false;
    reading.value = false;

    if (owed) {
      owed = false;
      void load();
    }
  }
}

const readFailure = useReadFailure({ failed: () => loadError.value !== "", reading: () => reading.value, reread: () => void load() });

// A live event carries the whole picture, so it replaces the live list outright without asking
// the server for anything.
useBotEvents((event) => {
  if (event.type === "live" && event.live !== undefined) {
    status.value = {
      ...status.value,
      reachable: true,
      live: event.live.runs ?? [],
      liveAt: toUnixSeconds(event.live.at)
    };
  }
});

// The history behind the live list comes from the archive, so it is read again when the news
// says something was written there — and on this screen's own clock while the stream is down,
// since a board of what is running must never sit on a picture it cannot know is still true.
useLiveRefresh(() => void load(), { on: MOVES_HISTORY, everyMs: POLL_INTERVAL_MS });

onMounted(() => {
  void load();

  ticker = setInterval(() => {
    now.value = Math.floor(Date.now() / 1000);
  }, TICK_MS);
});

onScopeDispose(() => {
  if (ticker !== null) {
    clearInterval(ticker);
  }
});
</script>
