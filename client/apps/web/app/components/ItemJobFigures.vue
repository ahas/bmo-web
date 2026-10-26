<template>
  <p v-if="view !== null" class="flex flex-wrap items-center gap-2 text-sm text-muted tabular-nums" data-item-job>
    <UIcon
      :name="view.running ? 'i-material-symbols-progress-activity' : 'i-material-symbols-check-circle-outline'"
      class="size-4 shrink-0"
      :class="view.running ? 'animate-spin text-primary motion-reduce:animate-none' : 'text-muted'"
    />
    <span>{{ view.time }}</span>
    <span aria-hidden="true">·</span>
    <span>{{ view.tools }}</span>
    <span aria-hidden="true">·</span>
    <UTooltip :text="$t(CHIP_LABELS.tokens)">
      <span class="flex items-center gap-1">
        <UIcon :name="CHIP_ICONS.tokens" class="size-4 shrink-0" />
        {{ view.written }}
      </span>
    </UTooltip>
  </p>
</template>

<script setup lang="ts">
import { CHIP_ICONS, CHIP_LABELS } from "~/domain/chips";
import { jobLineView, useJobLine } from "~/domain/job-line";
import { usePolling } from "~/domain/polling";

interface Props {
  agent: string;
  run: string;
}

const props = defineProps<Props>();
const { t } = useI18n();
// Read again every few seconds, so its tool calls and tokens move as they happen.
const { job } = useJobLine(props.agent, toRef(props, "run"), 3000);
const clock = ref(Math.floor(Date.now() / 1000));

usePolling(() => {
  clock.value = Math.floor(Date.now() / 1000);
}, 1000);

const view = computed(() => (job.value === null ? null : jobLineView(t, job.value, clock.value)));
</script>
