<template>
  <div class="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-8 p-4 sm:p-6">
    <!-- The warming round, which is upkeep and nothing else. The switch here stops the whole round;
         the switch on an agent's own row of the agent table stops that one alone. -->
    <section :id="settingsAnchor('keepalive')" class="flex flex-col gap-3" aria-labelledby="keepalive-title">
      <h2 id="keepalive-title" class="text-lg font-semibold text-highlighted">{{ generalSectionTitle($t, "keepalive") }}</h2>

      <div class="flex items-center gap-3 rounded-lg border border-default px-4 py-3">
        <UIcon
          :name="props.keepalive.stopped ? 'i-material-symbols-pause-circle-outline' : 'i-material-symbols-check-circle-outline'"
          class="size-5 shrink-0"
          :class="props.keepalive.stopped ? 'text-warning' : 'text-success'"
        />
        <span class="min-w-0 flex-1">
          <SearchText class="block text-sm font-medium text-highlighted" :text="$t('agents.label.keepalive_all')" :query="props.query" />
          <span class="block text-sm tabular-nums text-muted">{{ stoppedCount === 0 ? $t("agents.label.all_agents") : $t("agents.label.stopped_agents", { n: countText(stoppedCount) }) }}</span>
        </span>
        <USwitch
          :model-value="!props.keepalive.stopped"
          :aria-label="$t('agents.label.keepalive_all')"
          :loading="busy === 'keepalive'"
          :disabled="busy !== ''"
          @update:model-value="switchKeepalive(!($event as boolean))"
        />
      </div>
    </section>

    <!-- The owner's one provider order, which every key's walk follows. A row is carried by its
         handle alone, by the mouse and the finger the same way, and the order is saved the moment
         it is dropped; a provider this machine cannot use keeps its place and says why. -->
    <section :id="settingsAnchor('providers')" class="flex flex-col gap-3" aria-labelledby="providers-title">
      <div class="flex items-center gap-2">
        <h2 id="providers-title" class="text-lg font-semibold text-highlighted">{{ generalSectionTitle($t, "providers") }}</h2>
        <UButton
          v-if="!props.fallback.orderIsDefault"
          size="sm"
          color="neutral"
          variant="outline"
          :label="$t('agents.action.default_order')"
          class="ms-auto"
          :loading="busy === 'reset-provider-order'"
          :disabled="busy !== ''"
          @click="resetOrder"
        />
      </div>

      <ol ref="orderList" class="flex flex-col divide-y divide-default overflow-hidden rounded-lg border border-default" :aria-label="$t('agents.title.section_providers')">
        <li
          v-for="(one, index) in shownOrder"
          :key="one.name"
          :data-order-index="index"
          :data-provider="one.name"
          class="grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-x-1 py-1 pe-2"
          :class="[drag.mark(index), !one.enabled && 'bg-elevated/40']"
        >
          <span
            class="flex size-11 cursor-grab touch-none select-none items-center justify-center text-muted transition-colors hover:text-highlighted active:text-primary"
            role="img"
            :aria-label="$t('agents.aria.drag_reorder')"
            @pointerdown="drag.onHandleDown(index, $event)"
          >
            <UIcon name="i-material-symbols-drag-indicator" class="size-5" />
          </span>

          <span class="flex min-w-0 flex-col py-1">
            <span class="flex min-w-0 items-center gap-2">
              <span class="text-sm tabular-nums text-muted">{{ index + 1 }}</span>
              <UIcon
                :name="!one.enabled ? 'i-material-symbols-block' : one.reason === null ? 'i-material-symbols-check-circle-outline' : 'i-material-symbols-warning-outline'"
                class="size-4 shrink-0"
                :class="!one.enabled ? 'text-muted' : one.reason === null ? 'text-success' : 'text-warning'"
              />
              <SearchText class="truncate text-sm font-medium" :class="one.enabled ? 'text-highlighted' : 'text-muted'" :text="one.label" :query="props.query" />
              <UBadge v-if="answering(one.name)" color="success" variant="subtle" size="sm" :label="$t('agents.status.active')" />
            </span>
            <!-- Why it cannot be taken, in the pack's words; the agency's own sentence is its tooltip. -->
            <HintTip v-if="one.reason !== null" :text="one.reasonEnglish ?? undefined" :disabled="one.reasonEnglish === null" class="min-w-0">
              <SearchText class="break-words text-sm text-muted" :text="one.reason" :query="props.query" />
            </HintTip>
          </span>

          <span class="flex shrink-0 items-center gap-1">
            <UTooltip :text="$t('common.aria.move_up_named', { name: one.label })">
              <UButton color="neutral" variant="ghost" size="sm" icon="i-material-symbols-arrow-upward" :aria-label="$t('common.aria.move_up_named', { name: one.label })" :disabled="index === 0 || busy !== ''" @click="saveOrder(index, index - 1)" />
            </UTooltip>
            <UTooltip :text="$t('common.aria.move_down_named', { name: one.label })">
              <UButton color="neutral" variant="ghost" size="sm" icon="i-material-symbols-arrow-downward" :aria-label="$t('common.aria.move_down_named', { name: one.label })" :disabled="index === shownOrder.length - 1 || busy !== ''" @click="saveOrder(index, index + 1)" />
            </UTooltip>
            <USwitch
              :model-value="one.enabled"
              :aria-label="$t('agents.aria.switch_on', { name: one.label })"
              :loading="busy === `provider:${one.name}`"
              :disabled="busy !== ''"
              class="ps-1"
              @update:model-value="setEnabled(one, $event as boolean)"
            />
          </span>
        </li>
      </ol>

      <p v-if="orderFailed !== ''" role="alert" class="text-sm text-error">{{ orderFailed }}</p>
    </section>

    <!-- The registered models the agency's model resource holds. -->
    <AgentsRegistry ref="registryRef" :models="props.models" :failed="props.modelsFailed" :reading="props.modelsReading" :reread="() => props.reread('registry')" :query="props.query" />

    <AgentsCatalogue ref="catalogueRef" :query="props.query" />

    <AgentsBasePrompts ref="basePromptsRef" :query="props.query" />

    <!-- The Claude Code entry's own list of logins, beside the order above it. -->
    <AgentsAccounts ref="accountsRef" :accounts="props.fallback.accounts" :reread="() => props.reread('fallback')" :query="props.query" />
    <AgentAddDialog v-model:open="agentAdding" :roles="props.agents.roles" :providers="props.fallback.order" :workers="agentWorkers" @added="agentAdded" />

    <!-- Every agent's own settings as one table: its role, its keepalive, its thinking and effort and its own gates. -->
    <AgentsSettingsTable :agents="props.agents" :keepalive="props.keepalive" :groups="groups" :reread="props.reread" :query="props.query" />

    <!-- Every session an agent holds, each with its reset. -->
    <AgentsSessions :query="props.query" />
  </div>
</template>

<script setup lang="ts">
import { settingsAnchor } from "~/domain/agent-settings";
import { agentGroups, designatedAndWorkers, generalSectionTitle, movedOrder } from "~/domain/agents";
import { failureText } from "bmo-ui/app/domain/errors";
import { useIsland } from "bmo-ui/app/domain/island";
import { countText } from "~/domain/numbers";
import { useRowDrag } from "~/domain/row-drag";

import type { AgentList, AgentRegistered, FallbackView, KeepaliveView, OrderedProvider, RoomSummary } from "#shared/types";
import type { AgentGroup, GeneralPart } from "~/domain/agents";
import type { ModelPage } from "#shared/agency";

interface Props {
  agents: AgentList;
  rooms: RoomSummary[];
  fallback: FallbackView;
  keepalive: KeepaliveView;
  // The registered models as the page last read them, null before the first read has landed.
  models: ModelPage | null;
  modelsFailed?: boolean;
  modelsReading?: boolean;
  // Every change is asked of the bot and then read back by the page, which this waits for.
  reread: (what: GeneralPart) => Promise<void>;
  query?: string;
}

const props = withDefaults(defineProps<Props>(), { query: "", modelsFailed: false, modelsReading: false });
const { t } = useI18n();

const busy = ref("");
const failed = ref("");
const orderFailed = ref("");

const groups = computed<AgentGroup[]>(() => agentGroups(t, designatedAndWorkers(props.agents.agents), props.rooms, props.agents.gateOrder ?? []));

const stoppedCount = computed(() => props.agents.agents.filter((agent) => agent.keepaliveStopped).length);

function answering(name: OrderedProvider["name"]): boolean {
  return props.fallback.since !== null && props.fallback.active.provider === name;
}

async function ask(path: string, body: Record<string, unknown>, mark: string, what: GeneralPart, into = failed): Promise<void> {
  busy.value = mark;
  into.value = "";

  try {
    await $fetch(path, { method: "POST", body });
    await props.reread(what);
  } catch (error) {
    into.value = failureText(error, t("common.error.save_failed"));
  } finally {
    busy.value = "";
  }
}

async function switchKeepalive(stopped: boolean): Promise<void> {
  await ask("/api/keepalive", { stopped }, "keepalive", "keepalive");
}

async function resetOrder(): Promise<void> {
  await ask("/api/fallback", { action: "reset-provider-order" }, "reset-provider-order", "fallback", orderFailed);
}

// The provider order while a drop is on its way: the rows stand in the new order at once, and a
// refusal takes this away so the bot's own order stands again.
const pendingOrder = ref<OrderedProvider[] | null>(null);
const shownOrder = computed(() => pendingOrder.value ?? props.fallback.order);
const orderList = ref<HTMLElement | null>(null);

// Carried by its handle, by the mouse, the pen and the finger alike — the same rules the accounts
// list below and the TODO panel are carried by.
const drag = useRowDrag({
  list: orderList,
  ready: () => busy.value === "" && pendingOrder.value === null,
  drop: (from, to) => void saveOrder(from, to)
});

// The whole new order is what the bot is asked for; a refusal leaves the order the bot still holds.
async function saveOrder(from: number, to: number): Promise<void> {
  if (busy.value !== "") return;

  const order = movedOrder(shownOrder.value, from, to);

  pendingOrder.value = order;

  try {
    await ask("/api/fallback", { action: "set-provider-order", order: order.map((one) => one.name) }, "set-provider-order", "fallback", orderFailed);
  } finally {
    pendingOrder.value = null;
  }
}

async function setEnabled(one: OrderedProvider, enabled: boolean): Promise<void> {
  if (busy.value !== "") return;

  pendingOrder.value = props.fallback.order.map((entry) => (entry.name === one.name ? { ...entry, enabled } : entry));

  try {
    await ask("/api/fallback", { action: "set-provider-enabled", provider: one.name, enabled }, `provider:${one.name}`, "fallback", orderFailed);
  } finally {
    pendingOrder.value = null;
  }
}

// The Add button on the tab row opens the new account's box, the new registration's or the new model file's,
// each the panel's own.
const accountsRef = useTemplateRef<{ openAdd: () => void }>("accountsRef");
const registryRef = useTemplateRef<{ openAdd: () => void }>("registryRef");
const catalogueRef = useTemplateRef<{ openAdd: () => void; refresh: () => Promise<void> }>("catalogueRef");
const basePromptsRef = useTemplateRef<{ openAdd: () => void }>("basePromptsRef");

function openAddAccount(): void {
  accountsRef.value?.openAdd();
}

function openAddRegistration(): void {
  registryRef.value?.openAdd();
}

function openAddCatalogue(): void {
  catalogueRef.value?.openAdd();
}

function openAddBasePrompt(): void {
  basePromptsRef.value?.openAdd();
}

// An agent of any kind registered from the agent table; the notice says what became of its brain.
const agentAdding = ref(false);
// What the notice says became of the agent's brain.
const BRAIN_NOTICES: Record<AgentRegistered["brain"], string> = {
  made: "agents.status.agent_added_made",
  kept: "agents.status.agent_added_kept",
  none: "agents.status.agent_added_none",
  failed: "agents.status.agent_added_failed"
};
const island = useIsland(t);
const agentWorkers = computed(() => props.agents.agents.filter((agent) => agent.kind === "worker").map((agent) => ({ name: agent.name, label: agent.label ?? agent.name })));

function openAddAgent(): void {
  agentAdding.value = true;
}

async function agentAdded(added: AgentRegistered): Promise<void> {
  island.say({ title: t(BRAIN_NOTICES[added.brain], { name: added.name }), to: `/agents/${encodeURIComponent(added.name)}` });
  await props.reread("agents");
}

defineExpose({ openAddAccount, openAddRegistration, openAddCatalogue, openAddBasePrompt, openAddAgent });
</script>
