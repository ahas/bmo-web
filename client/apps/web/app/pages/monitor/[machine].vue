<!-- One machine's full monitor (docs/web.md, 「Monitor screen」): this machine at `/monitor/local`, a node at its
     own name, titled by the name its reading hands over. -->
<template>
  <UDashboardPanel id="monitor-machine" :ui="{ body: '[&>*]:max-w-none' }">
    <template #header>
      <UDashboardNavbar :title="name ?? undefined" :icon="machineIcon(kind)">
        <template v-if="name === null" #title>
          <SkeletonStatus :label="$t('hardware.status.name_loading')" class="flex">
            <SkeletonBar class="h-5 w-32" />
          </SkeletonStatus>
        </template>

        <template #right>
          <DeployMark />
          <TodoOpenButton />
          <UsageMeters />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <HardwareMonitor :key="machine" :url="machineHardwareUrl(machine)" :history-url="machineHistoryUrl(machine)" :live-url="machineLiveUrl(machine)" @read="named" />
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { LOCAL_MACHINE, machineHardwareUrl, machineHistoryUrl, machineIcon, machineLiveUrl, machineName } from "~/domain/hardware";

import type { MachineHardware } from "#shared/types";

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

function named(reading: MachineHardware | null, didFail: boolean): void {
  if (reading !== null) last.value = reading;
  failed.value = didFail;
}
</script>
