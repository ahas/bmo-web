<template>
  <UDashboardPanel id="home">
    <template #header>
      <!-- The front door names nothing: the sidebar's own mark already says which console this is,
           and the bar is left to what holds on every screen. The empty heading is taken out of the
           bar rather than left standing, so it costs neither a gap nor a nameless heading. -->
      <ConsoleTitleBar :ui="{ title: 'hidden' }" />
    </template>

    <template #body>
      <div class="flex flex-col gap-8">
        <section class="flex flex-col gap-3">
          <h2 class="text-sm font-semibold text-highlighted">{{ $t("common.label.room") }}</h2>

          <UAlert v-if="error" color="error" variant="subtle" :description="$t('common.error.rooms_failed')" />
          <!-- Everything short of a read that came back is the same thing to a reader: the list
               is not here yet. They are one branch rather than two because the server and this
               browser stand in different ones of them at the same moment — the read is the
               browser's own, so the server never starts it and is idle where the browser is
               already asking — and two branches would have the page arrive drawn one way and
               redraw itself the other. Saying there are no rooms is a claim, and it is made only
               once a read has come back and said so; before that nobody has asked. -->
          <ContentSkeleton v-else-if="!roomsShown" :rows="4" listClass="flex flex-col gap-2" :label="$t('common.status.rooms_loading')">
            <div class="flex items-start gap-3 rounded-lg border border-default px-4 py-3">
              <SkeletonBar class="size-6 shrink-0 rounded-full" />
              <div class="flex min-w-0 grow flex-col gap-1">
                <SkeletonLine width="w-2/5" />
                <SkeletonLine width="w-3/5" />
              </div>
              <div class="flex shrink-0 flex-col items-end gap-1">
                <SkeletonLine width="w-10" />
                <SkeletonLine width="w-20" />
              </div>
            </div>
          </ContentSkeleton>
          <p v-else-if="rooms.length === 0" class="text-sm text-muted">{{ $t("common.status.no_rooms") }}</p>

          <MovingList v-if="roomsShown && rooms.length > 0" class="flex flex-col gap-2">
            <li v-for="room in rooms" :key="room.chatId">
              <NuxtLink
                class="flex items-start gap-3 rounded-lg border border-default px-4 py-3 transition-colors hover:bg-elevated active:bg-accented"
                :to="`/rooms/${room.chatId}`"
              >
                <UAvatar v-bind="avatarFor(avatars, 'room', room.chatId, room.title)" size="sm" />
                <!-- A room is its name here as everywhere else; its number is in the address
                     for anyone who needs it. Under the name stand the figures of the session
                     that serves it. -->
                <div class="flex min-w-0 grow flex-col gap-1">
                  <p class="truncate text-sm font-medium">{{ room.title }}</p>
                  <p v-if="hasSharedBmo" class="text-sm text-muted">{{ turns.has(room.chatId) ? $t("home.status.bmo_answering") : $t("home.label.bmo_link") }}</p>
                  <AgentVitals :loading="usageInitial" v-else :vitals="vitalsOf(chatAgentName(room.chatId), room.chatId)" :now="now" />
                </div>
                <div class="shrink-0 text-right text-sm text-muted">
                  <RollingSentence tag="p" :keypath="'common.label.count'" :figures="{ n: room.messageCount }" />
                  <p>{{ room.lastMessageAt === null ? $t("common.label.no_record") : formatStamp(room.lastMessageAt) }}</p>
                </div>
              </NuxtLink>
            </li>
          </MovingList>
        </section>

        <!-- The runners and the job workers, each its own block, read from the agency's lists as they are; a block
             the agency lists nobody for does not stand at all, rather than standing empty. -->
        <section v-for="group in standingGroups" :key="group.key" class="flex flex-col gap-3">
          <h2 class="text-sm font-semibold text-highlighted">{{ group.label }}</h2>

          <ul class="grid gap-2 sm:grid-cols-2">
            <li v-for="agent in group.agents" :key="agent.name">
              <NuxtLink
                class="flex items-start gap-3 rounded-lg border border-default px-4 py-3 transition-colors hover:bg-elevated active:bg-accented"
                :to="`/agents/${agent.name}`"
              >
                <AgentMark :agent="agent" class="mt-0.5 text-dimmed" />
                <div class="flex min-w-0 grow flex-col gap-1">
                  <p class="truncate text-sm font-medium">{{ agent.label }}</p>
                  <p class="truncate text-sm text-muted">{{ subtitle(agent) }}</p>
                  <AgentVitals :loading="usageInitial" :vitals="vitalsOf(agent.name, null)" :now="now" />
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
import { useInitialRead } from "bmo-ui/app/domain/loading";
import { POLL_INTERVAL_MS } from "#shared/config";
import { controlLine, controlLink } from "~/domain/control";
import { agentNameLabel, defaultAnswererName, metaOf } from "~/domain/agents";
import { useAgentCatalogue } from "~/domain/catalogue";
import { avatarFor, useAvatars } from "~/domain/avatars";
import { TURN_ENDED, useBmoTurns, useLivePicture, useLiveRefresh } from "~/domain/events";
import { formatStamp } from "bmo-ui/app/domain/time";
import { agentUsage, emptyUsage } from "~/domain/usage";
import { agentVitals } from "~/domain/vitals";

import { agentProviderNames } from "#shared/types";

import type { AgentList, AgentMode, AgentSummary, ChatCompaction, LiveRun, RoomSummary, StatusView, UsageView } from "#shared/types";
import type { AgentMeta } from "~/domain/agents";
import type { AgentVitals, ChatTurn } from "~/domain/vitals";

const { t } = useI18n();

// The uptime is redrawn once a second. Nothing else on the page is held open on a clock: the
// figures ride the bot's own stream, and a clock stands in for it only while it is down.
const TICK_MS = 1_000;

const now = ref(Math.floor(Date.now() / 1000));

const { data, status, error } = useFetch<RoomSummary[]>("/api/rooms", {
  key: "rooms",
  lazy: true,
  server: false,
  default: () => []
});
const roomsLoaded = ref(status.value === "success");
watch(status, value => { if (value === "success") roomsLoaded.value = true; });

const { agents: agentData, refresh: refreshAgents, initial: agentsInitial, failed: agentsFailed } = useAgentCatalogue();
// What each agent has burnt, read off the archive. It stands whether the bot answers or not,
// and it is the same reading the title bar's meters show.
const { data: usageData, status: usageStatus } = useFetch<UsageView>("/api/usage", {
  key: "usage",
  lazy: true,
  server: false,
  default: emptyUsage
});
const usageInitial = useInitialRead(usageStatus);
// A room row carries the figures of the session serving it, or the shared line where one session
// serves them all, and which of the two it is is the catalogue's answer. The rows land once every
// read their lines wait on has, so the placeholder turns into the rows in one step rather than
// into rows still holding placeholders of their own.
// The catalogue carries whether the bot answered; before it has come back nothing is known.
const agentsLink = computed(() => controlLink(agentsInitial.value ? null : agents.value.reachable));
const roomsShown = computed(() => roomsLoaded.value && !usageInitial.value && !agentsInitial.value);

const rooms = computed<RoomSummary[]>(() => data.value ?? []);
const agents = computed<AgentList>(() => agentData.value);
// Whether one supervisor answers every room that names nobody, which the catalogue says by its default answerer.
const hasSharedBmo = computed(() => agents.value.agents.some(agent => agent.kind === "supervisor" && agent.defaultAnswerer));
const usage = computed<UsageView>(() => usageData.value ?? emptyUsage());
// The picture each room wears here, the same one the sidebar and the room itself wear.
const avatars = useAvatars();

// What is running anywhere, and which chats are having their context folded. Both are asked for
// once and then replaced by the picture the bot's own stream carries, so a row changes state
// without the page asking again.
const live = ref<LiveRun[]>([]);
const compacting = ref<ChatCompaction[]>([]);

// The chat agent's own turn, room by room, out of the tab's record of every room's turns: a room's line here is
// the chat agent's session in it, so another supervisor's turn there neither starts nor ends it. The record outlives
// this page, so coming back to it finds the turns that began while another screen was up.
const bmoTurns = useBmoTurns();
const turns = computed(() => new Map<number, ChatTurn>([...bmoTurns.value].map(([chatId, run]) => [chatId, { startedAt: run.startedAt, progress: run.progress }])));

// The blocks that stand below the rooms (docs/web.md, 「Home screen」), each read out of the agency's lists rather than
// written out here, so a role or a repository the owner adds stands on its own under its own name: the runners — the
// roles on a line other than the one a job goes out on — and the job workers, every repository a job works in now.
interface HomeGroup {
  key: "runner" | "worker";
  label: string;
  agents: readonly AgentMeta[];
}

const standingGroups = computed<HomeGroup[]>(() => {
  // A block stands once the figures under its names can stand with it, so it arrives whole.
  if (usageInitial.value) return [];

  const listed = agents.value.agents;
  const jobLine = agents.value.jobLine ?? null;
  const runners = jobLine === null ? [] : listed.filter((agent) => agent.kind === "role" && agent.line !== null && agent.line !== jobLine);
  const working = listed.filter((agent) => agent.kind === "repository" && agent.checkouts.some((checkout) => checkout.jobId !== null));
  const groups: HomeGroup[] = [
    { key: "runner", label: t("agents.label.group_runner"), agents: runners.map((agent) => metaOf(t, agent, rooms.value, listed)) },
    { key: "worker", label: t("agents.label.group_worker"), agents: working.map((agent) => metaOf(t, agent, rooms.value, listed)) }
  ];

  return groups.filter((group) => group.agents.length > 0);
});

// What stands under a name. A runner wears the name the agency files it under; a repository wears what its job is a
// run of and the role it runs as, since which item it is at is the thing worth a glance, or the line a job of no item
// was launched for.
function subtitle(agent: AgentMeta): string {
  const row = agents.value.agents.find((held) => held.name === agent.name);

  if (row === undefined || row.kind !== "repository") return agent.name;

  return row.checkouts
    .filter((checkout) => checkout.jobId !== null)
    .map((checkout) => {
      const work = checkout.itemId === null || checkout.itemId <= 0
        ? (purposeOf(checkout.jobId) ?? t("home.label.loose_job"))
        : t("live.label.work_item", { id: checkout.itemId });

      return checkout.role === null ? work : `${work} · ${agentNameLabel(t, { name: checkout.role, label: roleLabel(checkout.role) })}`;
    })
    .join(", ");
}

// A role's label out of the list in hand.
function roleLabel(name: string): string | null {
  return agents.value.agents.find((held) => held.kind === "role" && held.name === name)?.label ?? null;
}

// Why a job of no item was launched, as its launcher wrote it, where the live picture carries it.
function purposeOf(jobId: number | null): string | null {
  const run = live.value.find((one) => one.kind === "worker" && one.id === jobId);

  return run?.purpose?.trim() || null;
}

// What a provider the agency names is, among the ones the console carries; none for one it does not know.
function modeOf(provider: string | null): AgentMode | null {
  return provider !== null && (agentProviderNames as readonly string[]).includes(provider) ? (provider as AgentMode) : null;
}

// One agent's figures, whatever kind it is: the bot's word for its model and its context, the
// archive's sum of what it has burnt, and what it is doing at this second.
function vitalsOf(name: string, chatId: number | null): AgentVitals {
  const reported: AgentSummary | undefined = agents.value.agents.find((held) => held.name === name);
  const answerer = defaultAnswererName();

  return agentVitals(t, {
    name,
    chatId: name === answerer ? (turns.value.keys().next().value ?? compacting.value[0]?.chatId ?? null) : chatId,
    mode: modeOf(reported?.provider ?? null),
    model: reported?.model ?? null,
    contextTokens: null,
    usage: agentUsage(usage.value.agents, name),
    live: live.value,
    compacting: compacting.value,
    turn: name === answerer ? (turns.value.values().next().value ?? null) : chatId === null ? null : (turns.value.get(chatId) ?? null)
  });
}

// The name the agency keeps a room's answering supervisor under, which every figure of it is filed against.
function chatAgentName(chatId: number): string {
  return hasSharedBmo.value ? defaultAnswererName() : `chat:${chatId}`;
}

useLivePicture((picture) => {
  live.value = picture.runs ?? [];
  // A bot that does not yet say what it is folding says nothing about it, and nothing is what the
  // rows then show.
  compacting.value = picture.compacting ?? [];
});

// The jobs running beside the chat are the agency's, so the receiver's picture says nothing of one starting or
// ending. The agency's job events name it, and the board is read again when one comes.
async function readLiveStatus(): Promise<void> {
  try {
    const snapshot = await $fetch<StatusView>("/api/status");

    live.value = snapshot.live;
    compacting.value = snapshot.compacting;
  } catch {
    // The page stands whether the units answer or not; without the picture the rows say nothing about what is
    // running, which is the truth of what is then known.
  }
}

useLiveRefresh(() => void readLiveStatus(), { on: ["worker-run"], everyMs: POLL_INTERVAL_MS });

// The context a session carries moves when a turn ends, when a session is replaced by a fresh
// one, and when an answer came off a lesser model, so the bot's list is read again on exactly
// those. The rows are keyed by name, so what comes back is patched into the ones already on the
// screen rather than drawn afresh.
useLiveRefresh(() => void refreshAgents(), {
  on: [...TURN_ENDED, "session-replaced", "downgraded"],
  everyMs: POLL_INTERVAL_MS
});


onMounted(async () => {
  const ticker = setInterval(() => {
    now.value = Math.floor(Date.now() / 1000);
  }, TICK_MS);

  onScopeDispose(() => clearInterval(ticker));

  await readLiveStatus();
});
</script>
