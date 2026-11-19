<template>
  <!-- A node's ownership at the foot of its own screen, the administrator's (docs/web.md, 「Monitor screen」): what it is,
       a personal node with the name its account goes by, and the button that opens the change. -->
  <section class="flex flex-col gap-3 border-t border-default pt-6" :aria-label="$t('hardware.title.ownership')" data-node-ownership-section>
    <div class="flex min-w-0 flex-wrap items-center justify-between gap-3">
      <div class="flex min-w-0 flex-col gap-1">
        <h2 class="text-sm font-medium text-highlighted">{{ $t("hardware.title.ownership") }}</h2>
        <p class="break-words text-sm text-muted" data-node-ownership-now>{{ standing }}</p>
      </div>
      <UButton color="neutral" variant="outline" :label="$t('hardware.action.ownership_edit')" data-node-ownership-edit @click="editing = true" />
    </div>

    <NodeOwnershipDialog v-model:open="editing" :node="props.node" :label="props.label" @saved="(node: MonitorNode) => emit('saved', node)" />
  </section>
</template>

<script setup lang="ts">
import { ownershipText, useAccountNames } from "~/domain/nodes";

import type { MonitorNode } from "#shared/types";

const props = defineProps<{ node: MonitorNode; label: string }>();
const emit = defineEmits<{ saved: [node: MonitorNode] }>();

const { t } = useI18n();
const { names } = useAccountNames();
const editing = ref(false);

const standing = computed(() => ownershipText(t, names.value, props.node));
</script>
