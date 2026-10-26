<template>
  <li class="flex flex-col gap-1" :class="{ 'ms-4 border-s border-default ps-4': props.row.depth > 0 }" :data-log-row="props.row.key">
    <!-- A call's own block carries its time on its prompt line and its description on top, so it has no head row. -->
    <div v-if="line.kind !== 'tool'" class="flex flex-wrap items-center gap-2">
      <!-- The clock is a figure and not code: it reads in the interface's own face, and the
           columns of it line up because the digits are tabular. What is monospaced on this row
           is the tool's name, its arguments and the bodies below — the places where a command,
           a path or a fragment of code actually stands. -->
      <time class="text-sm tabular-nums text-dimmed">{{ formatTime(line.at) }}</time>
      <ContextStateMark v-if="mark !== null" :look="mark" />
      <!-- A result whose call is not on the page wears the tool's own name as its chip; any other line wears its kind's
           word. -->
      <UBadge v-if="chip !== null" :color="look.color" variant="subtle" size="sm" :icon="chip.icon" :label="chip.label" class="font-mono" />
      <UBadge v-else :color="look.color" variant="subtle" size="sm" :label="look.label" />
    </div>

    <!-- A call is one block in the terminal look, its result and the change it made inside it (docs/web.md, 「A tool
         call」). -->
    <AgentToolCall v-if="line.kind === 'tool'" :row="props.row" />

    <!-- A result whose call scrolled out of the page stands in the same block, its command unknown. -->
    <div v-else-if="line.kind === 'tool-result'" class="flex min-w-0 flex-col overflow-hidden rounded-md border border-default font-mono text-sm">
      <AgentToolResult :text="line.text" :look="{ kind: 'plain' }" :truncated="line.truncated" class="border-t-0" />
    </div>

    <!-- Any other line is either words the run or the bot wrote, which stand as the markdown they
         were written in, or a record — how the run was opened, what it was handed — which stands
         whole as it was stored, wrapping inside the log rather than widening it. -->
    <template v-else>
      <MarkdownText v-if="look.words" :text="line.text" class="text-sm" />
      <pre v-else class="font-mono text-sm break-words whitespace-pre-wrap">{{ line.text }}</pre>
      <p v-if="line.truncated" class="text-sm text-dimmed">{{ SHORT }}</p>
    </template>

  </li>
</template>

<script setup lang="ts">
import { contextStateLook, lineLook, toolChip } from "~/domain/log";
import { formatTime } from "bmo-ui/app/domain/time";

import type { LogRow } from "~/domain/log";

interface Props {
  row: LogRow;
}

const props = defineProps<Props>();
const { t } = useI18n();

// What the line says when the record itself is short of what it held: the writer cut it at its own cap.
const SHORT = t("agents.label.record_ends");

const line = computed(() => props.row.line);

const look = computed(() => lineLook(t, line.value));
// Whether a reference document went in full or as an already-loaded mark.
const mark = computed(() => contextStateLook(t, line.value));

// The chip a call wears in place of its kind's word.
const chip = computed(() => toolChip(line.value));
</script>
