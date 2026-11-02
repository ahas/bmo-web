<template>
  <!-- One slot of a role. Its colour and mark say whether a run holds it, a reservation keeps it or it is idle; hovering
       says what holds it, and pressing a working one opens its live log. A run tied to an item carries a stop, aimed
       at that item. -->
  <UTooltip :content="{ side: 'top' }" :ui="{ content: 'h-auto max-w-80 py-2' }">
    <template #content>
      <span class="flex min-w-0 flex-col gap-1 text-sm" role="tooltip">
        <span v-for="(line, at) in lines" :key="at" class="break-words" :class="at === 0 ? 'font-medium text-highlighted' : 'text-toned'">{{ line }}</span>
      </span>
    </template>

    <div
      class="relative flex h-full min-w-0 flex-col rounded-md border"
      :class="[TONES[props.tile.state], target !== null && props.stops?.isAsking(target) ? 'ring-2 ring-warning' : '']"
    >
      <component
        :is="opens ? 'button' : 'div'"
        :type="opens ? 'button' : undefined"
        class="flex min-w-0 grow flex-col justify-center gap-1 rounded-md px-2 py-2 text-start"
        :class="opens ? 'transition-colors hover:brightness-95 active:brightness-90' : ''"
        :aria-label="lines.join(', ')"
        @click="opens && emit('open')"
      >
        <span class="flex min-w-0 items-center gap-1" :class="target === null ? '' : 'pe-8'">
          <UIcon :name="SLOT_STATE_ICONS[props.tile.state]" class="size-4 shrink-0" :class="props.tile.state === 'working' ? 'animate-spin [animation-duration:3s]' : ''" />
          <span class="truncate text-sm font-medium">{{ $t(SLOT_STATE_LABELS[props.tile.state]) }}</span>
        </span>
        <span v-if="props.tile.run !== null" class="truncate text-sm text-toned">{{ props.tile.run.place }}</span>
      </component>

      <!-- The stop button stands over the tile's own corner rather than inside the part that opens the log: a press
           must be one thing or the other, and a button inside a button is neither. -->
      <template v-if="target !== null && props.stops !== undefined">
        <UBadge v-if="props.stops.isStopping(target)" color="warning" variant="subtle" :label="$t('live.status.stopping')" class="absolute end-1 top-1" />
        <UTooltip v-else-if="!props.stops.isAsking(target)" :text="$t('live.action.stop')">
          <UButton
            icon="i-material-symbols-stop-circle-outline"
            size="xs"
            color="neutral"
            variant="ghost"
            class="absolute end-1 top-1"
            :disabled="props.stops.isSending(target)"
            :aria-label="$t('live.aria.stop_named', { name: caption })"
            @click.stop="props.stops.ask(target)"
          />
        </UTooltip>
      </template>
    </div>
  </UTooltip>
</template>

<script setup lang="ts">
import { SLOT_STATE_ICONS, SLOT_STATE_LABELS, tileLines } from "~/domain/role-slots";

import type { SlotTile } from "#shared/role-slots";
import type { Stops } from "~/domain/stopping";

const props = defineProps<{ tile: SlotTile; now: number; stops?: Stops }>();

const emit = defineEmits<{ open: [] }>();

const TONES: Record<SlotTile["state"], string> = {
  working: "border-primary/60 bg-primary/10 text-primary",
  reserved: "border-dashed border-warning/60 bg-warning/5 text-warning",
  idle: "border-default bg-default text-muted"
};

const { t } = useI18n();
const opens = computed(() => props.tile.state === "working");
const lines = computed(() => tileLines(t, props.tile, props.now));
const caption = computed(() => props.tile.run?.place ?? t(SLOT_STATE_LABELS[props.tile.state]));
// Only a working tile with a run tied to an item has a stop.
const target = computed(() => (props.tile.state === "working" ? (props.tile.run?.stop ?? null) : null));
</script>
