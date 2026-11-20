<template>
  <!-- An item's assignment (docs/web.md, the TODO modal's form block): whom its work runs on, its worker, the model and,
       while it is unfinished, its priority. On a wide dialog they are the form block's cells, two to a row; on a
       narrow one a name and value list at the top of the manage tab. The agent and the worker are changed right here while the
       item is unfinished. -->
  <component :is="props.shape === 'cells' ? FieldGrid : PairRows" :rows="rows" :skeleton="[]" label="">
    <!-- Any agent the agency registers, of any role, or a model and a role whose free agent takes it at the launch
         (the agency's docs/repositories.md, 「An agent an item names」). -->
    <template #agent>
      <span class="flex min-w-0 items-center">
        <ItemAgentChip
          :item="props.item"
          :editable="!props.item.done && props.item.mergedInto === null"
          :busy="props.agentBusy"
          @pick="(assignment: ItemAssignment) => emit('agent', assignment)"
        />
      </span>
    </template>

    <!-- Which worker is to do it: an assignment the queue reads to decide whose turn the item is, the job launched on
         the worker it names, and no assignment the built-in worker. -->
    <template v-if="!props.item.done" #worker>
      <span class="flex min-w-0 items-center">
        <ChoiceSelect
          :content="{ align: 'start' }"
          :model-value="props.item.worker ?? props.unassigned"
          :items="props.workerOptions"
          value-key="value"
          class="min-w-40"
          size="sm"
          :aria-label="$t('todo.aria.item_worker')"
          :loading="props.workerBusy"
          @update:model-value="emit('worker', $event as string)"
        />
      </span>
    </template>

    <!-- An item naming no road yet stands as unnamed, as its agent does, rather than as an empty cell. -->
    <template #model>
      <span class="flex items-center">
        <ItemModelChip v-if="itemModel(props.ranItem ?? props.item) !== null" :item="props.ranItem ?? props.item" />
        <span v-else class="text-muted" data-item-model-unnamed>{{ $t("todo.label.model_unnamed") }}</span>
      </span>
    </template>
  </component>
</template>

<script setup lang="ts">
import FieldGrid from "./FieldGrid.vue";
import PairRows from "./PairRows.vue";
import { countText } from "~/domain/numbers";
import { itemModel } from "~/domain/todos";

import type { ItemAssignment } from "~/domain/item-assignment";
import type { PairRow } from "~/domain/pair-rows";
import type { TodoItem } from "#shared/types";

interface Props {
  item: TodoItem;
  // The item as its record reads it once its runs are read, which names the road its last job took.
  ranItem: TodoItem | null;
  workerOptions: { label: string; value: string }[];
  // What the worker's select stands on for an item nobody has assigned.
  unassigned: string;
  // Where the chosen worker does its work, the one thing its name does not tell.
  workerPath: string;
  agentBusy: boolean;
  workerBusy: boolean;
  shape: "cells" | "pairs";
}

const props = defineProps<Props>();
const emit = defineEmits<{ agent: [assignment: ItemAssignment]; worker: [chosen: string] }>();

const { t } = useI18n();

const rows = computed<PairRow[]>(() => {
  const item = props.item;
  const worker: PairRow[] = !item.done
    ? [{ key: "worker", label: t("todo.label.field_worker"), under: props.workerPath || undefined }]
    : item.worker !== null ? [{ key: "worker", label: t("todo.label.field_worker"), value: item.worker }] : [];

  return [
    { key: "agent", label: t("todo.label.field_agent") },
    ...worker,
    { key: "model", label: t("todo.label.field_model") },
    ...(!item.done ? [{ key: "priority", label: t("todo.label.priority"), value: countText(item.priority) }] : [])
  ];
});
</script>
