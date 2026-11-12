<!-- One machine's full monitor (docs/web.md, 「Monitor screen」): this machine at `/monitor/local`, a node at its
     own name, titled by the name its reading hands over. -->
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
      <HardwareMonitor :key="machine" :url="machineHardwareUrl(machine)" :history-url="machineHistoryUrl(machine)" :live-url="machineLiveUrl(machine)" @read="named" />
      <NodeRemoval v-if="removable !== null" :node="removable" :label="name ?? removable.label" @removed="void removed()" />
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { TAB_ROW_LINE } from "bmo-ui/app/domain/tabs";

import { LOCAL_MACHINE, machineHardwareUrl, machineHistoryUrl, machineIcon, machineLiveUrl, machineName } from "~/domain/hardware";

import { useAdministrator } from "~/domain/access";
import { useNodes } from "~/domain/nodes";

import type { MachineHardware, MonitorNode } from "#shared/types";

const { t } = useI18n();
const route = useRoute();

const machine = computed<string>(() => String(route.params.machine ?? LOCAL_MACHINE));

// The last reading that came back stays while a later asking fails, so a name once read stays too.
const last = ref<MachineHardware | null>(null);
const failed = ref(false);
const kind = computed<MachineHardware["kind"]>(() => last.value?.kind ?? (machine.value === LOCAL_MACHINE ? "local" : "ssh"));
const name = computed(() => machineName(t, { label: null, kind: kind.value }, last.value, failed.value));

watch(machine, () => {
  last.value = null;
  failed.value = false;
});

// A node of the list, not this machine, may be taken off it by the administrator, at the foot of its own monitor.
const administrator = useAdministrator();
const { nodes, refresh } = useNodes();
const router = useRouter();
const removable = computed<MonitorNode | null>(() => {
  if (!administrator.value || machine.value === LOCAL_MACHINE) return null;

  return nodes.value.find((node) => node.name === machine.value && !node.thisMachine) ?? null;
});

async function removed(): Promise<void> {
  await refresh();
  await router.push("/monitor");
}

function named(reading: MachineHardware | null, didFail: boolean): void {
  if (reading !== null) last.value = reading;
  failed.value = didFail;
}
</script>
