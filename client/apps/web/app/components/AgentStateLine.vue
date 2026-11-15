<template>
  <!-- The one line of a working agent's state cell: the spinning mark, what it works on, how long, how many runs it
       carries where that is more than one, and stopping where a stop of its is under way. -->
  <UIcon name="i-material-symbols-progress-activity" class="size-4 shrink-0 animate-spin text-primary [animation-duration:3s]" />
  <span class="min-w-0 truncate text-sm text-highlighted">{{ props.doing.line }}</span>
  <span v-if="props.elapsed !== null" class="shrink-0 text-sm text-muted tabular-nums">{{ props.elapsed }}</span>
  <UBadge v-if="props.count > 1" v-bind="COUNT_BADGE" color="neutral" class="shrink-0" :label="countText(props.count)" />
  <UBadge v-if="props.stopping" class="shrink-0" color="warning" variant="subtle" :label="$t('live.status.stopping')" />
</template>

<script setup lang="ts">
import { COUNT_BADGE, countText } from "~/domain/numbers";

import type { AgentDoing } from "~/domain/agent-state";

const props = defineProps<{ doing: AgentDoing; elapsed: string | null; count: number; stopping: boolean }>();
</script>
