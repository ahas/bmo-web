<!-- The Monitor screen's Devices tab (docs/web.md, 「Monitor screen」): a tile per machine, this one first and the
     nodes after it once the list is read. -->
<template>
  <div class="flex flex-col gap-4">
    <p v-if="error" class="text-sm text-error">{{ $t("screens.error.nodes_failed") }}</p>
    <!-- Tiles as wide as a machine's rows read well, as many to a row as the panel holds, and every
         tile of a row as tall as the row. -->
    <div class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))] gap-4 sm:gap-6">
      <HardwareTile v-for="machine in machines" :key="machine.key" :machine="machine" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { monitorMachines } from "~/domain/hardware";
import { useNodes } from "~/domain/nodes";

const { nodes, error } = useNodes();
const machines = computed(() => monitorMachines(nodes.value));
</script>
