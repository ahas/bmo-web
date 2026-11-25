<!-- The place one row of the TODO board keeps while the board is being read: the row's own frame,
     its handle column, its number and title on the line they stand on, and the marks under them.
     It is the row's shape rather than a likeness of it, so a row landing in its place moves
     nothing — on a phone the number takes a line of its own here as it does there. -->
<template>
  <div class="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-1 rounded-md border border-default py-2 ps-1 pe-2">
    <div class="row-span-2 flex justify-center"><SkeletonBar class="size-9 rounded-sm" /></div>

    <div class="flex items-start gap-2">
      <div class="flex min-w-0 flex-1" :class="narrow ? 'flex-col' : 'items-start gap-2'">
        <SkeletonLine class="shrink-0" width="w-8" />
        <SkeletonLine :class="narrow ? 'w-3/5' : 'flex-1'" width="w-3/5" />
      </div>
      <SkeletonBar class="mt-0.5 size-4 shrink-0 rounded-sm" />
    </div>

    <div class="mt-1 flex h-5 items-center gap-1">
      <SkeletonBar class="h-5 w-12 rounded-sm" />
      <SkeletonBar class="h-5 w-16 rounded-sm" />
    </div>
  </div>
</template>
<script setup lang="ts">
// Whether the panel stands at the width where a row's number takes a line of its own.
defineProps<{ narrow: boolean }>();
</script>
