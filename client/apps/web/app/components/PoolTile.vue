<template>
  <!-- One place of the pool. Its colour and mark say whether it works, is held or rests; hovering
       says what it is assigned to, and pressing a busy one opens its live log. A co-worker has no
       reach of its own, so the stop button it carries is aimed at the run it works inside. -->
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
        :is="log === null ? 'div' : 'button'"
        :type="log === null ? undefined : 'button'"
        class="flex min-w-0 grow flex-col justify-center gap-1 rounded-md px-2 py-2 text-start"
        :class="log === null ? '' : 'transition-colors hover:brightness-95 active:brightness-90'"
        :aria-label="lines.join(', ')"
        @click="log !== null && emit('open', log)"
      >
        <span class="flex min-w-0 items-center gap-1" :class="target === null ? '' : 'pe-8'">
          <UIcon :name="TILE_STATE_ICONS[props.tile.state]" class="size-4 shrink-0" :class="props.tile.state === 'working' ? 'animate-spin [animation-duration:3s]' : ''" />
          <span class="truncate text-sm" :class="props.name === '' ? '' : 'font-medium'">{{ props.name === "" ? $t(TILE_STATE_LABELS[props.tile.state]) : props.name }}</span>
        </span>
        <span v-if="props.name !== ''" class="truncate text-sm" :class="props.tile.work === null ? 'text-muted' : 'text-toned'">
          {{ props.tile.work === null ? $t(TILE_STATE_LABELS[props.tile.state]) : tileCaption(props.tile.work) }}
        </span>
      </component>

      <!-- The stop button stands over the tile's own corner rather than inside the part that opens the
           log: a press must be one thing or the other, and a button inside a button is neither. -->
      <template v-if="target !== null && props.stops !== undefined">
        <UBadge
          v-if="props.stops.isStopping(target)"
          color="warning"
          variant="subtle"
          :label="$t('live.status.stopping')"
          class="absolute end-1 top-1"
        />
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
import { TILE_STATE_ICONS, TILE_STATE_LABELS, tileCaption, tileLines, tileStop } from "~/domain/pool-board";

import type { PoolBoardLog, PoolBoardTile } from "#shared/agency";
import type { Stops } from "~/domain/stopping";

const props = defineProps<{ tile: PoolBoardTile; name: string; now: number; stops?: Stops }>();

const emit = defineEmits<{ open: [log: PoolBoardLog] }>();

const TONES: Record<PoolBoardTile["state"], string> = {
  working: "border-primary/60 bg-primary/10 text-primary",
  held: "border-dashed border-warning/60 bg-warning/5 text-warning",
  idle: "border-default bg-default text-muted"
};

const log = computed(() => (props.tile.state === "idle" ? null : (props.tile.work?.log ?? null)));
const { t } = useI18n();
const lines = computed(() => tileLines(t, props.tile, props.now));
const caption = computed(() => props.tile.work?.title ?? props.name);
// Only a place with work in it has a run to stop; one held for work that has not started has none.
const target = computed(() => (props.tile.state === "working" ? tileStop(props.tile) : null));
</script>
