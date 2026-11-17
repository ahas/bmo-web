<template>
  <!-- The units of one kind, flat, each with its path from its company under its name (docs/web.md, 「Organisation」,
       its chart): a press chooses a unit as a press on the tree does. The chart stands it in the tree's place, and in
       the tree's drawer on a narrow screen. -->
  <div class="flex flex-col" data-unit-kind-list>
    <UButton
      v-for="unit in props.units"
      :key="unit.id"
      color="neutral"
      :variant="unit.id === props.chosen ? 'soft' : 'ghost'"
      class="flex-col items-start gap-0 text-start"
      :data-unit-drop="unit.id"
      @click="emit('choose', unit.id)"
    >
      <span class="text-sm text-highlighted">{{ unit.name }}</span>
      <span v-if="unit.path !== ''" class="text-sm break-keep text-muted [overflow-wrap:anywhere]">{{ unit.path }}</span>
    </UButton>
  </div>
</template>

<script setup lang="ts">
interface Props {
  // Each unit by its number, its name and the path above it, empty for a company.
  units: readonly { id: number; name: string; path: string }[];
  chosen: number | null;
}

const props = defineProps<Props>();
const emit = defineEmits<{ choose: [unit: number] }>();
</script>
