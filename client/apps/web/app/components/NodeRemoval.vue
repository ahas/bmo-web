<template>
  <!-- A node's removal from the monitor, the administrator's (docs/web.md, 「Monitor screen」): one section at the foot
       of the node's own screen, never on its title bar, whose press asks first. -->
  <section class="flex flex-col gap-3 border-t border-default pt-6" :aria-label="$t('hardware.title.node_removal')" data-node-removal>
    <div class="flex min-w-0 flex-wrap items-center justify-between gap-3">
      <div class="flex min-w-0 flex-col gap-1">
        <h2 class="text-sm font-medium text-highlighted">{{ $t("hardware.title.node_removal") }}</h2>
        <p class="text-sm text-muted">{{ $t("hardware.message.node_removal") }}</p>
      </div>
      <UButton color="error" variant="outline" :label="$t('hardware.action.node_remove')" data-node-remove @click="ask" />
    </div>
    <p v-if="refusal !== ''" role="alert" class="text-sm text-error">{{ refusal }}</p>

    <NodeRemoveDialog v-model:open="asking" :node="props.node" :label="props.label" @removed="emit('removed')" @refused="(reason: string) => (refusal = reason)" />
  </section>
</template>

<script setup lang="ts">
import type { MonitorNode } from "#shared/types";

const props = defineProps<{ node: MonitorNode; label: string }>();
const emit = defineEmits<{ removed: [] }>();

const asking = ref(false);
const refusal = ref("");

function ask(): void {
  refusal.value = "";
  asking.value = true;
}
</script>
