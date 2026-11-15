<template>
  <li class="flex flex-col gap-1" :class="{ 'ms-4 border-s border-default ps-4': props.row.depth > 0 }" :data-log-row="props.row.key">
    <!-- A call's own block carries its time on its prompt line and its description on top, so it has no head row. -->
    <div v-if="!call" class="flex flex-wrap items-center gap-2">
      <!-- The clock is a figure and not code: it reads in the interface's own face, and the
           columns of it line up because the digits are tabular. What is monospaced on this row
           is the tool's name, its arguments and the bodies below — the places where a command,
           a path or a fragment of code actually stands. -->
      <time class="text-sm tabular-nums text-dimmed">{{ formatTime(line.at) }}</time>
      <ContextStateMark v-if="mark !== null" :look="mark" />
      <!-- A result whose call is not on the page wears the tool's own name as its chip; any other line wears its kind's
           word. -->
      <UBadge v-if="chip !== null" :color="look.color" variant="subtle" size="sm" :icon="chip.icon" :label="chip.label" class="font-mono" />
      <!-- A kind the console does not know wears its own word (docs/web.md, 「Agent screen」). -->
      <UBadge v-else-if="!known" color="neutral" variant="subtle" size="sm" :label="line.kind" class="font-mono" />
      <UBadge v-else :color="look.color" variant="subtle" size="sm" :label="look.label" />
    </div>

    <!-- A call is one block in the terminal look, its result and the change it made inside it (docs/web.md, 「A tool
         call」). -->
    <!-- So is a call not on the page that the call clock's notes stand in for (docs/web.md, 「A call's clock lines are no
         line of the log either」). -->
    <AgentToolCall v-if="call" :row="props.row" />

    <!-- A result whose call scrolled out of the page stands in the same block, its command unknown. -->
    <div v-else-if="line.kind === 'tool-result'" class="flex min-w-0 flex-col overflow-hidden rounded-md border border-default font-mono text-sm">
      <AgentToolResult :text="line.text" :look="{ kind: 'plain' }" :truncated="line.truncated" class="border-t-0" />
    </div>

    <!-- Any other line is either words the run or the bot wrote, which stand as the markdown they
         were written in, or a record — how the run was opened, what it was handed — which stands
         whole as it was stored, wrapping inside the log rather than widening it. -->
    <!-- A line of a kind the console does not know folds what it holds behind its details press, never a bare field list. -->
    <UChatTool v-else-if="!known" :text="$t('agents.action.line_details')" chevron="leading" data-log-unknown>
      <dl v-if="recordFields.length > 0" class="pair-list gap-x-4 gap-y-1 text-sm">
        <template v-for="field in recordFields" :key="field.label">
          <dt class="font-mono text-muted">{{ field.label }}</dt>
          <dd class="break-words whitespace-pre-wrap">{{ field.value }}</dd>
        </template>
      </dl>
      <pre v-else class="font-mono text-sm break-words whitespace-pre-wrap">{{ line.text }}</pre>
    </UChatTool>

    <template v-else>
      <!-- A pane program's answer stands as its words, out of the record it came in. -->
      <MarkdownText v-if="line.kind === 'answer'" :text="answerText(line.text)" class="text-sm" />
      <MarkdownText v-else-if="look.words" :text="line.text" class="text-sm" />
      <!-- A record that is a JSON object or list stands as its named fields, never as its text (docs/web.md, 「A
           value shown as what it is」); any other record stands whole as it was stored. -->
      <dl v-else-if="recordFields.length > 0" class="pair-list gap-x-4 gap-y-1 text-sm" data-log-record>
        <template v-for="field in recordFields" :key="field.label">
          <dt class="font-mono text-muted">{{ field.label }}</dt>
          <dd class="break-words whitespace-pre-wrap">{{ field.value }}</dd>
        </template>
      </dl>
      <pre v-else class="font-mono text-sm break-words whitespace-pre-wrap">{{ line.text }}</pre>
      <p v-if="line.truncated" class="text-sm text-dimmed">{{ SHORT }}</p>
    </template>

  </li>
</template>

<script setup lang="ts">
import { answerText, contextStateLook, knownKind, lineLook, toolChip } from "~/domain/log";
import { formatTime } from "bmo-ui/app/domain/time";
import { jsonFields } from "~/domain/dbview";

import type { LogRow } from "~/domain/log";

interface Props {
  row: LogRow;
}

const props = defineProps<Props>();
const { t } = useI18n();

// What the line says when the record itself is short of what it held: the writer cut it at its own cap.
const SHORT = t("agents.label.record_ends");

const line = computed(() => props.row.line);
// Whether the row is a call's block: a call's own line, or the call clock's notes standing in for one.
const call = computed(() => line.value.kind === "tool" || props.row.clock !== undefined);

const look = computed(() => lineLook(t, line.value));
const known = computed(() => knownKind(line.value.kind));
// Whether a reference document went in full or as an already-loaded mark.
const mark = computed(() => contextStateLook(t, line.value));

// The chip a call wears in place of its kind's word.
const chip = computed(() => toolChip(line.value));

// A record that reads as a JSON object or list, as its named fields; none for a record of any other shape.
const recordFields = computed(() => {
  const text = line.value.text.trim();

  if ((known.value && look.value.words) || !/^[[{]/.test(text)) return [];

  try {
    const value: unknown = JSON.parse(text);

    return value !== null && typeof value === "object" ? jsonFields(t, value) : [];
  } catch {
    return [];
  }
});
</script>
