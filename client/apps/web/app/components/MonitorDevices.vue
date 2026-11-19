<!-- The Monitor screen's Devices tab (docs/web.md, 「Monitor screen」): a tile per machine, this one first and the
     shared nodes after it once the list is read; once every machine's reading is answered, the machines it names. -->
<template>
  <div class="flex flex-col gap-4">
    <p v-if="nodesError" class="text-sm text-error">{{ $t("screens.error.nodes_failed") }}</p>
    <p v-if="readError" class="text-sm text-error">{{ $t("hardware.error.readings_failed") }}</p>
    <!-- Tiles as wide as a machine's rows read well, as many to a row as the panel holds, and every
         tile of a row as tall as the row. -->
    <div class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))] gap-4 sm:gap-6">
      <HardwareTile
        v-for="machine in machines"
        :key="machine.key"
        :machine="machine"
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
import { useNodes } from "~/domain/nodes";

const { nodes, error: nodesError } = useNodes();

// One recorded reading for every tile each period, so every tile stands at the same moment and no
// machine's read can hold another's. A period that fails keeps the tiles on what they last read.
const { readings: listed, status, error: readError } = useMonitorReadings();
const kept = useLastRead(listed, status);
const readings = computed(() => new Map(kept.value.map((one) => [one.name, one])));
// An answer always names this machine, so an empty one is none yet.
const machines = computed(() => monitorMachines(nodes.value, kept.value.length > 0 ? kept.value : null));
</script>
