<!-- The Monitor screen's Devices tab (docs/web.md, 「Monitor screen」): a tile per machine, this one first and the
     monitored nodes after it once the list is read; once every machine's reading is answered, the machines it names.
     A personal node's tile names its owner, a skeleton while the names it is told by are read, and a failed read of
     them is said once above the tiles. -->
<template>
  <div class="flex flex-col gap-4">
    <p v-if="nodesError" class="text-sm text-error">{{ $t("screens.error.nodes_failed") }}</p>
    <p v-if="namesFailed" class="text-sm text-error" data-owner-names-failed>{{ $t("hardware.error.users_failed") }}</p>
    <p v-if="readError" class="text-sm text-error">{{ $t("hardware.error.readings_failed") }}</p>
    <!-- Tiles as wide as a machine's rows read well, as many to a row as the panel holds, and every
         tile of a row as tall as the row. -->
    <div class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))] gap-4 sm:gap-6">
      <HardwareTile
        v-for="machine in machines"
        :key="machine.key"
        :machine="machine"
        :owner="machineOwnerText($t, names, machine.account)"
        :owner-loading="machine.account !== null && waiting"
        :reading="readings.get(machine.name) ?? null"
        :status="status"
        :failed="!readings.has(machine.name) && readError !== null"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useLastRead } from "bmo-ui/app/domain/loading";

import { monitorMachines, useMonitorReadings } from "~/domain/hardware";
import { machineOwnerText, useNodes, useOwnerNames } from "~/domain/nodes";

const { nodes, error: nodesError } = useNodes();
const { names, waiting, error: namesError } = useOwnerNames();

// One recorded reading for every tile each period, so every tile stands at the same moment and no
// machine's read can hold another's. A period that fails keeps the tiles on what they last read.
const { readings: listed, status, error: readError } = useMonitorReadings();
const kept = useLastRead(listed, status);
const readings = computed(() => new Map(kept.value.map((one) => [one.name, one])));
// An answer always names this machine, so an empty one is none yet.
const machines = computed(() => monitorMachines(nodes.value, kept.value.length > 0 ? kept.value : null));
// A failed read of the names is said once above the tiles, where a tile names an owner, rather than on every tile.
const namesFailed = computed(() => namesError.value !== null && machines.value.some((machine) => machine.account !== null));
</script>
