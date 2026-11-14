<template>
  <!-- The body's sections run to its sides, and the foot keeps the panel's gutter of room under the last of them
       unless the launch box stands at the foot (bmo-ui's docs/design.md, 「Room at the foot」). -->
  <UDashboardPanel id="agent" :ui="{ body: launchable === null ? 'p-0 sm:p-0 pb-4 sm:pb-6 overscroll-none' : 'p-0 sm:p-0 overscroll-none' }">
    <template #header>
      <!-- A chat agent's bar wears its face, every other agent's its group's mark (docs/web.md, 「Profile photos」). The
           bar holds the agent's name and mark alone (docs/web.md, 「The title bar」). -->
      <ConsoleTitleBar :title="meta.label" :icon="wearsFace(meta) ? undefined : meta.icon">
        <template v-if="wearsFace(meta)" #leading>
          <AgentMark :agent="meta" size="2xs" class="me-1.5" />
        </template>
      </ConsoleTitleBar>

      <!-- The screen's own row under the bar (docs/web.md, 「Agent screen」): what this agent is doing at its left — its
           group, a supervisor's rooms, the uptime, a stop under way — and what acts on it at its right. On a phone it
           stays one line: the uptime goes behind the chart mark and the actions fold into the shared menu. -->
      <div :class="['flex h-12 shrink-0 items-center gap-2 px-4', TAB_ROW_LINE]" data-screen-row>
        <div class="flex min-w-0 flex-1 items-center gap-2" data-screen-row-status>
          <span class="hidden shrink-0 text-sm text-muted sm:inline">{{ groupLabel($t, meta.group) }}</span>

          <!-- A supervisor's rooms and whether its road can take a turn now. -->
          <SupervisorRooms v-if="settingsKind === 'supervisor'" :name="name" :label="meta.label" :run="placeRun" :rooms="rooms" />

          <!-- The uptime ticks every second, so its digits are the fixed-width ones: a badge
               that changes size once a second shoves the whole row along with it. -->
          <UBadge v-if="run !== null" class="hidden shrink-0 tabular-nums sm:inline-flex" color="success" variant="subtle" :label="runningLabel" />
          <UBadge
            v-if="stopTarget !== null && stops.isStopping(stopTarget)"
            class="hidden shrink-0 sm:inline-flex"
            color="warning"
            variant="subtle"
            :label="$t('live.status.stopping')"
          />
        </div>

        <!-- The actions stand in the row itself rather than in a box of their own: the group reads the room it has off
             the element it stands in, and the row is that room.

             This agent's own figures, behind one mark: what it is running on, what its session is
             carrying, and what its week divided into. The row carries no figure of them — what a
             run spent stands beside that run in the log below.

             What the press opens is the block the home screen already puts under this agent's
             name, drawn by the same component: one agent's figures are one picture wherever the
             console shows them, and a second spelling of them here would be a second thing to
             keep true. The meters in the title bar are a different subject — those are the
             account's windows, and this is this agent.

             On a phone the uptime goes behind this mark too, and the mark stands there for the
             uptime alone where the agent has no figures. -->
        <SkeletonStatus v-if="usageInitial" :label="$t('agents.status.vitals_loading')"><SkeletonBar class="size-5 rounded-sm" /></SkeletonStatus>
        <UPopover v-if="hasFigures || run !== null" :content="{ align: 'end' }" :ui="{ content: 'flex w-80 flex-col gap-2 p-3' }">
          <UTooltip :text="$t('agents.aria.vitals')">
            <UButton
              class="shrink-0"
              :class="{ 'sm:hidden': !hasFigures }"
              icon="i-material-symbols-bar-chart"
              size="sm"
              square
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

        <!-- This agent's own run, stopped from its own screen, its picture and its settings: three or fewer stand
             as icon buttons, and on a phone they are one group behind the shared menu, whose button spins while a
             stop is under way. What a run is stopped by is the target the bot's picture gives it, so this screen
             decides none of it. -->
        <ActionGroup :actions="rowActions" data-screen-row-actions />
      </div>
    </template>

    <template #body>
      <!-- The question stands where the run it is about stands: under this agent's own name, above
           its log, rather than floating over the screen. -->
      <StopConfirm
        v-if="stopTarget !== null && writable"
        :target="stopTarget"
        :label="meta.label"
        :stops="stops"
        class="border-b border-default px-4 py-3"
      />

      <!-- The work view: the job's work order, what it is doing now, what it spent and called, its stages where it is
           co-work or laid out a plan, and its log (docs/web.md, 「The work view」). -->
      <!-- A repository keeps no log of its own: its screen reads the jobs run in it and stands the log of the one going
           or, with none going, the latest, under the worker that job ran on (docs/web.md, 「Agent screen」). -->
      <template v-if="isRepository">
        <ContentSkeleton v-if="repositoryJob === undefined" :rows="6" listClass="flex flex-col gap-2 px-4 py-3" :label="$t('agents.status.jobs_loading')">
          <SkeletonLine width="w-4/5" />
        </ContentSkeleton>
        <BodyLine v-else-if="repositoryJob === null">{{ $t("agents.status.no_jobs") }}</BodyLine>
        <WorkView
          v-else
          ref="view"
          :key="`${repositoryJob.agent}:${repositoryJob.run}`"
          :agent="repositoryJob.agent"
          :place="{ run: repositoryJob.run }"
          :run="repositoryJob.run"
          job
          stepper
          end
        />
      </template>
      <WorkView v-else ref="view" :agent="name" :place="place" :live="chatTurns" :run="placeRun" :job="false" :end="opensAtEnd" />

      <SupervisorSettingsDialog v-if="writable && settingsKind === 'supervisor'" v-model:open="settingsOpen" :name="name" :reread="refreshCatalogue" />
      <RoleSettingsDialog v-else-if="writable && settingsKind === 'role'" v-model:open="settingsOpen" :name="name" @saved="() => void refreshCatalogue()" />
      <RepositorySettingsDialog v-else-if="writable && settingsKind === 'repository'" v-model:open="settingsOpen" :name="name" @saved="() => void refreshCatalogue()" />
      <PictureDialog v-if="picturable && writable" v-model:open="pictureOpen" :title="$t('picture.label.agent')" :description="meta.label" kind="agent" :subject="name" :avatar="agentPicture" />
    </template>

    <template #footer>
      <div v-if="launchable !== null && writable" class="border-t border-default py-4">
        <UContainer class="flex flex-col gap-3">
          <!-- The box says what it will do to the agent whose log stands above it, and to no
               other: what is launched here is this screen's own worker. -->
          <LaunchPrompt
            v-if="launchable !== null && writable"
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
import { TAB_ROW_LINE } from "bmo-ui/app/domain/tabs";
import { isAgentName, POLL_INTERVAL_MS, WORKER_AGENT } from "#shared/config";
import { agentMetaOf, catalogueAgents, groupLabel, launchableAgent, roomTitle, runOfAgent } from "~/domain/agents";
import { useAgentFace, wearsFace } from "~/domain/agent-face";
import { useAdministrator } from "~/domain/access";
import { ensureSectionAccess, useSectionAccess, useSectionAccessReady } from "~/domain/section-access";
import { mayRead, mayWrite } from "#shared/sections";
import { avatarFor } from "~/domain/avatars";
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
import type { JobLine, LiveRun, RoomSummary, StatusView, StopTarget } from "#shared/types";
import type { UsageView } from "#shared/types";
import type { AgentMeta } from "~/domain/agents";
import type { AgentVitals } from "~/domain/vitals";
import type { BarAction } from "bmo-ui/app/domain/tabs";
import type { LogPlace } from "~/domain/log";

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

// This agent changes through the write of its own part of agent management (docs/web.md, 「Access」): the
// supervisors, the roles or the repositories. Its read alone opens the page, its rooms and its log.
const access = useSectionAccess();
const accessReady = useSectionAccessReady();

if (!accessReady.value) await ensureSectionAccess().catch(() => null);

const AGENT_SECTION: Record<AgentMeta["group"], string> = { supervisor: "supervisors", role: "roles", repository: "repositories" };
const writable = computed(() => !accessReady.value || mayWrite(access.value, AGENT_SECTION[meta.value.group]));

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


// Which of the agent management screen's dialogs this screen's settings open (docs/web.md, 「Agent screen」): a
// supervisor's, a role's or a repository's, read off the lists those tabs read under the same keys. A part the
// reader may not read is not asked for.
const readsSupervisors = !accessReady.value || mayRead(access.value, "supervisors");
const readsRoles = !accessReady.value || mayRead(access.value, "roles");
const readsRepositories = !accessReady.value || mayRead(access.value, "repositories");
const { data: settingsSupervisors } = useFetch<{ name: string }[]>("/api/supervisors", { key: "supervisors", lazy: true, server: false, immediate: readsSupervisors });
const { data: settingsRoles } = useFetch<{ roles: { name: string }[] }>("/api/roles", { key: "roles", lazy: true, server: false, immediate: readsRoles });
const { data: settingsRepositories } = useFetch<{ name: string }[]>("/api/repositories", { key: "repositories", lazy: true, server: false, immediate: readsRepositories });
const settingsKind = computed<"supervisor" | "role" | "repository" | null>(() => {
  if (settingsSupervisors.value?.some((one) => one.name === name) === true) return "supervisor";
  if (settingsRoles.value?.roles.some((one) => one.name === name) === true) return "role";

  return settingsRepositories.value?.some((one) => one.name === name) === true ? "repository" : null;
});
const settingsOpen = ref(false);

// A chat agent stands as its face, so its picture is set here, by the administrator alone (docs/web.md, 「Profile
// photos」): the one standing now, or its letter.
const administrator = useAdministrator();
const picturable = computed(() => administrator.value && wearsFace(meta.value));
const pictureOpen = ref(false);
const faceOf = useAgentFace();
const agentPicture = computed(() => faceOf.value(meta.value) ?? avatarFor(new Map(), "person", null, meta.value.label));

// A repository's screen stands the log of its job going or, with none going, its latest, and keeps that job's line at
// its foot: the catalogue says which names are repositories.
const isRepository = computed<boolean>(() => row.value?.kind === "repository");

// The job a repository's screen stands: the run the address names where it is one of its jobs, otherwise the one going,
// otherwise the latest; undefined until it is read, and null where the repository has none.
const repositoryJob = ref<JobLine | null | undefined>(undefined);

async function readRepositoryJob(): Promise<void> {
  if (!isRepository.value) return;

  try {
    const query = placeRun.value === null ? {} : { run: placeRun.value };

    repositoryJob.value = (await $fetch<{ job: JobLine | null }>(`/api/agents/${encodeURIComponent(name)}/job`, { query })).job;
  } catch {
    repositoryJob.value = repositoryJob.value ?? null;
  }
}

watch(isRepository, () => void readRepositoryJob());
onMounted(() => void readRepositoryJob());

// Whether the log opens at its end whatever run it was opened at, as the log dialog that sent the reader here did.
const opensAtEnd = computed<boolean>(() => route.query.end === "1");

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

// What acts on this agent from its row: its stop, its picture and its settings, standing as icon buttons and folding
// into the one menu on a phone.
const rowActions = computed<BarAction[]>(() => {
  const target = stopTarget.value;
  const actions: BarAction[] = [];

  if (target !== null && !stops.isAsking(target) && writable.value) {
    actions.push({
      id: "stop",
      label: t("live.action.stop"),
      icon: "i-material-symbols-stop-circle-outline",
      disabled: stops.isSending(target),
      loading: stops.isStopping(target),
      onSelect: () => stops.ask(target)
    });
  }

  if (picturable.value && writable.value) {
    actions.push({ id: "picture", label: t("picture.label.agent"), icon: "i-material-symbols-add-photo-alternate-outline", onSelect: () => { pictureOpen.value = true; } });
  }

  if (settingsKind.value !== null && writable.value) {
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

// Where the screen opens: at the end of the log, or — when a role slot's tile sent the
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

// The jobs running beside the chat are the agency's, so the receiver's picture says nothing of one starting or
// ending. The agency's job events name it, and the board is read again when one comes.
async function readLiveStatus(): Promise<void> {
  try {
    live.value = (await $fetch<StatusView>("/api/status")).live;
  } catch {
    // The log reads whether the units answer or not; without the picture the header is quiet.
  }
}

onMounted(async () => {
  await readControl();
  await readLiveStatus();
});

// Whether the bot is there decides only whether this screen may launch anything. A turn that
// ended is the bot answering, so that is when it is asked again; while the stream is down it is
// asked at the pace the rest of the console keeps.
useLiveRefresh(() => void readControl(), { on: TURN_ENDED, everyMs: POLL_INTERVAL_MS });
useLiveRefresh(
  () => {
    void readLiveStatus();
    // A job starting or ending in a repository moves which job its screen stands, unless the address names one.
    if (placeRun.value === null) void readRepositoryJob();
  },
  { on: ["worker-run"], everyMs: POLL_INTERVAL_MS }
);

usePolling(() => {
  now.value = Math.floor(Date.now() / 1000);
}, 1000);
</script>
