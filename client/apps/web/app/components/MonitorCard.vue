<!-- The card every part of a machine's monitor stands in (docs/web.md, 「Monitor screen」):
     padded 16px, its title on one line with what names the piece — a model — beside it and whatever
     the card offers to press at its end, and the card's figures under it at the same 16px. -->
<template>
  <UCard :ui="{ body: 'p-4 sm:p-4' }">
    <div class="@container flex flex-col gap-4">
      <div class="flex min-w-0 items-center gap-3">
        <h2 class="shrink-0 text-lg font-medium">{{ title }}</h2>
        <slot name="detail">
          <span v-if="detail" class="min-w-0 flex-1 truncate text-sm text-muted" :title="detail">{{ detail }}</span>
        </slot>
        <div v-if="$slots.actions" class="ms-auto flex shrink-0 items-center gap-2">
          <slot name="actions" />
        </div>
      </div>

      <slot />
    </div>
  </UCard>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ title: string; detail?: string | null }>(), { detail: null });
</script>
