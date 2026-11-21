<template>
  <!-- What an agent is doing now (docs/web.md, 「What each agent is doing now」): the idle word under a resting mark, or
       the spinning mark, the one line of what it works on and how long it has been at it; a stop under way reads
       stopping at the line's end. Its tooltip says what the cell cannot hold — the whole line, where the run works and
       its road — a finger reading it by resting on the cell since a tap opens the live log; a job's run is named by its
       item's own tooltip, the run's place and road under it. A cell with nothing more to say than its line carries no
       tooltip of its own, the shared one of a cut line standing in where the line is cut. An agent carrying several
       runs stands the earliest on its line with how many it carries beside it; its tooltip lists them all, and a press
       offers each run's log. Where what it is doing could not be read, or has not been told yet, the cell holds a
       dash. -->
  <component
    :is="single.item === null ? HintTip : ItemTip"
    v-if="single !== null"
    v-bind="single.item === null ? { label: ariaLines.join(', '), disabled: single.detail.length === 0 } : { id: single.item }"
    as="button"
    type="button"
    press
    :class="CELL_BUTTON_LINE"
    :aria-label="ariaLines.join(', ')"
    data-agent-state="working"
    @click="emit('open', 0)"
  >
    <AgentStateLine :doing="single" :elapsed="elapsedOf(single)" :count="0" :stopping="props.stopping" />

    <template v-if="single.item === null" #content>
      <span class="flex min-w-0 flex-col gap-1 py-1 text-sm">
        <span class="break-words font-medium text-highlighted">{{ single.line }}</span>
        <span v-for="(line, at) in single.detail" :key="at" class="break-words text-toned">{{ line }}</span>
      </span>
    </template>
    <template v-else #more>
      <span v-for="(line, at) in single.detail" :key="at" class="break-words text-toned">{{ line }}</span>
    </template>
  </component>

  <!-- Several runs: a press offers the log of each, every one named whole with what it works on and how long. -->
  <UDropdownMenu v-else-if="props.doings.length > 1" :items="runItems" :content="{ align: 'start' }">
    <HintTip as="button" type="button" press :label="ariaLines.join(', ')" :class="CELL_BUTTON_LINE" :aria-label="ariaLines.join(', ')" data-agent-state="working">
      <AgentStateLine :doing="props.doings[0]!" :elapsed="elapsedOf(props.doings[0]!)" :count="props.doings.length" :stopping="props.stopping" />

      <template #content>
        <span class="flex min-w-0 flex-col gap-2 py-1 text-sm">
          <span v-for="(doing, at) in props.doings" :key="at" class="flex min-w-0 flex-col gap-1">
            <span class="break-words font-medium text-highlighted">{{ runLabel(doing) }}</span>
            <span v-for="(line, index) in [...(doing.note === null ? [] : [doing.note]), ...doing.detail]" :key="index" class="break-words text-toned">{{ line }}</span>
          </span>
        </span>
      </template>
    </HintTip>
  </UDropdownMenu>

  <span v-else-if="!props.known" :class="CELL_TEXT" class="text-sm text-muted" data-agent-state="unknown">—</span>

  <span v-else :class="CELL_TEXT_LINE" data-agent-state="idle">
    <UIcon name="i-material-symbols-bedtime-outline" class="size-4 shrink-0 text-muted" />
    <span class="text-sm text-muted">{{ $t("live.label.agent_idle") }}</span>
  </span>
</template>

<script setup lang="ts">
import { HintTip, ItemTip } from "#components";

import { doingFor } from "~/domain/agent-state";
import { CELL_BUTTON_LINE, CELL_TEXT, CELL_TEXT_LINE } from "~/domain/settings-cells";

import type { DropdownMenuItem } from "@nuxt/ui";
import type { AgentDoing } from "~/domain/agent-state";

const props = withDefaults(defineProps<{ doings: readonly AgentDoing[]; now: number; stopping?: boolean; known?: boolean }>(), { stopping: false, known: true });

const emit = defineEmits<{ open: [at: number] }>();

const { t } = useI18n();
const single = computed(() => (props.doings.length === 1 ? props.doings[0]! : null));

function elapsedOf(doing: AgentDoing): string | null {
  return doing.since === null ? null : doingFor(t, doing.since, props.now);
}

// One run as a line of its own: what it works on and how long.
function runLabel(doing: AgentDoing): string {
  const elapsed = elapsedOf(doing);

  return elapsed === null ? doing.line : `${doing.line} · ${elapsed}`;
}

// What a screen reader is told of the cell: each run's line, how long, the work it names, where it works and its road.
const ariaLines = computed(() =>
  props.doings.flatMap((doing) => [runLabel(doing), ...(doing.note === null ? [] : [doing.note]), ...doing.detail])
);

const runItems = computed<DropdownMenuItem[]>(() =>
  props.doings.map((doing, at) => ({
    label: doing.line,
    description: [doing.note, elapsedOf(doing)].filter((part): part is string => part !== null).join(" · "),
    icon: "i-material-symbols-progress-activity",
    ui: { itemLeadingIcon: "animate-spin motion-reduce:animate-none" },
    onSelect: () => emit("open", at)
  }))
);
</script>
