<template>
  <!-- The work of a supervisor's double, as the owner's own chat stands it (docs/web.md, the room screen's
       delegated-run marker): one centred, muted line a task, at the conversation's foot where a passing word
       stands. A run waiting or running spins its mark, and one this screen watched end says what it came to for a
       moment and then goes. A line whose run is known ends in one icon button opening that run's log. Nothing of it is
       a bubble or a row of the conversation. -->
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
      <UTooltip v-if="line.run !== null" :text="$t('room.action.delegation_log')">
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-material-symbols-article-outline"
          class="shrink-0"
          :aria-label="$t('room.action.delegation_log')"
          data-delegation-log
          @click="openLog(line.run)"
        />
      </UTooltip>
    </p>
  </div>

  <!-- The dialog keeps the run it was opened at, so it stays open when an ended run's notice goes. -->
  <AgentLogDialog v-if="log !== null" v-model:open="logOpen" :name="log.agent" :place="{ run: log.name, only: true }" end />
</template>

<script setup lang="ts">
import type { DelegationRun } from "#shared/types";
import type { DelegationLine } from "~/domain/delegations";

interface Props {
  lines: readonly DelegationLine[];
}

const props = defineProps<Props>();

const log = ref<DelegationRun | null>(null);
const logOpen = ref(false);

function openLog(run: DelegationRun): void {
  log.value = run;
  logOpen.value = true;
}
</script>
