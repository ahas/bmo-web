<template>
  <!-- Whom an item's work is to go out on (docs/web.md, the TODO panel's section): one agent by its `agent` label, or a
       model and a role by its `model` and `role` labels, the launch then seating the job on whichever agent of that role
       running that model is free. A chooser grouped by role offers under each role the models its agents switched on
       run, then those agents, each with its road, and no automatic choice: a job runs on what its item names. Where the
       item is not finished the pick is handed up to be saved at once. While a job of the item is under way it stands the
       agent that job runs on, read and not chosen: the job keeps what it was launched with until it is stopped. -->
  <HintTip v-if="running !== null" :text="$t('todo.label.agent_job_running')">
    <UBadge color="neutral" variant="outline" size="sm" icon="i-material-symbols-lock-outline" data-item-agent data-item-agent-running>{{ running }}</UBadge>
  </HintTip>
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
  <UBadge v-else color="neutral" variant="outline" size="sm" data-item-agent>{{ shown }}</UBadge>
</template>

<script setup lang="ts">
import { assignmentChoices, assignmentLabel, assignmentOf, assignmentValue, namedAssignment } from "~/domain/item-assignment";

import type { RolesView } from "#shared/axes";
import type { ItemAssignment } from "~/domain/item-assignment";
import type { TodoItem } from "#shared/types";

interface Props {
  item: Pick<TodoItem, "agent" | "jobAgent" | "model" | "role">;
  // Whether the item is not finished, so its assignment may still be chosen.
  editable: boolean;
  busy?: boolean;
}

const props = withDefaults(defineProps<Props>(), { busy: false });
const emit = defineEmits<{
  pick: [assignment: ItemAssignment];
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
const named = computed(() => namedAssignment(props.item));
const chosen = computed(() => (named.value === null ? undefined : assignmentValue(named.value)));
const shown = computed(() => (named.value === null ? t("todo.label.agent_unnamed") : assignmentLabel(t, named.value)));
const items = computed(() => assignmentChoices(t, view.value?.roles ?? [], named.value));

function pick(value: unknown): void {
  if (typeof value !== "string" || value === chosen.value || props.busy) return;

  const assignment = assignmentOf(value);

  // Every model the list offers names its role; one with none is only ever what the labels already name.
  if ("agent" in assignment || assignment.role !== null) emit("pick", assignment);
}
</script>
