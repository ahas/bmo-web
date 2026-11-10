<template>
  <!-- The turn's last call, one line (docs/web.md, the room screen's running line): the badge its sort wears and
       what it was about, at its whole length, the way the agent's log keeps it. A new call turns the page: the line
       standing moves off to the left while the new one comes in from the right, the row keeping one line's height;
       a reader who asked for less movement sees the new line take the place at once. -->
  <div class="relative min-w-0 w-full overflow-hidden">
    <Transition name="page">
      <div :key="props.at" class="flex min-w-0 flex-wrap items-baseline gap-2">
        <!-- A reference document says, left of its sort, whether it was read on this turn or was already in the
             session. -->
        <ContextStateMark v-if="shown.mark !== null" :look="shown.mark" class="self-center" />
        <!-- A call wears its tool's own name as its chip, with the icon the tool declares, as the agent's log
             shows it; what was handed over wears its sort's word. -->
        <UBadge v-if="shown.chip !== null" :color="shown.look.color" variant="subtle" size="sm" :icon="shown.chip.icon" :label="shown.chip.label" class="font-mono" />
        <UBadge v-else :color="shown.look.color" variant="subtle" size="sm" :label="shown.look.label" />
        <!-- A path and a command carry runs with nowhere to break, and on a phone such a run breaks inside itself
             or it takes the whole page sideways. -->
        <span class="min-w-0 font-mono text-sm break-all text-muted">{{ shown.text }}</span>
        <UBadge v-if="shown.failed" color="warning" variant="subtle" size="sm" :label="FAILED" />
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { actionLook, useToolIcons } from "~/domain/working";

import type { TurnAction } from "#shared/types";

interface Props {
  action: TurnAction;
  // Which call of the turn this is, which tells one call from the next so the page turns between them.
  at: number;
}

const props = defineProps<Props>();

const { t } = useI18n();

// What a call that came back a failure wears. A call still out and one that came back well both stand plainly:
// the room is watching the turn, not auditing it.
const FAILED = t("room.status.failed");

// A call read off the bot's live picture carries no icon of its own, so the one its tool declares is read here.
const icons = useToolIcons();
const shown = computed(() => actionLook(t, props.action, icons.value));
</script>

<style scoped>
.page-enter-active,
.page-leave-active {
  transition:
    transform 0.3s ease,
    opacity 0.3s ease;
}

.page-leave-active {
  position: absolute;
  inset-inline: 0;
  top: 0;
}

.page-enter-from {
  transform: translateX(100%);
  opacity: 0;
}

.page-leave-to {
  transform: translateX(-100%);
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .page-enter-active,
  .page-leave-active {
    transition: none;
  }
}
</style>
