<template>
  <!-- The model an item's work goes out on, short, as a chip (docs/web.md, the TODO panel's section): its whole name,
       and while a job of it runs what chose that job's road, in its tooltip. Where the item is not finished the chip is
       pressed to choose the item's model — auto, the default, or any model the worker line may run on, grouped by
       provider — and the pick is handed up to be saved at once. -->
  <UTooltip :text="tip ?? undefined" :disabled="tip === null">
    <USelect
      v-if="props.editable"
      :model-value="chosen"
      :items="items"
      value-key="value"
      variant="none"
      :loading="props.busy || choices.reading.value"
      :disabled="props.busy"
      :aria-label="$t('todo.aria.item_model')"
      :content="{ align: 'start', side: 'bottom' }"
      :ui="{ base: 'rounded-sm p-0 transition-colors hover:bg-elevated active:bg-accented focus-visible:bg-elevated', trailing: props.busy || choices.reading.value ? 'static ms-1 p-0' : 'hidden', group: 'w-auto', itemDescription: 'whitespace-normal' }"
      class="w-auto"
      @update:model-value="pick"
      @update:open="(open: boolean) => open && void choices.read()"
    >
      <template #default>
        <UBadge color="neutral" variant="outline" size="sm" data-item-model><SearchText :text="itemModel(props.item)!" :query="props.query" /></UBadge>
      </template>
    </USelect>
    <UBadge v-else color="neutral" variant="outline" size="sm" data-item-model><SearchText :text="itemModel(props.item)!" :query="props.query" /></UBadge>
  </UTooltip>
</template>

<script setup lang="ts">
import { markedDefault } from "~/domain/axes";
import { useRoadChoices } from "~/domain/road-choices";
import { todoModelPlan } from "~/domain/todo-models";
import { itemModel, itemModelTip } from "~/domain/todos";

import type { TodoItem } from "#shared/types";

interface Props {
  item: TodoItem;
  // Whether the item is not finished, so its model may still be chosen.
  editable: boolean;
  busy?: boolean;
  // The search the panel marks hits of.
  query?: string;
}

// The line every job of an item goes out on, and the label value that leaves its road to the agency.
const WORKER_LINE = "worker";
const AUTO = "auto";

const props = withDefaults(defineProps<Props>(), { busy: false, query: "" });
const emit = defineEmits<{
  // The model chosen: `<provider>/<model>`, or `auto`.
  pick: [model: string];
}>();

const { t } = useI18n();
const choices = useRoadChoices(t, () => WORKER_LINE);

const tip = computed(() => itemModelTip(t, props.item));
const chosen = computed(() => props.item.model ?? AUTO);
const items = computed(() => choices.groups({ value: AUTO, label: markedDefault(t, AUTO, true) }, chosen.value, todoModelPlan().value?.running[props.item.id] ?? null));

function pick(value: unknown): void {
  if (typeof value !== "string" || value === chosen.value || props.busy) return;

  emit("pick", value);
}
</script>
