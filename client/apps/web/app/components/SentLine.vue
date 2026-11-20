<template>
  <!-- Who sent what a line of the room information shows and when, after what the line leads with where it leads with
       something (docs/web.md, the room screen's room information): what leads and the sender's name give way together,
       each cut where the line runs short, and the moment keeps the width it needs. -->
  <span class="flex min-w-0 items-center gap-1 text-sm text-muted" data-sent-line>
    <template v-if="props.first !== null">
      <span class="min-w-0 truncate tabular-nums">{{ props.first }}</span>
      <span aria-hidden="true" class="shrink-0">·</span>
    </template>
    <span class="min-w-0 truncate">{{ props.sender }}</span>
    <span aria-hidden="true" class="shrink-0">·</span>
    <span class="shrink-0 tabular-nums">{{ formatStamp(props.sentAt) }}</span>
  </span>
</template>

<script setup lang="ts">
import { formatStamp } from "bmo-ui/app/domain/time";

interface Props {
  // What the line leads with — a file's size, a link's site — or nothing.
  first: string | null;
  sender: string;
  // When it was sent, in epoch seconds.
  sentAt: number;
}

const props = defineProps<Props>();
</script>
