<template>
  <!-- The agents of the roles (docs/web.md, 「Agent management screen」, the agents tab; the agency's
       docs/role-agents.md): one row an agent, a seat of its role on one road, in its role's order — its road, and
       the settings that are its own, each a cell that saves it: whether its runs keep their sessions, the share its
       session is folded at, whether it may be called as a co-worker, whether its last session is kept warm and
       whether it is switched on. Pressing an agent's name opens its role's agents, where its road, its place and
       what it lays over its role are changed. -->
  <section class="flex min-w-0 flex-col" :aria-label="$t('agents.label.role_agents')" data-role-agents-table>
    <div class="flex h-12 shrink-0 items-center justify-between gap-2 px-4">
      <h2 class="text-sm font-medium text-highlighted">{{ $t("agents.label.role_agents") }}</h2>
      <UDropdownMenu v-if="!props.readonly" :items="addItems" :content="{ align: 'end' }">
        <UTooltip :text="$t('agents.action.agent_add')">
          <UButton color="neutral" variant="ghost" size="sm" icon="i-material-symbols-add" :aria-label="$t('agents.action.agent_add')" :loading="adding" data-agent-add />
        </UTooltip>
      </UDropdownMenu>
    </div>

    <DataTableSkeleton v-if="!view && !error" :headers="tableHeaders(columns)" :rows="4" :label="$t('agents.status.roles_loading')" />
    <p v-else-if="error && !view" role="alert" class="px-4 py-3 text-sm text-error">{{ failureText(error, $t("agents.error.roles_read_failed")) }}</p>
    <p v-else-if="rows.length === 0" class="px-4 py-3 text-sm text-muted">{{ $t("agents.status.agents_none") }}</p>

    <SettingsTable v-if="rows.length > 0" :data="rows" :columns="columns" :row-key="(row: RoleAgentView) => row.name">
      <template #agent-cell="{ row }">
        <button
          type="button"
          :class="CELL_BUTTON"
          class="ps-4"
          :disabled="props.readonly"
          :aria-label="$t('agents.aria.settings_of', { name: row.original.name })"
          @click="openRole(row.original.role)"
        >
          <span class="size-1.5 shrink-0 rounded-full" :class="row.original.carries ? 'bg-primary' : 'bg-transparent'" />
          <SearchText class="truncate font-mono text-sm font-medium" :class="row.original.enabled ? 'text-highlighted' : 'text-dimmed'" :text="row.original.name" :query="props.query" />
        </button>
      </template>

      <template #role-cell="{ row }">
        <span :class="CELL_TEXT">
          <SearchText class="font-mono text-sm text-highlighted" :text="row.original.role" :query="props.query" />
        </span>
      </template>

      <template #road-cell="{ row }">
        <span :class="CELL_TEXT" class="w-full">
          <SearchText class="truncate text-sm" :class="row.original.provider === null ? 'text-muted' : 'text-highlighted'" :text="agentRoadText(providers, row.original) ?? $t('agents.label.agent_follows')" :query="props.query" />
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

    <p v-if="refusal !== ''" role="alert" class="px-4 py-2 break-words text-sm text-error">{{ refusal }}</p>

    <RoleAgentsDialog v-model:open="editing" :role="editingRole" />
  </section>
</template>

<script setup lang="ts">
import { tableHeaders } from "bmo-ui/app/domain/column-widths";
import { failureText } from "bmo-ui/app/domain/errors";

import { defaultThreshold, fractionOf, percentOf, sessionsText, thresholdText, useProviders } from "~/domain/axes";
import { useConfirm } from "~/domain/confirm";
import { usePolling } from "~/domain/polling";
import { agentRoadText } from "~/domain/role-agents";
import { CELL_BUTTON, CELL_TEXT } from "~/domain/settings-cells";

import type { RoleAgentView, RoleSessions, RolesView } from "#shared/axes";
import type { DropdownMenuItem } from "@nuxt/ui";
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

// The switches an agent's row holds, each its own field of the agent.
const SWITCHES = [
  { id: "warm", key: "keepsCache", aria: "agents.aria.agent_keeps_cache_of" },
  { id: "enabled", key: "enabled", aria: "agents.aria.agent_enabled_of" }
] as const;

const columns = computed<SettingsColumn<RoleAgentView>[]>(() => [
  { id: "agent", header: t("agents.label.column_agent") },
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
  return agent.provider === null || agent.model === null ? null : defaultThreshold(providers.value, [{ provider: agent.provider, model: agent.model, effort: agent.effort, thinking: null, answerTokens: null }]);
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
const editingRole = ref<string | null>(null);

function openRole(role: string): void {
  editingRole.value = role;
  editing.value = true;
}

// One more agent of a role: it stands last among its role's, on the road of the role's last agent, and its role's
// agents open so its road and its place can be set.
const adding = ref(false);
const addItems = computed<DropdownMenuItem[]>(() => (view.value?.roles ?? []).map((role) => ({ label: role.name, onSelect: () => void add(role.name) })));

async function add(role: string): Promise<void> {
  adding.value = true;
  refusal.value = "";

  try {
    const last = view.value?.roles.find((one) => one.name === role)?.agents.at(-1);
    const body = last === undefined || last.provider === null ? { role } : { role, provider: last.provider, model: last.model, effort: last.effort };

    await $fetch<RoleAgentView>("/api/role-agents", { method: "POST", body });
    await refresh();
    openRole(role);
  } catch (failure) {
    refusal.value = failureText(failure, t("agents.error.agent_save_failed"));
  } finally {
    adding.value = false;
  }
}

const removing = ref("");

// An agent that carries a run is not removed, which its menu item says.
function menuOf(agent: RoleAgentView): DropdownMenuItem[] {
  return [
    { label: t("agents.action.settings"), icon: "i-material-symbols-settings-outline", onSelect: () => openRole(agent.role) },
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
