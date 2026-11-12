<template>
  <!-- The model an item's work goes out on, short, as a chip (docs/web.md, the TODO panel's section): its whole name,
       and while a job of it runs what chose that job's road, in the shared tooltip. The road is the agent's the item
       names, else the model its labels name; an item that names neither stands no chip. It is read here and chosen
       through the item's assignment. -->
  <HintTip v-if="itemModel(props.item) !== null" :text="tip ?? undefined" :disabled="tip === null" :press="props.press">
    <UBadge color="neutral" variant="outline" size="sm" data-item-model><SearchText :text="itemModel(props.item)!" :query="props.query" /></UBadge>
  </HintTip>
</template>

<script setup lang="ts">
import { itemModel, itemModelTip } from "~/domain/todos";

import type { TodoItem } from "#shared/types";

interface Props {
  item: TodoItem;
  // The search the panel marks hits of.
  query?: string;
  // Whether what it stands on acts on a tap, so a finger rests on it to read its tooltip.
  press?: boolean;
}

const props = withDefaults(defineProps<Props>(), { query: "", press: false });

const { t } = useI18n();

const tip = computed(() => itemModelTip(t, props.item));
</script>
