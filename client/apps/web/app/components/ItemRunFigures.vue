<template>
  <!-- The item's last job, whether it runs or has ended (docs/web.md, the TODO modal's state tab): its time, its tool
       calls and the tokens it wrote, and beside them when it started and when it ended. Each group takes a line of its
       own where the card is too narrow for it, so no dot is left at a line's end: the figures and the stamps share one
       line on a wide card, and the two stamps one line on a middling one. -->
  <div v-if="shown !== null" class="@container mt-1 text-sm text-muted tabular-nums" data-item-job>
    <div class="flex flex-col gap-1 @2xl:flex-row @2xl:items-center @2xl:gap-2">
      <span class="flex items-center gap-2">
        <UIcon
          :name="shown.running ? 'i-material-symbols-progress-activity' : 'i-material-symbols-check-circle-outline'"
          class="size-4 shrink-0"
          :class="shown.running ? 'animate-spin text-primary motion-reduce:animate-none' : 'text-muted'"
        />
        <!-- The figures that change while the job runs turn only the characters that changed. -->
        <RollingSentence v-if="shown.ticking !== null" data-job-time :keypath="'agents.label.job_running'" :figures="{ time: shown.ticking }" />
        <span v-else data-job-time>{{ shown.took }}</span>
        <span aria-hidden="true">·</span>
        <RollingSentence data-job-tools :keypath="'agents.label.job_tools'" :figures="{ n: shown.tools }" />
        <span aria-hidden="true">·</span>
        <UTooltip :text="$t(CHIP_LABELS.tokens)">
          <span class="flex items-center gap-1" data-job-written>
            <UIcon :name="CHIP_ICONS.tokens" class="size-4 shrink-0" />
            <RollingNumber v-if="shown.written !== null" :value="shown.written.value" :text="shown.written.text" />
            <template v-else>{{ NOTHING }}</template>
          </span>
        </UTooltip>
      </span>
      <span class="hidden @2xl:inline" aria-hidden="true">·</span>
      <span class="flex flex-col gap-1 @sm:flex-row @sm:items-center @sm:gap-2">
        <span data-job-started>{{ shown.started }}</span>
        <template v-if="shown.ended !== null">
          <span class="hidden @sm:inline" aria-hidden="true">·</span>
          <span data-job-ended>{{ shown.ended }}</span>
        </template>
      </span>
    </div>
  </div>
  <!-- Before the item's runs are first read, the place the figures and their stamps will take, line for line: the
       figures, the start, and an ended job's end. -->
  <SkeletonStatus v-else-if="props.job === undefined" as="div" class="@container mt-1 block" :label="$t('common.status.loading')" data-item-job-waiting>
    <div class="flex flex-col gap-1 @2xl:flex-row @2xl:gap-2">
      <SkeletonLine width="w-64" />
      <span class="flex flex-col gap-1 @sm:flex-row @sm:gap-2">
        <SkeletonLine width="w-40" />
        <SkeletonLine v-if="!props.running" width="w-40" />
      </span>
    </div>
  </SkeletonStatus>
</template>

<script setup lang="ts">
import { formatStamp } from "bmo-ui/app/domain/time";

import { CHIP_ICONS, CHIP_LABELS } from "~/domain/chips";
import { jobLineView, writtenTokens } from "~/domain/job-line";
import { usePolling } from "~/domain/polling";
import { uptimeClock } from "~/domain/status";
import { tokenText } from "~/domain/usage";

import type { JobLine } from "#shared/types";

interface Props {
  // The item's last job as its runs read it; none where no job of it ran, and undefined before its runs are read.
  job: JobLine | null | undefined;
  // Whether the item runs now, which says which stamps the place is kept for before the job is read.
  running: boolean;
}

const props = defineProps<Props>();
const { t } = useI18n();
const NOTHING = "—";
const clock = ref(Math.floor(Date.now() / 1000));

// A running job's time ticks between reads; an ended job's stands still.
usePolling(() => {
  if (props.job?.finishedAt === null) clock.value = Math.floor(Date.now() / 1000);
}, 1000);

const shown = computed(() => {
  const job = props.job;

  if (job === null || job === undefined) return null;

  const running = job.finishedAt === null;
  const written = writtenTokens(job);

  return {
    running,
    ticking: running ? { value: clock.value - job.startedAt, text: uptimeClock(clock.value - job.startedAt) } : null,
    took: running ? null : jobLineView(t, job, clock.value).time,
    tools: job.tools,
    written: written === null ? null : { value: written, text: tokenText(written) },
    started: t("todo.label.job_started_at", { time: formatStamp(job.startedAt) }),
    ended: job.finishedAt === null ? null : t("todo.label.job_ended_at", { time: formatStamp(job.finishedAt) })
  };
});
</script>
