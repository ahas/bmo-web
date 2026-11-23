<template>
  <!-- The breathing ring of a bubble being judged (docs/web.md, the room screen's verdicts): a layer under
       everything the bubble holds, carrying the bubble's own shape ringed round (its box, and, where it
       hangs one, its tail grown by the ring's width), which the stylesheet fades in and out as one. -->
  <span aria-hidden="true" data-beat class="bubble-beat pointer-events-none absolute inset-0">
    <BubbleTail v-if="props.tail" :side="props.tail" grown />
    <span class="bubble-beat-ground absolute inset-0" />
  </span>
</template>

<script setup lang="ts">
import type { MessageSide } from "~/domain/room";

interface Props {
  // The side the bubble's tail hangs on, or null where it hangs none.
  tail: MessageSide | null;
}

const props = defineProps<Props>();
</script>
