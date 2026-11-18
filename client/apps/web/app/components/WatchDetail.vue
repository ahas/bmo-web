<template>
  <!-- A watch under the run that holds it, or standing on its own. In a list it is one line — its
       number and its short name — and everything else about it opens under that line when it is
       pressed: where it stands, what it waits for, how its last check went, the whole of what it
       promised, the check and the moment it waits for. Where whatever holds this already carries
       the watch's name — a dialog whose head is that name — the name line is left off rather than
       said twice, and the rest stands open, since that dialog was opened to read it. -->
  <div class="flex min-w-0 flex-col gap-1 border-s-2 border-primary ps-3 text-sm">
    <UCollapsible v-if="props.named" v-model:open="open" class="flex min-w-0 flex-col gap-1">
      <!-- The name is the watch's own short one and the whole of what it promised opens under it,
           so this line is cut rather than set moving. A watch serving no memory says so on the line,
           since nothing closing a memory will end it. -->
      <UButton
        :trailing-icon="open ? 'i-material-symbols-keyboard-arrow-up' : 'i-material-symbols-keyboard-arrow-down'"
        size="sm"
        color="neutral"
        variant="ghost"
        block
        class="justify-between font-medium text-highlighted"
      >
        <span class="flex min-w-0 flex-col items-start gap-1">
          <span class="max-w-full truncate">{{ watchTitle($t, watch) }}</span>
          <span v-if="watch.memoryId === null" class="flex flex-wrap items-center gap-1">
            <UBadge color="neutral" variant="subtle" size="sm" :label="$t('live.label.watch_no_memory')" />
          </span>
        </span>
      </UButton>

      <template #content>
        <div class="flex min-w-0 flex-col gap-1 pb-2">
          <WatchFacts :watch="watch" :now="now" :context="props.context" />
        </div>
      </template>
    </UCollapsible>

    <WatchFacts v-else :watch="watch" :now="now" :context="props.context" />
  </div>
</template>

<script setup lang="ts">
import { watchTitle } from "~/domain/watches";

import type { WatchView } from "#shared/types";

const props = withDefaults(
  defineProps<{
    watch: WatchView;
    now: number;
    named?: boolean;
    // Where the watch stands, for a watch no run line above it places: its room and its state.
    context?: string | null;
  }>(),
  { named: true, context: null }
);

const open = ref(false);
</script>
