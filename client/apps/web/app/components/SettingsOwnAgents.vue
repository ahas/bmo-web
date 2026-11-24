<template>
  <!-- The own-agents section (docs/web.md, 「Settings」, the own-agents section): the agents the reader's organisation
       supplies, each role's seats first with where they came from, and the reader's own changes over them — an agent
       added, a road chosen, a supplied agent switched off — each put back to what was supplied by its way back; then the
       organisation's instructions, read only, and the reader's own. A change a unit above withholds stands disabled
       with who decided it. -->
  <div class="flex flex-col gap-6" data-own-agents>
    <ContentSkeleton v-if="view === null && failure === ''" :rows="3" list-class="flex flex-col divide-y divide-default" :label="$t('own_agents.status.loading')">
      <div class="flex items-center gap-4 py-3">
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <SkeletonLine width="w-1/3" />
          <SkeletonLine width="w-1/2" />
        </div>
        <SkeletonBar class="h-8 w-20 shrink-0 rounded-md" />
      </div>
    </ContentSkeleton>

    <div v-else-if="view === null" class="flex flex-col items-end gap-3">
      <UAlert class="w-full" color="error" variant="subtle" :description="failure" />
      <UButton color="neutral" variant="subtle" icon="i-material-symbols-refresh" :label="$t('common.action.refresh')" @click="void read()" />
    </div>

    <template v-else>
      <SettingsGroup :title="$t('own_agents.title.agents')" data-own-agents-list>
        <template #aside>
          <UDropdownMenu :items="addItems" :disabled="!view.add.allowed || addItems.length === 0 || busy !== ''">
            <UButton
              size="sm"
              color="neutral"
              variant="ghost"
              icon="i-material-symbols-add"
              :label="$t('own_agents.action.add')"
              :loading="busy === 'add'"
              :disabled="!view.add.allowed || addItems.length === 0 || busy !== ''"
              data-own-agent-add
            />
          </UDropdownMenu>
        </template>
        <p v-if="addLine !== null" class="py-2 text-sm text-muted" data-own-add-decided>{{ addLine }}</p>
        <p v-if="roadLocked !== null" class="py-2 text-sm text-muted" data-own-road-decided>{{ roadLocked }}</p>
        <!-- The reader's own supervisors, their BMO first, each with its session's two acts (docs/web.md, 「A supervisor's
             session handed over or reset」). -->
        <SettingsRow v-for="name in ownSupervisors" :key="`supervisor:${name}`" :label="agentLabel($t, name)" :data-own-supervisor="name">
          <div class="ms-auto flex shrink-0 items-center justify-end">
            <UDropdownMenu :items="sessionItemsOf(name)" :content="{ align: 'end' }">
              <UButton color="neutral" variant="ghost" size="sm" icon="i-material-symbols-more-vert" :aria-label="$t('agent_session.aria.menu', { name: agentLabel($t, name) })" data-own-supervisor-menu />
            </UDropdownMenu>
          </div>
        </SettingsRow>
        <SettingsRow v-if="agentRows.length === 0" :label="$t('own_agents.label.no_agents')" />
        <SettingsRow v-for="row in agentRows" :key="row.agent.name" :label="`${row.role.label} · ${row.agent.name}`" :data-own-agent="row.agent.name">
          <template #description>
            <span class="text-sm text-default wrap-anywhere" data-own-agent-road>{{ roadLine(row.agent.road, view.providers, $t("agents.label.agent_follows")) }}</span>
            <span class="text-sm text-muted" data-own-agent-origin>{{ originLine(row.agent) }}</span>
          </template>
          <div class="ms-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
            <IconButton
              v-if="row.agent.supplied !== null && row.agent.changed"
              size="sm"
              icon="i-material-symbols-restart-alt"
              :label="$t('own_agents.action.back')"
              :disabled="busy !== ''"
              data-own-agent-back
              @click="void back(row.agent)"
            />
            <UButton
              v-if="row.agent.held"
              color="neutral"
              variant="outline"
              :label="$t('own_agents.action.road')"
              :disabled="busy !== '' || !view.road.allowed"
              :aria-label="$t('own_agents.aria.road', { name: row.agent.name })"
              data-own-agent-road-change
              @click="openRoad(row)"
            />
            <USwitch
              v-if="row.agent.held"
              :model-value="row.agent.enabled"
              :aria-label="$t('own_agents.aria.switch', { name: row.agent.name })"
              :loading="busy === row.agent.name"
              :disabled="busy !== '' || (row.agent.supplied !== null && row.agent.enabled && !view.add.allowed)"
              data-own-agent-switch
              @update:model-value="(on: boolean) => void change(row.agent, { enabled: on })"
            />
            <IconButton
              v-if="row.agent.supplied === null"
              size="sm"
              color="error"
              icon="i-material-symbols-delete-outline"
              :label="$t('own_agents.aria.remove', { name: row.agent.name })"
              :disabled="busy !== '' || row.agent.carries"
              data-own-agent-remove
              @click="void remove(row.agent)"
            />
          </div>
        </SettingsRow>
        <SettingsRow v-for="role in offRoles" :key="`off:${role.role}`" :label="role.label" :description="offLine(role)" :data-own-role-off="role.role" />
        <p v-if="actionFailure !== ''" role="alert" class="break-words py-2 text-sm text-error" data-own-agents-failure>{{ actionFailure }}</p>
      </SettingsGroup>

      <SettingsGroup :title="$t('own_agents.title.organisation_instructions')" data-own-org-instructions>
        <p v-if="instructions === null && instructionsFailure !== ''" role="alert" class="py-3 text-sm text-error">{{ instructionsFailure }}</p>
        <ContentSkeleton v-else-if="instructions === null" :rows="1" list-class="flex flex-col" :label="$t('own_agents.status.loading')">
          <div class="flex items-center py-3"><SkeletonLine width="w-1/2" /></div>
        </ContentSkeleton>
        <SettingsRow v-else-if="instructions.organisation.length === 0" :label="$t('own_agents.label.organisation_none')" />
        <template v-else>
          <SettingsRow v-for="(one, index) in instructions.organisation" :key="index" :label="decidedLine(t, one.by) ?? $t('org_agents.label.decided_unit')">
            <template #description>
              <span class="line-clamp-4 whitespace-pre-wrap text-sm text-default wrap-anywhere">{{ one.text }}</span>
            </template>
          </SettingsRow>
          <p class="py-2 text-sm text-muted">{{ $t("own_agents.label.organisation_first") }}</p>
        </template>
      </SettingsGroup>

      <SettingsGroup v-if="instructions !== null" :title="$t('own_agents.title.instructions')" data-own-instructions>
        <p v-if="instructionsDecided !== null" class="py-2 text-sm text-muted" data-own-instructions-decided>{{ instructionsDecided }}</p>
        <SettingsRow :label="$t('own_agents.label.all_agents')" data-own-instruction="all">
          <template #description>
            <span class="line-clamp-3 whitespace-pre-wrap text-sm wrap-anywhere" :class="instructions.all === null ? 'text-muted' : 'text-default'">{{ instructions.all ?? $t("org_agents.label.instructions_none") }}</span>
          </template>
          <UButton color="neutral" variant="outline" :label="$t('account.action.change')" :disabled="!instructions.allowed.allowed || savingInstructions" data-own-instruction-change @click="openInstruction(null)" />
        </SettingsRow>
        <SettingsRow v-for="one in instructions.named" :key="one.name" :label="namedLabel(one)" :data-own-instruction="one.name">
          <template #description>
            <span class="line-clamp-3 whitespace-pre-wrap text-sm wrap-anywhere" :class="instructions.agents[one.name] === undefined ? 'text-muted' : 'text-default'">{{ instructions.agents[one.name] ?? $t("org_agents.label.instructions_none") }}</span>
          </template>
          <UButton color="neutral" variant="outline" :label="$t('account.action.change')" :disabled="!instructions.allowed.allowed || savingInstructions" :aria-label="$t('own_agents.aria.instruction', { name: namedLabel(one) })" @click="openInstruction(one.name)" />
        </SettingsRow>
      </SettingsGroup>

      <AgentSessionDialog v-model:open="sessionOpen" :ask="sessionAsk" />

      <RoadDialog
        v-if="roadFor !== null"
        v-model:open="roadOpen"
        :title="`${roadFor.role.label} · ${roadFor.agent.name}`"
        :providers="view.providers"
        :line="roadFor.role.line"
        :road="roadFor.agent.road"
        :none-label="$t('agents.label.agent_follows')"
        :models-url="(provider: string) => `/api/account/own-agents/models/${encodeURIComponent(provider)}`"
        :save="saveRoad"
      />

      <!-- One instruction, typed as one text; an empty text leaves none. -->
      <SettingsDialog v-model:open="editing" :title="editingTitle" :description="$t('own_agents.label.instructions_note')" :dirty="draftChanged">
        <form id="own-instruction-form" class="flex flex-col gap-2" @submit.prevent="void saveInstruction()">
          <UTextarea v-model="draft" class="w-full" :rows="8" autoresize :maxlength="instructions?.mostCharacters || undefined" :aria-label="editingTitle" data-own-instruction-text />
          <p class="text-end text-xs text-muted tabular-nums">{{ $t("own_agents.label.characters", { count: draft.length, most: instructions?.mostCharacters ?? 0 }) }}</p>
          <p v-if="dialogFailure !== ''" role="alert" class="break-words text-sm text-error">{{ dialogFailure }}</p>
        </form>
        <template #footer="{ close: shut }">
          <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="savingInstructions" @click="shut()" />
          <UButton type="submit" form="own-instruction-form" :label="$t('common.action.save')" :loading="savingInstructions" :disabled="savingInstructions || !draftChanged" data-own-instruction-save />
        </template>
      </SettingsDialog>
    </template>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import { agentSessionItems } from "~/domain/agent-session";
import { agentLabel } from "~/domain/agents";
import { decidedLine } from "~/domain/chain-decided";
import { useConfirm } from "~/domain/confirm";
import { roadLine } from "~/domain/own-agents";

import type { DropdownMenuItem } from "@nuxt/ui";
import type { AgentSessionAsk } from "~/domain/agent-session";
import type { InstructedAgent, OwnAgentView, OwnAgentsView, OwnInstructionsView, OwnRoad, OwnRoleView } from "#shared/own-agents";

const { t } = useI18n();
const confirm = useConfirm();

const view = ref<OwnAgentsView | null>(null);
const failure = ref("");
const actionFailure = ref("");
const busy = ref("");
const instructions = ref<OwnInstructionsView | null>(null);
const instructionsFailure = ref("");

async function read(): Promise<void> {
  failure.value = "";
  try {
    view.value = await $fetch<OwnAgentsView>("/api/account/own-agents");
  } catch (error) {
    view.value = null;
    failure.value = failureText(error, t("own_agents.error.read_failed"));
  }
}

async function readInstructions(): Promise<void> {
  instructionsFailure.value = "";
  try {
    instructions.value = await $fetch<OwnInstructionsView>("/api/account/own-instructions");
  } catch (error) {
    instructions.value = null;
    instructionsFailure.value = failureText(error, t("own_agents.error.read_failed"));
  }
}

// The supervisors filed under the reader's account, read as the section opens, and the session acts on each.
const { data: ownSupervisorNames } = useFetch<string[]>("/api/me/agents", { key: "own-supervisors", lazy: true, server: false, default: () => [] });
const ownSupervisors = computed(() => ownSupervisorNames.value ?? []);
const sessionAsk = ref<AgentSessionAsk | null>(null);
const sessionOpen = ref(false);

function sessionItemsOf(name: string): DropdownMenuItem[] {
  return agentSessionItems(t, [name], null, (ask) => {
    sessionAsk.value = ask;
    sessionOpen.value = true;
  });
}

// Every agent of the reader's, role by role, the seats supplied before their own.
const agentRows = computed(() => (view.value?.roles ?? []).flatMap((role) => role.agents.map((agent) => ({ role, agent }))));
const offRoles = computed(() => (view.value?.roles ?? []).filter((role) => role.off));

// The roles an agent may be added to: on, and holding fewer than the most of one role.
const addItems = computed<DropdownMenuItem[]>(() =>
  (view.value?.roles ?? [])
    .filter((role) => !role.off && role.agents.filter((agent) => agent.held).length < role.most)
    .map((role) => ({ label: role.label, onSelect: () => void add(role) }))
);

const addLine = computed(() => (view.value === null || view.value.add.allowed ? null : t("own_agents.label.add_decided", { decided: decidedLine(t, view.value.add.decided) ?? "" })));
const roadLocked = computed(() => (view.value === null || view.value.road.allowed ? null : t("own_agents.label.road_decided", { decided: decidedLine(t, view.value.road.decided) ?? "" })));
const instructionsDecided = computed(() =>
  instructions.value === null || instructions.value.allowed.allowed ? null : t("own_agents.label.instructions_decided", { decided: decidedLine(t, instructions.value.allowed.decided) ?? "" })
);

// Where an agent came from, and whether the reader's own change stands over it.
function originLine(agent: OwnAgentView): string {
  if (agent.supplied === null) return agent.enabled ? t("own_agents.label.own") : `${t("own_agents.label.own")} · ${t("org_agents.label.state_off")}`;
  if (!agent.held) return t("own_agents.label.gone");
  if (agent.changed) return agent.enabled ? t("own_agents.label.changed") : `${t("own_agents.label.changed")} · ${t("org_agents.label.state_off")}`;

  const by = agent.supplied.by;

  return by === null || by.by === "platform" ? t("own_agents.label.from_platform") : by.name === null ? t("own_agents.label.from_unit_unnamed") : t("own_agents.label.from_unit", { name: by.name });
}

function offLine(role: OwnRoleView): string {
  return `${t("own_agents.label.role_off")} · ${decidedLine(t, role.offBy) ?? t("org_agents.label.decided_unit")}`;
}

function namedLabel(one: InstructedAgent): string {
  if (one.kind === "supervisor") return one.label ?? one.name;

  const role = view.value?.roles.find((held) => held.role === one.role);

  return role === undefined ? one.name : `${role.label} · ${one.name}`;
}

// One act on an agent, the list read again after it; a refusal is said under the list.
async function act(key: string, call: () => Promise<unknown>): Promise<void> {
  busy.value = key;
  actionFailure.value = "";

  let refused = "";

  try {
    await call();
  } catch (error) {
    refused = failureText(error, t("own_agents.error.failed"));
  } finally {
    busy.value = "";
  }

  await Promise.all([read(), readInstructions()]);
  actionFailure.value = refused;
}

async function add(role: OwnRoleView): Promise<void> {
  await act("add", () => $fetch<{ ok: true }>("/api/account/own-agents", { method: "POST", body: { role: role.role } }));
}

async function change(agent: OwnAgentView, body: { enabled?: boolean; road?: OwnRoad | null }): Promise<void> {
  await act(agent.name, () => $fetch<{ ok: true }>(`/api/account/own-agents/${encodeURIComponent(agent.name)}`, { method: "PATCH", body }));
}

async function back(agent: OwnAgentView): Promise<void> {
  await act(agent.name, () => $fetch<{ ok: true }>(`/api/account/own-agents/${encodeURIComponent(agent.name)}/back`, { method: "POST" }));
}

async function remove(agent: OwnAgentView): Promise<void> {
  if (!(await confirm({ title: t("own_agents.message.remove"), item: agent.name, effect: t("own_agents.message.remove_effect"), confirm: t("common.action.delete") }))) return;

  await act(agent.name, () => $fetch<{ ok: true }>(`/api/account/own-agents/${encodeURIComponent(agent.name)}`, { method: "DELETE" }));
}

// --- One agent's road ---

const roadFor = ref<{ role: OwnRoleView; agent: OwnAgentView } | null>(null);
const roadOpen = ref(false);

function openRoad(row: { role: OwnRoleView; agent: OwnAgentView }): void {
  roadFor.value = row;
  roadOpen.value = true;
}

// The road written; a refusal stays in the form.
async function saveRoad(road: OwnRoad | null): Promise<void> {
  const target = roadFor.value;

  if (target === null) return;

  await $fetch<{ ok: true }>(`/api/account/own-agents/${encodeURIComponent(target.agent.name)}`, { method: "PATCH", body: { road } });
  await read();
}

// --- The reader's own instructions ---

const editing = ref(false);
// The agent whose instruction is edited, null for every agent's.
const editingAgent = ref<string | null>(null);
const draft = ref("");
const dialogFailure = ref("");
const savingInstructions = ref(false);

const editingTitle = computed(() => {
  if (editingAgent.value === null) return t("own_agents.label.all_agents");

  const named = instructions.value?.named.find((one) => one.name === editingAgent.value);

  return named === undefined ? editingAgent.value : namedLabel(named);
});
const heldText = computed(() => (editingAgent.value === null ? (instructions.value?.all ?? "") : (instructions.value?.agents[editingAgent.value] ?? "")));
const draftChanged = computed(() => draft.value.trim() !== heldText.value.trim());

function openInstruction(agent: string | null): void {
  editingAgent.value = agent;
  draft.value = agent === null ? (instructions.value?.all ?? "") : (instructions.value?.agents[agent] ?? "");
  dialogFailure.value = "";
  editing.value = true;
}

// The instructions written whole, the one edited replaced.
async function saveInstruction(): Promise<void> {
  const held = instructions.value;

  if (held === null) return;

  const text = draft.value.trim();
  const agents = { ...held.agents };
  let all = held.all;

  if (editingAgent.value === null) {
    all = text === "" ? null : text;
  } else if (text === "") {
    delete agents[editingAgent.value];
  } else {
    agents[editingAgent.value] = text;
  }

  savingInstructions.value = true;
  dialogFailure.value = "";
  try {
    instructions.value = await $fetch<OwnInstructionsView>("/api/account/own-instructions", { method: "PUT", body: { all, agents } });
    editing.value = false;
  } catch (error) {
    dialogFailure.value = failureText(error, t("own_agents.error.failed"));
  } finally {
    savingInstructions.value = false;
  }
}

onMounted(() => void Promise.all([read(), readInstructions()]));
</script>
