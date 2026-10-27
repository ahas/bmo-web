<template>
  <!-- What is running for this room besides the chat agent's own turn — a search, a browse, a job, a watch's
       check — as one line of counts however many run (docs/web.md, the room screen's section on what runs for the room). The
       line never wraps: one too long for the screen is cut at its edge. Its shimmering words are the
       whole sign that something runs. Pressing it opens the log of what runs: one run's at once, or
       a menu of the runs where there are several. -->
  <!-- The row stands whether the line does or not, at one height: a line that comes and goes at the foot of the
       conversation must not move the messages above it (docs/web.md, 「Motion」). -->
  <div v-bind="$attrs" data-work-row class="flex h-8 max-w-full min-w-0 items-center justify-center self-center">
    <UDropdownMenu v-if="summary !== '' && props.lines.length > 1" v-model:open="menuOpen" :items="menu" :content="{ side: 'top', align: 'start' }" :ui="{ itemDescription: 'tabular-nums' }">
      <button type="button" :class="[LINE, PRESSABLE]">
        <UChatShimmer :text="summary" class="block truncate tabular-nums" />
      </button>

      <!-- Each run's time ticks while the menu stands open, and only its figures turn. -->
      <template #item-description="{ item }">
        <template v-if="item.launcher">{{ $t("room.label.launched_by", { name: item.launcher }) }} · </template>
        <RollingSentence :keypath="'room.label.elapsed'" :figures="{ time: { value: now - item.startedAt, text: formatElapsed($t, now - item.startedAt) } }" />
      </template>
    </UDropdownMenu>

    <button
      v-else-if="summary !== '' && only !== null"
      type="button"
      :class="[LINE, PRESSABLE]"
      :aria-haspopup="'dialog'"
      :aria-label="only.watch === null ? $t('room.aria.open_log', { name: only.label }) : $t('room.aria.open_details', { name: only.label })"
      @click="openLog(only)"
    >
      <UChatShimmer :text="summary" class="block truncate tabular-nums" />
    </button>
  </div>

  <!-- The log outlives the line, which can go while it is being read; a watch's check opens the
       watch itself above it. -->
  <AgentLogDialog v-if="log !== null" v-model:open="logOpen" :name="log.agent" :rooms="props.rooms" :watch="log.watch" />
</template>

<script setup lang="ts">
import { usePolling } from "~/domain/polling";
import { formatElapsed } from "~/domain/status";
import { runSummary } from "~/domain/working";

import type { DropdownMenuItem } from "@nuxt/ui";
import type { RoomSummary } from "#shared/types";
import type { RoomRunLine } from "~/domain/working";

interface Props {
  lines: RoomRunLine[];
  rooms?: RoomSummary[];
}

// The line takes the place the room gives it; the log beside it is teleported and takes none.
defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<Props>(), { rooms: () => [] });

const LINE = "max-w-full min-w-0 rounded-2xl bg-elevated/60 px-3 py-1 text-sm";
const PRESSABLE = "transition-colors hover:bg-elevated active:bg-accented";

const { t } = useI18n();

const summary = computed(() => runSummary(t, props.lines));
const only = computed(() => (props.lines.length === 1 ? (props.lines[0] ?? null) : null));

// Each run of the menu says what runs, who launched it and how long it has gone, the time ticking
// only while the menu stands.
const menuOpen = ref(false);
const now = ref(Math.floor(Date.now() / 1000));

watch(menuOpen, (standing) => {
  if (standing) now.value = Math.floor(Date.now() / 1000);
});

usePolling(() => {
  if (menuOpen.value) now.value = Math.floor(Date.now() / 1000);
}, 1000);

const menu = computed<DropdownMenuItem[]>(() =>
  props.lines.map((line) => ({
    label: line.label,
    description: [
      ...(line.launcher === null ? [] : [t("room.label.launched_by", { name: line.launcher })]),
      t("room.label.elapsed", { time: formatElapsed(t, now.value - line.startedAt) })
    ].join(" · "),
    launcher: line.launcher,
    startedAt: line.startedAt,
    onSelect: () => openLog(line)
  }))
);

const log = ref<RoomRunLine | null>(null);
const logOpen = ref(false);

function openLog(line: RoomRunLine): void {
  log.value = line;
  logOpen.value = true;
}
</script>
