<template>
  <UDashboardPanel id="agent" :ui="{ body: 'p-0 sm:p-0 overscroll-none' }">
    <template #header>
      <UDashboardNavbar :title="meta.label" :icon="meta.icon">
        <!-- What belongs to this agent alone stands beside its name; the right end keeps what every
             screen carries. -->
        <template #trailing>
          <div class="flex min-w-0 items-center gap-2">
            <span class="hidden text-sm text-muted sm:inline">{{ groupLabel($t, meta.group) }}</span>

            <!-- This agent's own figures, behind one mark: what it is running on, what its session is
                 carrying, and what its week divided into. The bar carries no figure of them — what a
                 run spent stands beside that run in the log below.

                 What the press opens is the block the home screen already puts under this agent's
                 name, drawn by the same component: one agent's figures are one picture wherever the
                 console shows them, and a second spelling of them here would be a second thing to
                 keep true. The meters next to this are a different subject — those are the
                 account's windows, and this is this agent.

                 On a phone the bar has room for the name and two marks beside it, so the uptime
                 goes behind this mark too, and the mark stands there for the uptime alone where
                 the agent has no figures. -->
            <SkeletonStatus v-if="usageInitial" :label="$t('agents.status.vitals_loading')"><SkeletonBar class="size-5 rounded-sm" /></SkeletonStatus>
            <UPopover v-if="hasFigures || run !== null" :content="{ align: 'start' }" :ui="{ content: 'flex w-80 flex-col gap-2 p-3' }">
              <UTooltip :text="$t('agents.aria.vitals')">
                <UButton
                  class="shrink-0"
                  :class="{ 'sm:hidden': !hasFigures }"
                  icon="i-material-symbols-bar-chart"
                  color="neutral"
                  variant="ghost"
                  :aria-label="$t('agents.aria.vitals')"
                />
              </UTooltip>

              <template #content>
                <UBadge v-if="run !== null" class="self-start tabular-nums sm:hidden" color="success" variant="subtle" :label="runningLabel" />
                <AgentVitals v-if="hasFigures" :loading="usageInitial" :vitals="vitals" :now="now" legend="inline" />
              </template>
            </UPopover>

            <!-- The uptime ticks every second, so its digits are the fixed-width ones: a badge
                 that changes size once a second shoves the whole bar along with it. -->
            <UBadge v-if="run !== null" class="hidden tabular-nums sm:inline-flex" color="success" variant="subtle" :label="runningLabel" />

            <!-- This agent's own run, stopped from its own screen. What it is stopped by is the
                 target the bot's picture gives the run, so this screen decides none of it. On a
                 phone the stop, the gate's test and the settings are one group behind the shared
                 menu, whose button spins while the stop is under way. -->
            <div class="hidden items-center gap-2 sm:flex">
              <UBadge
                v-if="stopTarget !== null && stops.isStopping(stopTarget)"
                color="warning"
                variant="subtle"
                :label="$t('live.status.stopping')"
              />
              <UButton
                v-else-if="stopTarget !== null && !stops.isAsking(stopTarget)"
                :label="$t('live.action.stop')"
                size="sm"
                color="neutral"
                variant="outline"
                :disabled="stops.busy()"
                :aria-label="$t('live.aria.stop_named', { name: meta.label })"
                @click="stops.ask(stopTarget)"
              />

              <UButton
                v-if="gate !== null"
                :to="`/gates/${gate.slug}`"
                size="sm"
                color="neutral"
                variant="subtle"
                icon="i-material-symbols-science-outline"
                :label="$t('agents.action.try')"
              />

              <!-- This agent's own settings, where it has any of its own: a worker's whole settings,
                   a gate's row and a room agent's gates, the very pieces the agent management screen
                   shows. -->
              <UTooltip v-if="settingsKind !== null" :text="$t('agents.action.settings')">
                <UButton size="sm" color="neutral" variant="ghost" icon="i-material-symbols-settings-outline" :aria-label="$t('agents.action.settings')" @click="settingsOpen = true" />
              </UTooltip>
            </div>

            <ActionGroup class="sm:hidden" :actions="phoneActions" size="md" />
          </div>
        </template>

        <template #right>
          <DeployMark />
          <TodoOpenButton />
          <UsageMeters />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!-- The question stands where the run it is about stands: under this agent's own name, above
           its log, rather than floating over the screen. -->
      <StopConfirm
        v-if="stopTarget !== null"
        :target="stopTarget"
        :label="meta.label"
        :stops="stops"
        class="border-b border-default px-4 py-3"
      />

      <AgentLogView ref="view" :name="name" :place="place" :live="chatTurns" />

      <WorkerSettingsDialog v-if="settingsKind === 'worker'" v-model:open="settingsOpen" :worker="row" :reread="refreshCatalogue" />
      <GateSettingsDialog v-else-if="settingsKind === 'gate'" v-model:open="settingsOpen" :gate="name" />
      <CompanionSettingsDialog v-else-if="settingsKind === 'companion' && row !== null" v-model:open="settingsOpen" :meta="meta" :agent="row" :reread="refreshCatalogue" />
      <AgentGatesDialog v-else-if="settingsKind === 'gates' && row !== null" v-model:open="settingsOpen" :meta="meta" :agent="row" :reread="refreshCatalogue" />
    </template>

    <template #footer>
      <div v-if="launchable !== null || isJobWorker" class="border-t border-default py-4">
        <UContainer class="flex flex-col gap-3">
          <!-- A job worker's job, the line the CLI keeps at the foot of its own screen. -->
          <JobStatusLine v-if="isJobWorker" :agent="name" :run="placeRun" :now="now" />

          <!-- The box says what it will do to the agent whose log stands above it, and to no
               other: what is launched here is this screen's own worker. -->
          <LaunchPrompt
            v-if="launchable !== null"
            :agent="launchable"
            :worker="isWorker ? name : undefined"
            :link="controlState"
            @launched="follow"
          />
        </UContainer>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { useInitialRead } from "bmo-ui/app/domain/loading";
import { isAgentName, POLL_INTERVAL_MS, WORKER_AGENT } from "#shared/config";
import { agentMetaOf, catalogueAgents, groupLabel, launchableAgent, roomTitle, runOfAgent } from "~/domain/agents";
import { useAgentCatalogue } from "~/domain/catalogue";
import { useControlStatus } from "~/domain/control";
import { agentVitals } from "~/domain/vitals";
import { agentUsage, emptyUsage } from "~/domain/usage";
import { TURN_ENDED, useBotEvents, useChatTurns, useLiveRefresh } from "~/domain/events";
import { useBackClose } from "bmo-ui/app/domain/layers";
import { usePolling } from "~/domain/polling";
import { stopTargetOf, uptimeClock } from "~/domain/status";
import { screenKey } from "~/domain/route-key";
import { stopKey, useStops } from "~/domain/stopping";

import type { LaunchAgent } from "#shared/config";
import type { LiveRun, RoomSummary, StatusView, StopTarget } from "#shared/types";
import type { UsageView } from "#shared/types";
import type { AgentMeta } from "~/domain/agents";
import type { AgentVitals } from "~/domain/vitals";
import type { LogPlace } from "~/domain/log";
import type { BarAction } from "bmo-ui/app/domain/tabs";

// Another agent, or another run or moment to open its log at, is another screen.
definePageMeta({ key: (route) => screenKey(route, ["run", "at", "chat"]) });

// The log itself is the shared view; the page reaches it only to follow new lines after a
// launch it made.
const { t } = useI18n();
const viewRef = useTemplateRef<{ follow: () => Promise<void> }>("view");

const route = useRoute();

// A name carries a colon and may carry a minus sign, so the sidebar encodes it for the URL
// and the screen reads it back.
const name = decodeURIComponent(String(route.params.name));

if (!isAgentName(name)) {
  throw createError({ statusCode: 404, message: t("agents.error.no_such_agent"), fatal: true });
}

// The catalogue is the archive's, so an agent is known whether the bot answers or not; a chat
// agent is known from its own name, and only its room's title has to be waited for. A name the
// catalogue has not answered for yet still opens: its log is kept under that name either way.
const base = computed<AgentMeta>(() => agentMetaOf(t, name, catalogueAgents(), []));

// The catalogue itself, read here rather than left to whichever screen happened to ask for it
// first: opening this address directly is a load with nothing behind it, and what stands at the
// foot of this screen depends on the answer.
const { agents: catalogue, refresh: refreshCatalogue } = useAgentCatalogue();

const { link: controlState, read: readControl } = useControlStatus();
const live = ref<LiveRun[]>([]);

const { data: rooms } = useFetch<RoomSummary[]>("/api/rooms", {
  key: "rooms",
  lazy: true,
  server: false,
  default: () => []
});

const meta = computed<AgentMeta>(() => {
  const found = base.value;

  return found.chatId === null ? found : { ...found, label: roomTitle(t, rooms.value, found.chatId) };
});

// What this agent's own session is carrying, read from the same figures the title bar reads.
const { data: usage, status: usageStatus } = useFetch<UsageView>("/api/usage", {
  key: "usage",
  lazy: true,
  server: false,
  default: emptyUsage
});
const usageInitial = useInitialRead(usageStatus);

// This agent's own row of the catalogue, where the archive holds one for it.
const row = computed(() => catalogue.value.agents.find((held) => held.name === name) ?? null);

// What this agent's session is carrying, out of the same rows every other screen reads.
const contextTokens = computed<number | null>(
  () => (usage.value ?? emptyUsage()).contexts.find((context) => context.agent === name)?.contextTokens ?? null
);

// This agent's figures, shaped the one way this console shapes them. What it is doing right now
// is left out on purpose: the badge beside this mark is already saying it, and saying it twice in
// one bar is the thing this fold is here to stop.
const vitals = computed<AgentVitals>(() =>
  agentVitals(t, {
    name,
    chatId: meta.value.chatId,
    model: row.value?.model ?? null,
    contextTokens: contextTokens.value,
    usage: agentUsage((usage.value ?? emptyUsage()).agents, name),
    live: [],
    compacting: [],
    turn: null
  })
);

// Nothing known about an agent leaves no mark at all, rather than one that opens onto blanks.
const hasFigures = computed<boolean>(
  () => vitals.value.model !== null || vitals.value.contextTokens !== null || vitals.value.usage !== null
);

// A gate is tried on its own screen, the gate unit's, which stands as its placeholder.
const gate = computed<{ slug: string } | null>(() => (row.value?.kind === "gate" ? { slug: name } : null));

// Which of the agent management screen's own editors this agent has: a job worker its whole
// settings, a gate its row of the gate table, an agent whose turn is its settings' pieces its block of
// the Companions tab beside its own gates, an agent whose turn passes gates its own gates. Every other
// agent's road is shared or set on that screen alone, so it has none here (docs/web.md).
const settingsKind = computed<"worker" | "gate" | "companion" | "gates" | null>(() => {
  const kind = row.value?.kind;

  if (kind === "worker" || kind === "gate") return kind;
  if (row.value?.turnShape === "pieces") return "companion";

  return (row.value?.gates ?? []).length > 0 ? "gates" : null;
});
const settingsOpen = ref(false);

// A job worker keeps the line of its job at the foot of its screen, whichever worker it is: the
// catalogue says which agents are workers.
const isJobWorker = computed<boolean>(() => row.value?.kind === "worker");

// The run the screen was opened at, which the job line speaks of where it is one of this worker's jobs.
const placeRun = computed<string | null>(() => (typeof route.query.run === "string" && route.query.run !== "" ? route.query.run : null));

// What this screen may launch on the owner's own words, and what it launches it as. The rule is
// the catalogue's rather than this screen's, so a worker the owner added gets its box without
// anything here being told about it.
const launchable = computed<LaunchAgent | null>(() => launchableAgent(name, catalogue.value.agents));

// A job is launched into the worker whose screen it was typed on, and there is nowhere else for
// it to go.
const isWorker = computed<boolean>(() => launchable.value === WORKER_AGENT);


const run = computed<LiveRun | null>(() => runOfAgent(meta.value, live.value));

// What a stop button on this screen is aimed at: the target the picture gives this agent's own run, and
// nothing while it is not running.
const stopTarget = computed<StopTarget | null>(() => (run.value === null ? null : stopTargetOf(run.value)));
const stops = useStops(t, async (target) => await $fetch<{ state?: string }>("/api/run-stop", { method: "POST", body: { target } }));

// The open question goes back with the back gesture, like everything else a screen goes into.
useBackClose(computed(() => stops.asking.value !== null), () => stops.cancel());

// A run the picture no longer draws has ended, and what stood on it — a stop under way, a refusal — ends
// with it.
watch(stopTarget, (target) => stops.seen(target === null ? [] : [stopKey(target)]), { immediate: true });

// The same three actions as the wide bar stands them, as the phone's one group behind the menu.
const phoneActions = computed<BarAction[]>(() => {
  const target = stopTarget.value;
  const actions: BarAction[] = [];

  if (target !== null && !stops.isAsking(target)) {
    actions.push({
      id: "stop",
      label: t("live.action.stop"),
      icon: "i-material-symbols-stop-circle-outline",
      disabled: stops.busy(),
      loading: stops.isStopping(target),
      onSelect: () => stops.ask(target)
    });
  }

  if (gate.value !== null) {
    const to = `/gates/${gate.value.slug}`;

    actions.push({ id: "try", label: t("agents.action.try"), icon: "i-material-symbols-science-outline", onSelect: () => void navigateTo(to) });
  }

  if (settingsKind.value !== null) {
    actions.push({ id: "settings", label: t("agents.action.settings"), icon: "i-material-symbols-settings-outline", onSelect: () => { settingsOpen.value = true; } });
  }

  return actions;
});

// The turns of the chat agent's going now, shown at the foot of its log with what each has spent so far.
// Only the chat's turns tell the screen what they spend as they go, so no other agent has any.
const turnsGoing = useChatTurns();
const chatTurns = computed(() =>
  row.value?.defaultAnswerer === true
    ? turnsGoing.value.filter((turn) => meta.value.chatId === null || turn.chatId === meta.value.chatId)
    : []
);

// The uptime counts seconds, so it is read against a clock that moves. Only the badge's own
// text depends on it, so the tick redraws that and nothing else, and it asks the bot for
// nothing.
const now = ref(Math.floor(Date.now() / 1000));

// How long this agent's run has been going, counted from when it started. The page's own title
// already says which agent this is, so the badge carries the one thing the title cannot: the
// length of the run, ticking.
const runningLabel = computed<string>(() => {
  const held = run.value;

  return held === null ? "" : t("agents.label.uptime", { time: uptimeClock(now.value - held.startedAt) });
});

// A launch made here has its first lines followed by the view that shows them.
async function follow(): Promise<void> {
  await viewRef.value?.follow();
}


// The live picture says whether this agent is at work; it is asked for once and replaced by
// the one the bot's events carry.
useBotEvents((event) => {
  if (event.type === "live" && event.live !== undefined) {
    live.value = event.live.runs ?? [];
  }
});

// Where the screen opens: at the end of the log, or — when the live status board sent the
// reader here for one run — at the place that run begins. A runner and a job name their run
// outright; a gate names the second it began and the room it ran for.
const place = computed<LogPlace | null>(() => {
  const run = typeof route.query.run === "string" ? route.query.run : "";

  if (run !== "") {
    return { run };
  }

  const at = Number(route.query.at);
  const chat = Number(route.query.chat);

  if (!Number.isSafeInteger(at) || at <= 0) {
    return null;
  }

  return Number.isSafeInteger(chat) ? { at, chat } : { at };
});

onMounted(async () => {
  await readControl();

  try {
    live.value = (await $fetch<StatusView>("/api/status")).live;
  } catch {
    // The log reads whether the bot answers or not; without the picture the header is quiet.
  }
});

// Whether the bot is there decides only whether this screen may launch anything. A turn that
// ended is the bot answering, so that is when it is asked again; while the stream is down it is
// asked at the pace the rest of the console keeps.
useLiveRefresh(() => void readControl(), { on: TURN_ENDED, everyMs: POLL_INTERVAL_MS });

usePolling(() => {
  now.value = Math.floor(Date.now() / 1000);
}, 1000);
</script>
