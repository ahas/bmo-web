<template>
  <!-- One person's activity tab, the administrator's alone (docs/web.md, 「Organisation」, the people tab): their rooms, their
       agents, those agents' sessions and their latest runs, each group read on its own as the tab first opens, with
       skeletons shaped like its rows and a failure said in its place. -->
  <div class="flex flex-col gap-4" data-person-activity>
    <SettingsGroup :title="$t('common.label.room')">
      <FailedRead v-if="rooms.failure.value !== ''" class="py-3" :message="rooms.failure.value" :reading="rooms.reading.value" @retry="rooms.read" />
      <ContentSkeleton v-else-if="rooms.data.value === null" :rows="2" listClass="flex flex-col py-1" :label="$t('roster.status.rooms_loading')">
        <div class="flex items-center gap-3 py-2">
          <SkeletonBar class="size-8 shrink-0 rounded-full" />
          <span class="flex min-w-0 flex-1 flex-col">
            <SkeletonLine width="w-1/2" />
            <SkeletonLine width="w-1/3" />
          </span>
        </div>
      </ContentSkeleton>
      <p v-else-if="rooms.data.value.length === 0" class="py-3 text-sm text-muted">{{ $t("roster.label.no_rooms") }}</p>
      <ul v-else class="flex flex-col py-1" data-roster-rooms>
        <li v-for="room in rooms.data.value" :key="room.chatId">
          <NuxtLink :to="`/rooms/${room.chatId}`" :class="ROW_LINK">
            <UAvatar v-bind="avatarFor(avatars, 'room', room.chatId, room.title)" size="md" class="shrink-0" />
            <span :class="ROW_LINES">
              <span :class="ROW_LINE">
                <HintTip :text="room.title" cut press class="min-w-0 flex-1 truncate text-highlighted">{{ room.title }}</HintTip>
                <span v-if="room.lastMessageAt !== null" class="shrink-0 text-muted tabular-nums">{{ formatStamp(toUnixSeconds(room.lastMessageAt)) }}</span>
              </span>
              <span :class="ROW_LINE" class="text-muted">
                <HintTip :text="roomLine(room)" cut press class="min-w-0 truncate tabular-nums">{{ roomLine(room) }}</HintTip>
              </span>
            </span>
          </NuxtLink>
        </li>
      </ul>
    </SettingsGroup>

    <SettingsGroup :title="$t('agents.label.column_agent')">
      <FailedRead v-if="agents.failure.value !== ''" class="py-3" :message="agents.failure.value" :reading="agents.reading.value" @retry="agents.read" />
      <ContentSkeleton v-else-if="agents.data.value === null" :rows="2" listClass="flex flex-col py-1" :label="$t('roster.status.agents_loading')">
        <div class="flex items-center gap-3 py-2">
          <SkeletonBar class="size-6 shrink-0 rounded-full" />
          <span class="flex min-w-0 flex-1 flex-col">
            <SkeletonLine width="w-1/3" />
            <SkeletonLine width="w-1/2" />
          </span>
        </div>
      </ContentSkeleton>
      <p v-else-if="agents.data.value.length === 0" class="py-3 text-sm text-muted">{{ $t("roster.label.no_agents") }}</p>
      <ul v-else class="flex flex-col py-1" data-roster-agents>
        <li v-for="agent in agents.data.value" :key="agent.name">
          <NuxtLink :to="agentLink(agent.name)" :class="ROW_LINK">
            <AgentMark :agent="markOf(agent)" icon-class="size-6" aria-hidden="true" />
            <span :class="ROW_LINES">
              <span :class="ROW_LINE">
                <HintTip :text="agent.label" cut press class="min-w-0 flex-1 truncate text-highlighted">{{ agent.label }}</HintTip>
                <HintTip :text="$t(agent.enabled ? 'roster.status.on' : 'roster.status.off')" press class="inline-flex shrink-0">
                  <span role="img" class="inline-flex" :aria-label="$t(agent.enabled ? 'roster.status.on' : 'roster.status.off')" data-roster-agent-state>
                    <UIcon
                      :name="agent.enabled ? 'i-material-symbols-toggle-on' : 'i-material-symbols-toggle-off-outline'"
                      class="size-5"
                      :class="agent.enabled ? 'badge-ink text-success' : 'text-muted'"
                    />
                  </span>
                </HintTip>
              </span>
              <span :class="ROW_LINE" class="text-muted">
                <HintTip :text="agentLine(agent)" cut press class="min-w-0 truncate" data-roster-agent-line>{{ agentLine(agent) }}</HintTip>
              </span>
            </span>
          </NuxtLink>
        </li>
      </ul>
    </SettingsGroup>

    <SettingsGroup :title="$t('agents.label.column_sessions')">
      <FailedRead v-if="sessions.failure.value !== ''" class="py-3" :message="sessions.failure.value" :reading="sessions.reading.value" @retry="sessions.read" />
      <ContentSkeleton v-else-if="sessions.data.value === null" :rows="2" listClass="flex flex-col py-1" :label="$t('roster.status.sessions_loading')">
        <div class="flex flex-col py-2">
          <SkeletonLine width="w-1/3" />
          <SkeletonLine width="w-1/2" />
        </div>
      </ContentSkeleton>
      <p v-else-if="sessions.data.value.length === 0" class="py-3 text-sm text-muted">{{ $t("roster.label.no_sessions") }}</p>
      <ul v-else class="flex flex-col py-1" data-roster-sessions>
        <li v-for="session in sessions.data.value" :key="session.id" class="py-2" :class="ROW_LINES">
          <span :class="ROW_LINE">
            <HintTip :text="session.agent" cut class="min-w-0 flex-1 truncate text-highlighted">{{ session.agent }}</HintTip>
            <span v-if="session.context !== null" class="shrink-0 text-muted tabular-nums">{{ contextText(session.context) }}</span>
          </span>
          <span :class="ROW_LINE" class="text-muted">
            <HintTip :text="session.roomTitle ?? session.scope" cut class="min-w-0 flex-1 truncate">{{ session.roomTitle ?? session.scope }}</HintTip>
            <!-- The road keeps a ceiling of half the line, so it gives way before the room it served. -->
            <HintTip :text="sessionRoad(session)" cut class="min-w-0 max-w-1/2 truncate text-toned">{{ sessionRoad(session) }}</HintTip>
          </span>
        </li>
      </ul>
    </SettingsGroup>

    <SettingsGroup :title="$t('roster.label.runs')">
      <FailedRead v-if="runs.failure.value !== ''" class="py-3" :message="runs.failure.value" :reading="runs.reading.value" @retry="runs.read" />
      <ContentSkeleton v-else-if="runs.data.value === null" :rows="3" listClass="flex flex-col py-1" :label="$t('roster.status.runs_loading')">
        <div class="flex flex-col py-2">
          <SkeletonLine width="w-1/2" />
          <SkeletonLine width="w-1/3" />
        </div>
      </ContentSkeleton>
      <p v-else-if="runs.data.value.length === 0" class="py-3 text-sm text-muted">{{ $t("roster.label.no_runs") }}</p>
      <ul v-else class="flex flex-col py-1" data-roster-runs>
        <li v-for="run in runs.data.value" :key="run.id">
          <NuxtLink :to="momentLink(run.agent, toUnixSeconds(run.startedAt))" :class="ROW_LINK">
            <span :class="ROW_LINES">
              <span :class="ROW_LINE">
                <HintTip :text="run.agent" cut press class="min-w-0 flex-1 truncate text-highlighted">{{ run.agent }}</HintTip>
                <span class="shrink-0 text-muted tabular-nums">{{ formatStamp(toUnixSeconds(run.startedAt)) }}</span>
              </span>
              <span :class="ROW_LINE" class="text-muted">
                <HintTip :text="run.roomTitle ?? run.name" cut press class="min-w-0 flex-1 truncate">{{ run.roomTitle ?? run.name }}</HintTip>
                <span v-if="run.endedAt !== null" class="shrink-0 tabular-nums">{{ tookText(run.startedAt, run.endedAt) }}</span>
                <span class="shrink-0">{{ endingText(run) }}</span>
              </span>
            </span>
          </NuxtLink>
        </li>
      </ul>
    </SettingsGroup>
  </div>
</template>

<script setup lang="ts">
import { elapsedText, formatStamp, toUnixSeconds } from "bmo-ui/app/domain/time";

import { groupIcon } from "~/domain/agents";
import { avatarFor, useAvatars } from "~/domain/avatars";
import { percentOf, providerWord, roadText, useProviders } from "~/domain/axes";
import { groupRead } from "~/domain/group-read";
import { countText } from "~/domain/numbers";
import { personBase } from "~/domain/person-panes";
import { runEnding } from "~/domain/roster";
import { agentLink, momentLink } from "~/domain/status";

import type { AgentMarkSubject } from "~/domain/agent-face";
import type { PersonPaneProps } from "~/domain/person-panes";
import type { RosterAgent, RosterRoom, RosterRun, RosterSession } from "#shared/roster";

const props = defineProps<PersonPaneProps>();

const { t } = useI18n();
const avatars = useAvatars();
const { data: providers } = useProviders();

const base = computed(() => personBase(props.user));

// A row of a group that opens what it names: the row's own box, pressed as a whole, its mark centred beside its two
// lines. A row is two lines at every width, the words that say which item it is first and cut last, so a narrow region
// never squeezes them out for the cells beside them.
const ROW_LINK = "-mx-2 flex min-w-0 items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-elevated active:bg-accented";
const ROW_LINES = "flex min-w-0 flex-1 flex-col text-sm";
const ROW_LINE = "flex min-w-0 items-center gap-3";

const rooms = groupRead(() => $fetch<RosterRoom[]>(`${base.value}/rooms`), t("roster.error.rooms_read_failed"));
const agents = groupRead(() => $fetch<RosterAgent[]>(`${base.value}/agents`), t("roster.error.agents_read_failed"));
const sessions = groupRead(() => $fetch<RosterSession[]>(`${base.value}/sessions`), t("roster.error.sessions_read_failed"));
const runs = groupRead(() => $fetch<RosterRun[]>(`${base.value}/runs`), t("roster.error.runs_read_failed"));

function markOf(agent: RosterAgent): AgentMarkSubject {
  const group = agent.kind === "supervisor" ? "supervisor" : "role";

  return { name: agent.name, label: agent.label, chatId: null, group, icon: groupIcon(group) };
}

// An agent's second line: whose seat it is, its supervisor's word or its role, and its road where it has one.
function agentLine(agent: RosterAgent): string {
  const kind = agent.kind === "supervisor" ? t("agents.label.column_supervisor") : (agent.role ?? "");
  const road = agent.road === null ? null : roadText(providers.value, agent.road);

  return [kind, road].filter((one) => one !== null && one !== "").join(" · ");
}

// A room's second line: whose kind of room it is and how many messages it holds.
function roomLine(room: RosterRoom): string {
  return [t(room.kind === "private" ? "roster.label.private_room" : "roster.label.group_room"), t("roster.label.message_count", { count: countText(room.messageCount) })].join(" · ");
}

// The road a session ran on, its provider in the console's words and its model.
function sessionRoad(session: RosterSession): string {
  return [providerWord(providers.value, session.provider), session.model].join(" · ");
}

function contextText(context: { carried: number; window: number }): string {
  return t("roster.label.context", { carried: countText(context.carried), window: countText(context.window), share: percentOf(context.window === 0 ? 0 : context.carried / context.window) });
}

function tookText(startedAt: number, endedAt: number): string {
  return elapsedText(t, toUnixSeconds(endedAt) - toUnixSeconds(startedAt));
}

function endingText(run: RosterRun): string {
  const ending = runEnding(run);

  return ending.outcome === null ? t(ending.key) : t(ending.key, { outcome: ending.outcome });
}

onMounted(() => {
  void rooms.read();
  void agents.read();
  void sessions.read();
  void runs.read();
});
</script>
