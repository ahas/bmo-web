<template>
  <!-- The agents of the roles (docs/web.md, 「Agent management screen」, the agents tab; the agency's
       docs/role-agents.md): one row an agent, a seat of its role on one road, in its role's order — what it is doing
       now (「What each agent is doing now」), whose run tied to an item its more-menu stops, its road, and
       the settings that are its own, each a cell that saves it: whether its runs keep their sessions, the share its
       session is folded at, whether it may be called as a co-worker, whether its last session is kept warm and
       whether it is switched on. Pressing an agent's name opens that agent's own settings, where its road, its
       advisor, its sessions and what it lays over its role are changed. -->
  <section class="flex min-w-0 flex-col" :aria-label="$t('agents.label.role_agents')" data-role-agents-table>
    <div class="flex h-12 shrink-0 items-center justify-between gap-2 px-4">
      <h2 class="text-sm font-medium text-highlighted">{{ $t("agents.label.role_agents") }}</h2>
      <UDropdownMenu v-if="!props.readonly" :items="addItems" :content="{ align: 'end' }">
        <UTooltip :text="$t('agents.action.agent_add')">
          <UButton color="neutral" variant="ghost" size="sm" icon="i-material-symbols-add" :aria-label="$t('agents.action.agent_add')" :loading="adding" data-agent-add />
        </UTooltip>
      </UDropdownMenu>
    </div>

    <!-- The rows wait for what their agents are doing as well, so no cell stands up a skeleton of its own after the
         table's has gone. -->
    <DataTableSkeleton v-if="(!view && !error) || (view && !runsSettled)" :headers="tableHeaders(columns)" :rows="4" :label="$t('agents.status.roles_loading')" />
    <p v-else-if="error && !view" role="alert" class="px-4 py-3 text-sm text-error">{{ failureText(error, $t("agents.error.roles_read_failed")) }}</p>
    <p v-else-if="runsSettled && rows.length === 0" class="px-4 py-3 text-sm text-muted">{{ $t("agents.status.agents_none") }}</p>

    <SettingsTable v-if="runsSettled && rows.length > 0" :data="rows" :columns="columns" :row-key="(row: RoleAgentView) => row.name">
      <template #agent-cell="{ row }">
        <button
          type="button"
          :class="CELL_BUTTON"
          class="ps-4"
          :disabled="props.readonly"
          :aria-label="$t('agents.aria.settings_of', { name: row.original.name })"
          @click="openAgent(row.original.name)"
        >
          <SearchText class="truncate font-mono text-sm font-medium" :class="row.original.enabled ? 'text-highlighted' : 'text-dimmed'" :text="row.original.name" :query="props.query" />
        </button>
      </template>

      <!-- What the agent is doing now, read from the role slots on their own clock. -->
      <template #state-cell="{ row }">
        <AgentStateCell
          :doings="doingsOf(row.original.name)"
          :known="agentRuns != null"
          :now="now * 1000"
          :stopping="runsOf(row.original.name).some((run) => run.stop !== null && stops.isStopping(run.stop))"
          @open="(at: number) => openLog(row.original, at)"
        />
      </template>

      <template #role-cell="{ row }">
        <span :class="CELL_TEXT">
          <SearchText class="font-mono text-sm text-highlighted" :text="row.original.role" :query="props.query" />
        </span>
      </template>

      <template #road-cell="{ row }">
        <span :class="CELL_TEXT" class="w-full">
          <SearchText class="truncate text-sm" :class="row.original.provider === null ? 'text-muted' : 'text-highlighted'" :text="roadText(providers, row.original) ?? $t('agents.label.agent_follows')" :query="props.query" />
        </span>
      </template>

      <template #sessions-cell="{ row }">
        <SettingsChoiceCell
          :value="row.original.sessions"
          :items="sessionItems"
          :label="$t('agents.aria.sessions_of', { name: row.original.name })"
          :disabled="props.readonly"
          :save="(value: string | number) => change(row.original, { sessions: String(value) as RoleSessions })"
        >
          <span class="whitespace-nowrap text-sm text-highlighted">{{ sessionsText($t, row.original.sessions) }}</span>
        </SettingsChoiceCell>
      </template>

      <!-- Its own threshold, or the one its provider declares where it sets none, marked as the default. -->
      <template #threshold-cell="{ row }">
        <SettingsInputCell
          :value="thresholdOf(row.original) === null ? '' : percentOf(thresholdOf(row.original)!)"
          :label="$t('agents.aria.threshold_of', { name: row.original.name })"
          :disabled="props.readonly"
          :min="1"
          :max="100"
          :step="1"
          :save="(value: string) => change(row.original, { foldRatio: fractionOf(Number(value)) })"
        >
          <span class="text-sm tabular-nums text-highlighted">{{ thresholdOf(row.original) === null ? "—" : thresholdText($t, thresholdOf(row.original)!, declared(row.original)) }}</span>
        </SettingsInputCell>
      </template>

      <template v-for="field in SWITCHES" :key="field.id" #[`${field.id}-cell`]="{ row }">
        <span :class="CELL_TEXT" class="items-start">
          <USwitch
            :model-value="row.original[field.key]"
            :loading="switching === `${row.original.name}:${field.key}`"
            :disabled="switching !== '' || props.readonly"
            :aria-label="$t(field.aria, { name: row.original.name })"
            @update:model-value="(on: boolean) => void flip(row.original, field.key, on)"
          />
        </span>
      </template>

      <template v-if="!props.readonly" #actions-cell="{ row }">
        <span class="flex h-full min-h-12 items-center justify-end pe-2">
          <UDropdownMenu :items="menuOf(row.original)" :content="{ align: 'end' }">
            <UTooltip :text="$t('common.aria.menu_of', { name: row.original.name })">
              <UButton color="neutral" variant="ghost" size="sm" icon="i-material-symbols-more-vert" :loading="removing === row.original.name" :aria-label="$t('common.aria.menu_of', { name: row.original.name })" />
            </UTooltip>
          </UDropdownMenu>
        </span>
      </template>
    </SettingsTable>

    <p v-if="runsError" role="alert" class="px-4 py-2 break-words text-sm text-error">{{ failureText(runsError, $t("live.error.agent_runs_read_failed")) }}</p>
    <p v-if="refusal !== ''" role="alert" class="px-4 py-2 break-words text-sm text-error">{{ refusal }}</p>

    <AgentSettingsDialog v-model:open="editing" :name="editingAgent" />
    <AgentLogDialog v-if="log !== null" v-model:open="logOpen" :name="log.role" :place="log.place" :rooms="rooms ?? []" />
  </section>
</template>

<script setup lang="ts">
import { tableHeaders } from "bmo-ui/app/domain/column-widths";
import { failureText } from "bmo-ui/app/domain/errors";
import { useNowSeconds } from "bmo-ui/app/domain/time";

import { useAgentRuns } from "~/domain/agent-runs";
import { runDoing, runsOfAgent, STATE_CEILING } from "~/domain/agent-state";
import { defaultThreshold, fractionOf, percentOf, roadText, sessionsText, thresholdText, useProviders } from "~/domain/axes";
import { useConfirm } from "~/domain/confirm";
import { usePolling } from "~/domain/polling";
import { useRoomList } from "~/domain/room-list";
import { CELL_BUTTON, CELL_TEXT } from "~/domain/settings-cells";
import { stopKey, useStops } from "~/domain/stopping";

import type { AgentRun } from "#shared/agent-runs";
import type { RoleAgentView, RoleSessions, RolesView } from "#shared/axes";
import type { DropdownMenuItem } from "@nuxt/ui";
import type { AgentDoing } from "~/domain/agent-state";
import type { LogPlace } from "~/domain/log";
import type { CellChoice } from "~/domain/settings-cells";
import type { SettingsColumn } from "~/domain/settings-columns";

const props = withDefaults(defineProps<{ query?: string; readonly?: boolean }>(), { query: "", readonly: false });
const { t } = useI18n();
const { data: providers } = useProviders();
const askFirst = useConfirm();

// How often which agents carry a run is read again while the tab stands and the browser tab is seen.
const COUNTS_MS = 5_000;

// The roles tab and the role's dialog read the same answer under the same key.
const { data: view, error, refresh } = useFetch<RolesView>("/api/roles", { key: "roles", lazy: true, server: false });

usePolling(() => {
  if (document.visibilityState === "visible" && !editing.value) void refresh();
}, COUNTS_MS);

// Every agent, by its role in the agency's order of roles and by its place among its role's.
const rows = computed<RoleAgentView[]>(() => (view.value?.roles ?? []).flatMap((role) => role.agents));

// What each agent is doing now, read from the role slots on their own clock, and how long ticking each second.
const { data: agentRuns, error: runsError, refresh: rereadRuns } = useAgentRuns();
// Whether the first read of what the agents are doing has answered, with what they do or with why it could not.
const runsSettled = computed(() => agentRuns.value != null || runsError.value != null);
const { now } = useNowSeconds(1_000);
const { data: rooms } = useRoomList();

// Every run let in on an agent, the earliest first.
function runsOf(name: string): AgentRun[] {
  return runsOfAgent(agentRuns.value?.runs ?? [], name);
}

function doingsOf(name: string): AgentDoing[] {
  return runsOf(name).map((run) => runDoing(t, run));
}

// A job's run is stopped through its item, and the answer is the bot's own; the runs are read again after it, since
// the cell reads stopping until the slots no longer hold that run.
const stops = useStops(t, async (target) => {
  const answer = await $fetch<{ state?: string }>("/api/run-stop", { method: "POST", body: { target } });

  void rereadRuns();

  return answer;
});

// A run the slots no longer hold is work that ended, and what stood on it goes with it.
watch(agentRuns, (read) => stops.seen((read?.runs ?? []).flatMap((run) => (run.stop === null ? [] : [stopKey(run.stop)]))));

// A run's stop names the item its job is a run of, asked first naming the run.
async function stop(run: AgentRun): Promise<void> {
  const target = run.stop;

  if (target === null) return;

  const taken = await askFirst({ title: t("live.message.stop_confirm"), item: runDoing(t, run).line, confirm: t("live.action.stop") });

  if (!taken) return;

  refusal.value = "";
  await stops.stop(target);
  refusal.value = stops.errorOf(target);
}

// A working agent opens its role's log where the run asked for stands; an idle one opens nothing.
const log = ref<{ role: string; place: LogPlace | null } | null>(null);
const logOpen = ref(false);

function openLog(agent: RoleAgentView, at: number): void {
  const doing = doingsOf(agent.name)[at];

  if (doing === undefined) return;

  log.value = { role: agent.role, place: doing.place };
  logOpen.value = true;
}

// The switches an agent's row holds, each its own field of the agent.
const SWITCHES = [
  { id: "warm", key: "keepsCache", aria: "agents.aria.agent_keeps_cache_of" },
  { id: "enabled", key: "enabled", aria: "agents.aria.agent_enabled_of" }
] as const;

const columns = computed<SettingsColumn<RoleAgentView>[]>(() => [
  { id: "agent", header: t("agents.label.column_agent") },
  { id: "state", header: t("agents.label.column_state"), ceiling: STATE_CEILING },
  { id: "role", header: t("agents.label.column_role") },
  { id: "road", header: t("agents.label.column_road"), ceiling: 320 },
  { id: "sessions", header: t("agents.label.column_sessions") },
  { id: "threshold", header: t("agents.label.column_threshold") },
  { id: "warm", header: t("agents.label.column_warming") },
  { id: "enabled", header: t("agents.label.column_enabled") },
  ...(props.readonly ? [] : [{ id: "actions", header: "" }])
]);

const sessionItems = computed<CellChoice[]>(() => (["keep", "fresh"] as const).map((value) => ({ value, label: sessionsText(t, value) })));

// The threshold an agent's provider declares, which stands where the agent sets none; none where it names no road.
function declared(agent: RoleAgentView): number | null {
  return agent.model === null ? null : defaultThreshold(providers.value, agent.provider);
}

function thresholdOf(agent: RoleAgentView): number | null {
  return agent.foldRatio ?? declared(agent);
}

const refusal = ref("");

/** One agent's change sent; the table stands as the agency answered it, or the refusal, which a cell shows. */
async function change(agent: RoleAgentView, body: Partial<RoleAgentView>): Promise<string | null> {
  refusal.value = "";

  try {
    const answered = await $fetch<RoleAgentView>(`/api/role-agents/${encodeURIComponent(agent.name)}`, { method: "PATCH", body });

    if (view.value) {
      view.value = { ...view.value, roles: view.value.roles.map((role) => (role.name === answered.role ? { ...role, agents: role.agents.map((one) => (one.name === answered.name ? answered : one)) } : role)) };
    }

    return null;
  } catch (failure) {
    return failureText(failure, t("agents.error.agent_save_failed"));
  }
}

const switching = ref("");

async function flip(agent: RoleAgentView, key: (typeof SWITCHES)[number]["key"], on: boolean): Promise<void> {
  switching.value = `${agent.name}:${key}`;

  try {
    refusal.value = (await change(agent, { [key]: on })) ?? "";
    // How many of a role's runs go at once is the count of its agents switched on, which the roles read anew.
    if (key === "enabled") await refresh();
  } finally {
    switching.value = "";
  }
}

const editing = ref(false);
const editingAgent = ref<string | null>(null);

function openAgent(name: string): void {
  editingAgent.value = name;
  editing.value = true;
}

// One more agent of a role: it stands last among its role's, on the road of the role's last agent, and its own
// settings open so its road can be set.
const adding = ref(false);
const addItems = computed<DropdownMenuItem[]>(() => (view.value?.roles ?? []).map((role) => ({ label: role.name, onSelect: () => void add(role.name) })));

async function add(role: string): Promise<void> {
  adding.value = true;
  refusal.value = "";

  try {
    const last = view.value?.roles.find((one) => one.name === role)?.agents.at(-1);
    const body = last === undefined || last.provider === null ? { role } : { role, provider: last.provider, model: last.model, effort: last.effort, advisor: last.advisor };

    const answered = await $fetch<RoleAgentView>("/api/role-agents", { method: "POST", body });

    await refresh();
    openAgent(answered.name);
  } catch (failure) {
    refusal.value = failureText(failure, t("agents.error.agent_save_failed"));
  } finally {
    adding.value = false;
  }
}

const removing = ref("");

// Each run tied to an item is stopped first in the menu, named by its run where the agent carries more than one; an
// agent that carries a run is not removed, which its menu item says.
function menuOf(agent: RoleAgentView): DropdownMenuItem[] {
  const runs = runsOf(agent.name);
  const stopItems: DropdownMenuItem[] = runs.flatMap((run) => {
    const target = run.stop;

    if (target === null) return [];

    const named = runs.length > 1 ? runDoing(t, run).line : null;

    return [
      {
        label: stops.isStopping(target)
          ? t("live.status.stopping")
          : named === null
            ? t("live.action.stop")
            : t("live.action.stop_run", { run: named }),
        ...(stops.isStopping(target) && named !== null ? { description: named } : {}),
        icon: "i-material-symbols-stop-circle-outline",
        disabled: stops.isSending(target) || stops.isStopping(target),
        onSelect: () => void stop(run)
      }
    ];
  });

  return [
    ...stopItems,
    { label: t("agents.action.settings"), icon: "i-material-symbols-settings-outline", onSelect: () => openAgent(agent.name) },
    {
      label: t("common.action.delete"),
      icon: "i-material-symbols-delete-outline",
      color: "error" as const,
      disabled: agent.carries || removing.value !== "",
      ...(agent.carries ? { description: t("agents.status.agent_in_use") } : {}),
      onSelect: () => void remove(agent)
    }
  ];
}

async function remove(agent: RoleAgentView): Promise<void> {
  const taken = await askFirst({ title: t("agents.message.agent_delete_confirm"), item: agent.name, confirm: t("common.action.delete") });

  if (!taken) return;

  removing.value = agent.name;
  refusal.value = "";

  try {
    await $fetch(`/api/role-agents/${encodeURIComponent(agent.name)}`, { method: "DELETE" });
    await refresh();
  } catch (failure) {
    refusal.value = failureText(failure, t("agents.error.agent_save_failed"));
  } finally {
    removing.value = "";
  }
}

defineExpose({ refresh });
</script>
