<template>
  <!-- What a round read from the brain, as its end names it (docs/web.md, the room screen's brain chip): one list read like a
       diff, what the round read new first as added lines in the success colour with a leading plus, then what the
       session already held, plain. For the administrator each line opens the piece in a modal of its own. -->
  <div data-brain-reads class="min-w-0">
    <ul class="flex min-w-0 flex-col">
      <li v-for="read in list" :key="read.path" class="min-w-0" :data-brain-read="readNew(read) ? 'new' : 'held'">
        <component
          :is="opens ? 'button' : 'div'"
          :type="opens ? 'button' : undefined"
          class="flex w-full min-w-0 items-baseline gap-2 rounded-sm px-1 text-start text-sm"
          :class="[readNew(read) ? 'bg-success/10 text-success' : 'text-muted', opens ? (readNew(read) ? 'hover:bg-success/20 active:bg-success/25' : 'hover:bg-current/10 active:bg-current/20') : '']"
          :aria-label="opens ? $t('room.aria.brain_read_open', { name: readLabel($t, read, props.chatId) }) : undefined"
          @click="opens ? (opened = read) : undefined"
        >
          <span aria-hidden="true" class="w-2 shrink-0 font-mono">{{ readNew(read) ? "+" : "" }}</span>
          <span class="min-w-0 flex-1 break-words">{{ readLabel($t, read, props.chatId) }}</span>
        </component>
      </li>
    </ul>

    <BrainReadDialog v-if="opens" v-model:read="opened" :chat-id="props.chatId" :agent="props.agent!" />
  </div>
</template>

<script setup lang="ts">
import { readLabel, readList, readNew } from "~/domain/draft-process";
import { useAdministrator } from "~/domain/access";

import type { DraftRead } from "#shared/drafting";

interface Props {
  reads: DraftRead[];
  chatId: number;
  // The agent whose round read them, whose brain a piece is read from; null where the round names none.
  agent: string | null;
}

const props = defineProps<Props>();
const administrator = useAdministrator();

const list = computed(() => readList(props.reads));
const opens = computed(() => administrator.value && props.agent !== null);
// The piece standing open in the modal; it stays set while the modal closes, so what it shows stays until it is gone.
const opened = ref<DraftRead | null>(null);
</script>
