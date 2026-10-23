<template>
  <!-- How long the chat agent's window in the room has left, in the room's top bar for as long as it is open
       (docs/web.md, 「The window's time left stands in the top bar」): a listening mark and the time left
       turning down by the second, named by its tooltip. It goes once the time it counts reaches nought. -->
  <UTooltip v-if="left > 0" :text="lines.state">
    <span class="flex shrink-0 items-center gap-1 text-sm text-muted tabular-nums" role="timer" :aria-label="lines.state" data-window-clock>
      <UIcon name="i-material-symbols-hearing" class="size-4 shrink-0" />
      <RollingSentence tag="span" class="whitespace-nowrap" :keypath="lines.left.keypath" :figures="lines.left.figures" />
    </span>
  </UTooltip>
</template>

<script setup lang="ts">
import { useNowSeconds } from "bmo-ui/app/domain/time";
import { turnName, windowClockLines } from "~/domain/working";

interface Props {
  // When the window closes, in unix seconds on this screen's clock.
  closesAt: number;
}

const props = defineProps<Props>();

const { t } = useI18n();
const { now, sync } = useNowSeconds(1000);
// A window moved on is counted from the moment it was read, not from the last tick before it.
watch(() => props.closesAt, sync);
const left = computed(() => props.closesAt - now.value);
const lines = computed(() => windowClockLines(t, turnName(t, undefined), left.value));
</script>
