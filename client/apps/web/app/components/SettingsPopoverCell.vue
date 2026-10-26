<template>
  <!-- A cell whose value takes more than a pick from a list: pressing it opens a dropdown aligned to
       the cell holding that value's own fields. The cell spins while the value is being saved. -->
  <UPopover v-model:open="open" :content="{ align: 'start', side: 'bottom', sideOffset: 0 }">
    <button type="button" :class="CELL_BUTTON" :disabled="props.disabled" :aria-label="props.label">
      <slot />
      <UIcon v-if="props.busy" name="i-material-symbols-progress-activity" class="absolute end-2 top-2 size-4 animate-spin text-muted motion-reduce:animate-none" />
    </button>

    <template #content>
      <div class="flex w-80 max-w-[calc(100vw-2rem)] min-w-(--reka-popover-trigger-width) flex-col gap-3 p-4" :aria-label="props.label" role="group">
        <slot name="content" :close="close" />
      </div>
    </template>
  </UPopover>
</template>

<script setup lang="ts">
import { CELL_BUTTON } from "~/domain/settings-cells";

const props = defineProps<{ label: string; disabled?: boolean; busy?: boolean }>();

const open = defineModel<boolean>("open", { default: false });

function close(): void {
  open.value = false;
}
</script>
