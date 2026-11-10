<template>
  <!-- The model an item's work goes out on, short, as a chip (docs/web.md, the TODO panel's section): its whole name,
       and while a job of it runs what chose that job's road, in its tooltip. The road is the agent's the item names,
       else its role's order's; it is read here and chosen through the item's agent. -->
  <UTooltip :text="tip ?? undefined" :disabled="tip === null">
    <UBadge color="neutral" variant="outline" size="sm" data-item-model><SearchText :text="itemModel(props.item)!" :query="props.query" /></UBadge>
  </UTooltip>
</template>

<script setup lang="ts">
import { itemModel, itemModelTip } from "~/domain/todos";

import type { TodoItem } from "#shared/types";

interface Props {
  item: TodoItem;
  // The search the panel marks hits of.
  query?: string;
}

const props = withDefaults(defineProps<Props>(), { query: "" });

const { t } = useI18n();

const tip = computed(() => itemModelTip(t, props.item));
</script>
