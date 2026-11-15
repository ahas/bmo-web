<template>
  <!-- How long a running call has stood, off the reader's own clock from the moment the newest clock note puts its
       start at, its characters turning as they change; a call past the long mark wears a quiet hourglass that names
       itself (docs/web.md, 「A call's clock lines are no line of the log either」). -->
  <span class="flex min-w-0 items-center gap-1" data-tool-clock-elapsed>
    <RollingSentence v-if="seconds !== null" :keypath="'agents.label.clock_running'" :figures="{ time: { value: seconds, text: elapsedText($t, seconds) } }" />
    <span v-else>{{ $t("agents.status.call_running") }}</span>
    <HintTip v-if="long" :text="$t('agents.label.clock_long', { minutes: countText(LONG_CALL_SECONDS / 60) })" class="flex" data-tool-clock-long>
      <UIcon name="i-material-symbols-hourglass-bottom" class="size-4 shrink-0 text-muted" :aria-label="$t('agents.label.clock_long', { minutes: countText(LONG_CALL_SECONDS / 60) })" role="img" />
    </HintTip>
  </span>
</template>

<script setup lang="ts">
import { LONG_CALL_SECONDS } from "~/domain/tool-clock";
import { countText } from "~/domain/numbers";
import { elapsedText, useNowSeconds } from "bmo-ui/app/domain/time";

interface Props {
  // When the call began, in unix seconds; null where no note has said how long it had run.
  startedAt: number | null;
}

const props = defineProps<Props>();

// Under a minute the figure is seconds, so the clock moves every second while the call stands.
const { now } = useNowSeconds(1_000);

const seconds = computed(() => (props.startedAt === null ? null : Math.max(0, Math.floor(now.value - props.startedAt))));
const long = computed(() => seconds.value !== null && seconds.value >= LONG_CALL_SECONDS);
</script>
