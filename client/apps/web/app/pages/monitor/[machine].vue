<!-- One machine's full monitor, a node's own screen (docs/web.md, 「Monitor screen」): this machine at `/monitor/local`, a
     node at its own name, titled by the name its reading hands over. A node the monitor does not read, or a machine the
     node service no longer knows, asks for no reading and stands one line in the cards' place. A personal node's
     system card names its owner. -->
<template>
  <UDashboardPanel id="monitor-machine" :ui="{ body: '[&>*]:max-w-none' }">
    <template #header>
      <ConsoleTitleBar :title="name ?? undefined" :icon="machineIcon(kind)">
        <template v-if="name === null" #title>
          <SkeletonStatus :label="$t('hardware.status.name_loading')" class="flex">
            <SkeletonBar class="h-5 w-32" />
          </SkeletonStatus>
        </template>
      </ConsoleTitleBar>

      <!-- The screen's own row under the bar, holding the way back to every machine's monitor at its left end
           (docs/web.md, 「Monitor screen」). -->
      <div :class="['flex h-12 shrink-0 items-center gap-2 px-4', TAB_ROW_LINE]" data-screen-row>
        <UTooltip :text="$t('common.action.back')">
          <UButton to="/monitor" size="sm" square color="neutral" variant="ghost" icon="i-material-symbols-arrow-back" :aria-label="$t('common.action.back')" data-way-back />
        </UTooltip>
      </div>
    </template>

    <template #body>
      <p v-if="unmonitored !== null" class="text-sm text-muted" data-node-unmonitored>{{ unmonitored }}</p>
      <HardwareMonitor v-else-if="known" :key="machine" :url="machineHardwareUrl(machine)" :history-url="machineHistoryUrl(machine)" :live-url="machineLiveUrl(machine)" :owner="owner" :owner-loading="owner !== null && ownerWaiting" :owner-failed="ownerError !== null" @read="named" />
      <NodeOwnership v-if="editable !== null" :node="editable" :label="nodeLabel" @saved="(next: MonitorNode) => void changed(next)" />
      <NodeRemoval v-if="removable !== null" :node="removable" :label="nodeLabel" @removed="void removed()" />
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { TAB_ROW_LINE } from "bmo-ui/app/domain/tabs";

import { LOCAL_MACHINE, machineHardwareUrl, machineHistoryUrl, machineIcon, machineLiveUrl, machineName } from "~/domain/hardware";

import { useAdministrator } from "~/domain/access";
import { machineOwnerText, useNodes, useOwnerNames } from "~/domain/nodes";

import type { MachineHardware, MonitorNode } from "#shared/types";

const { t } = useI18n();
const route = useRoute();

const machine = computed<string>(() => String(route.params.machine ?? LOCAL_MACHINE));

const { nodes, status: nodesStatus, refresh } = useNodes();
const node = computed<MonitorNode | null>(() => (machine.value === LOCAL_MACHINE ? null : (nodes.value.find((one) => one.name === machine.value) ?? null)));

// The last reading that came back stays while a later asking fails, so a name once read stays too. A machine the node
// service answers it does not know is told apart, and its node is read again to learn whether it is still monitored.
const last = ref<MachineHardware | null>(null);
const failed = ref(false);
const missing = ref(false);
const unread = computed(() => node.value?.monitored === false);
const kind = computed<MachineHardware["kind"]>(() => last.value?.kind ?? node.value?.kind ?? (machine.value === LOCAL_MACHINE ? "local" : "ssh"));
const name = computed(() => (unread.value || missing.value ? (node.value?.label ?? machine.value) : machineName(t, { label: null, kind: kind.value }, last.value, failed.value)));
const nodeLabel = computed(() => name.value ?? node.value?.label ?? machine.value);

// A personal node's owner, in the words its tile names it by.
const { names: ownerNames, waiting: ownerWaiting, error: ownerError } = useOwnerNames();
const owner = computed(() => machineOwnerText(t, ownerNames.value, node.value?.account ?? null));

// A node's reading is asked only once the node list has said whether it is a machine at all: a node not monitored is
// none. The list read again later leaves the cards standing.
const listRead = ref(false);
const known = computed(() => machine.value === LOCAL_MACHINE || listRead.value);

watch(nodesStatus, (now) => {
  if (now === "success" || now === "error") listRead.value = true;
}, { immediate: true });

// The line standing in the cards' place: a node not monitored, always a personal one, is never read, and a machine the
// node service no longer knows is none. Until the node list has been read again, a machine that went missing waits for
// it rather than guessing which it is.
const unmonitored = computed<string | null>(() => {
  if (unread.value) return t("hardware.message.personal_unmonitored");
  if (!missing.value) return null;

  return nodesStatus.value === "pending" ? "" : t("hardware.error.no_machine");
});

watch(machine, () => {
  last.value = null;
  failed.value = false;
  missing.value = false;
});

function named(reading: MachineHardware | null, didFail: boolean, gone: boolean): void {
  if (reading !== null) last.value = reading;
  failed.value = didFail;

  if (gone && !missing.value) {
    missing.value = true;
    void refresh();
  }
}

// A node of the list, not this machine, may have its ownership set and be taken off the list by the administrator, at
// the foot of its own screen.
const administrator = useAdministrator();
const editable = computed<MonitorNode | null>(() => (administrator.value ? node.value : null));
const removable = computed<MonitorNode | null>(() => (editable.value !== null && !editable.value.thisMachine ? editable.value : null));
const router = useRouter();

async function changed(next: MonitorNode): Promise<void> {
  // A node monitored again is a machine again, so its reading is asked afresh.
  if (next.monitored) missing.value = false;
  await refresh();
}

async function removed(): Promise<void> {
  await refresh();
  await router.push("/monitor");
}
</script>
