<template>
  <!-- A node's removal from the monitor, the administrator's (docs/web.md, 「Monitor screen」): one section at the foot
       of the node's own monitor, never on its title bar, whose press asks first. A hub node whose agent is attached
       may be sent a leave with it, so the agent uninstalls itself and departs rather than coming back on the next
       pass; a node with no attached agent is only taken off the list. -->
  <section class="flex flex-col gap-3 border-t border-default pt-6" :aria-label="$t('hardware.title.node_removal')" data-node-removal>
    <div class="flex min-w-0 flex-wrap items-center justify-between gap-3">
      <div class="flex min-w-0 flex-col gap-1">
        <h2 class="text-sm font-medium text-highlighted">{{ $t("hardware.title.node_removal") }}</h2>
        <p class="text-sm text-muted">{{ $t("hardware.message.node_removal") }}</p>
      </div>
      <UButton color="error" variant="outline" :label="$t('hardware.action.node_remove')" data-node-remove @click="asking = true" />
    </div>
    <p v-if="refusal !== ''" role="alert" class="text-sm text-error">{{ refusal }}</p>

    <UModal v-model:open="asking" :title="$t('hardware.title.node_remove_ask', { name: props.label })" :ui="{ content: 'sm:max-w-xl' }">
      <template #close="{ ui }">
        <ShellClose :class="ui.close()" @close="asking = false" />
      </template>

      <template #body>
        <div class="flex flex-col gap-4">
          <p class="break-words text-sm text-toned">{{ $t("hardware.message.node_remove_effect") }}</p>
          <UCheckbox v-if="leavable" v-model="leave" :label="$t('hardware.label.node_leave')" :description="$t('hardware.message.node_leave')" data-node-leave />
          <p v-else-if="props.node.kind === 'hub'" class="text-sm text-muted">{{ $t("hardware.message.node_leave_unattached") }}</p>
        </div>
      </template>

      <template #footer>
        <div class="flex w-full flex-wrap items-center justify-end gap-2">
          <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" @click="asking = false" />
          <UButton :label="$t('hardware.action.node_remove')" color="error" :loading="removing" data-node-remove-confirm @click="void remove()" />
        </div>
      </template>
    </UModal>
  </section>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import type { MonitorNode } from "#shared/types";

const props = defineProps<{ node: MonitorNode; label: string }>();
const emit = defineEmits<{ removed: [] }>();

const { t } = useI18n();
const asking = ref(false);
const removing = ref(false);
const refusal = ref("");
// Only an attached hub node's agent can be sent a leave; it is offered on, since a node removed with its agent still
// attached comes back.
const leavable = computed(() => props.node.kind === "hub" && props.node.connected);
const leave = ref(true);

async function remove(): Promise<void> {
  removing.value = true;
  refusal.value = "";

  try {
    await $fetch(`/api/nodes/${encodeURIComponent(props.node.name)}`, { method: "DELETE", query: leavable.value && leave.value ? { leave: "true" } : {} });
    asking.value = false;
    emit("removed");
  } catch (failure) {
    refusal.value = failureText(failure, t("hardware.error.node_remove_failed"));
    asking.value = false;
  } finally {
    removing.value = false;
  }
}
</script>
