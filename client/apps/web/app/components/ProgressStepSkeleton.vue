<!-- The place one step of the progress stepper keeps while it is read: the rail's mark and the head's
     line, at the head's own height. `detail` keeps the place of the head's second line where the
     stepper it stands for draws one. -->
<template>
  <div class="flex min-w-0 gap-2">
    <span class="flex size-8 shrink-0 items-center justify-center"><SkeletonBar class="size-5 rounded-full" /></span>
    <div class="flex min-h-8 min-w-0 flex-1 flex-col justify-center gap-1 px-2 py-1">
      <SkeletonLine width="w-2/3" />
      <SkeletonLine v-if="props.detail" width="w-1/2" />
    </div>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{ detail?: boolean }>(), { detail: false });
</script>
