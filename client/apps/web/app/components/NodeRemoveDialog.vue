<template>
  <!-- The question a node's removal asks, the administrator's (docs/web.md, 「Monitor screen」), opened from the foot of
       the node's screen and from its row of the node list. A hub node whose agent is attached may be sent a leave with
       it, so the agent uninstalls itself and departs rather than coming back on the next pass; a node with no attached
       agent is only taken off the list. A refusal is handed back for the place that opened it to say. -->
  <UModal v-model:open="open" :title="$t('hardware.title.node_remove_ask', { name: props.label })" :ui="{ content: 'sm:max-w-xl' }">
    <template #close="{ ui }">
      <ShellClose :class="ui.close()" @close="open = false" />
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
        <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" @click="open = false" />
        <UButton :label="$t('hardware.action.node_remove')" color="error" :loading="removing" data-node-remove-confirm @click="void remove()" />
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import type { MonitorNode } from "#shared/types";

const props = defineProps<{ node: MonitorNode; label: string }>();
const emit = defineEmits<{ removed: []; refused: [reason: string] }>();
const open = defineModel<boolean>("open", { default: false });

const { t } = useI18n();
const removing = ref(false);
// Only an attached hub node's agent can be sent a leave; it is offered on, since a node removed with its agent still
// attached comes back.
const leavable = computed(() => props.node.kind === "hub" && props.node.connected);
const leave = ref(true);

watch(open, (standing) => {
  if (standing) leave.value = true;
});

async function remove(): Promise<void> {
  removing.value = true;

  try {
    await $fetch(`/api/nodes/${encodeURIComponent(props.node.name)}`, { method: "DELETE", query: leavable.value && leave.value ? { leave: "true" } : {} });
    open.value = false;
    emit("removed");
  } catch (failure) {
    open.value = false;
    emit("refused", failureText(failure, t("hardware.error.node_remove_failed")));
  } finally {
    removing.value = false;
  }
}
</script>
