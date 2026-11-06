<template>
  <!-- The work of a supervisor's double, as the owner's own chat stands it (docs/web.md, the room screen's
       delegated-run marker): one centred, muted line a task, at the conversation's foot where a passing word
       stands. A run waiting or running spins its mark, and one this screen watched end says what it came to for a
       moment and then goes. Nothing of it is a bubble or a row of the conversation. -->
  <div v-if="props.lines.length > 0" class="mt-4 flex min-w-0 flex-col items-center gap-2 self-center" role="status" data-delegation-marker>
    <p
      v-for="line in props.lines"
      :key="line.key"
      class="flex min-w-0 max-w-full items-center gap-2 text-center text-sm leading-(--chat-meta-line) text-muted wrap-anywhere"
      :data-delegation-stage="line.stage"
    >
      <UIcon
        v-if="line.stage !== 'ended'"
        name="i-material-symbols-progress-activity"
        class="size-4 shrink-0 motion-safe:animate-spin"
        aria-hidden="true"
      />
      <span class="min-w-0">{{ line.text }}</span>
    </p>
  </div>
</template>

<script setup lang="ts">
import type { DelegationLine } from "~/domain/delegations";

interface Props {
  lines: readonly DelegationLine[];
}

const props = defineProps<Props>();
</script>
