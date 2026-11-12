<template>
  <!-- The agent an item's work is to go out on (docs/web.md, the TODO panel's section): the item's `agent` label as a
       chooser of every agent the agency registers, grouped by role, each with its road, and no automatic choice: a job runs on
       the agent its item names. Where the item is not finished the pick is handed up to be saved at once. While a job of
       the item is under way it stands the agent that job runs on, read and not chosen: the job keeps what it was
       launched with until it is stopped. -->
  <UTooltip v-if="running !== null" :text="$t('todo.label.agent_job_running')">
    <UBadge color="neutral" variant="outline" size="sm" icon="i-material-symbols-lock-outline" data-item-agent data-item-agent-running>{{ running }}</UBadge>
  </UTooltip>
  <USelect
    v-else-if="props.editable"
    :model-value="chosen"
    :items="items"
    :placeholder="$t('todo.label.agent_unnamed')"
    value-key="value"
    size="sm"
    class="min-w-44"
    :loading="props.busy || reading"
    :disabled="props.busy"
    :aria-label="$t('todo.aria.item_agent')"
    :content="{ align: 'start', side: 'bottom' }"
    :ui="{ itemDescription: 'whitespace-normal' }"
    data-item-agent
    @update:model-value="pick"
    @update:open="(open: boolean) => open && void read()"
  />
  <UBadge v-else color="neutral" variant="outline" size="sm" data-item-agent>{{ props.item.agent ?? $t("todo.label.agent_unnamed") }}</UBadge>
</template>

<script setup lang="ts">
import { agentRoadText } from "~/domain/role-agents";

import type { RolesView } from "#shared/axes";
import type { CellChoice } from "~/domain/settings-cells";
import type { TodoItem } from "#shared/types";

interface Props {
  item: Pick<TodoItem, "agent" | "jobAgent">;
  // Whether the item is not finished, so its agent may still be chosen.
  editable: boolean;
  busy?: boolean;
}

const props = withDefaults(defineProps<Props>(), { busy: false });
const emit = defineEmits<{
  // The agent chosen by name.
  pick: [agent: string];
}>();

const { t } = useI18n();
const view = ref<RolesView | null>(null);
const reading = ref(false);

async function read(): Promise<void> {
  if (reading.value || view.value !== null) return;

  reading.value = true;

  try {
    view.value = await $fetch<RolesView>("/api/roles");
  } catch {
    view.value = null;
  } finally {
    reading.value = false;
  }
}

const running = computed(() => props.item.jobAgent ?? null);
const chosen = computed(() => props.item.agent ?? undefined);
const items = computed<CellChoice[][]>(() => {
  const groups: CellChoice[][] = (view.value?.roles ?? []).map((role) => [
    { type: "label", value: `@${role.name}`, label: role.name },
    ...role.agents.filter((agent) => agent.enabled).map((agent) => ({
      value: agent.name,
      label: agent.name,
      description: agentRoadText(null, agent) ?? t("live.label.space_follows")
    }))
  ]);
  // The agent the label names stands even where the listing has not been read yet.
  const named: CellChoice[][] = chosen.value === undefined || groups.some((group) => group.some((one) => one.value === chosen.value)) ? [] : [[{ value: chosen.value, label: chosen.value }]];

  return [...named, ...groups];
});

function pick(value: unknown): void {
  if (typeof value !== "string" || value === chosen.value || props.busy) return;

  emit("pick", value);
}
</script>
