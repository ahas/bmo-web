<template>
  <!-- One call as the terminal draws it (docs/web.md, 「A tool call」): its description on the top line, then one block
       in the look a diff is drawn in — the command under a prompt of oh-my-zsh's pure theme in the console's ANSI
       palette, never folded, and under it what came back: the change it made, never folded, or its result, whose
       lines past the first five fold. Nothing of the call stands as its raw JSON. -->
  <div class="flex min-w-0 flex-col gap-1" data-tool-call>
    <p class="flex min-w-0 items-start gap-2 text-sm">
      <UIcon :name="icon" class="mt-0.5 size-4 shrink-0 text-muted" />
      <span class="min-w-0 break-words text-highlighted">{{ top }}</span>
    </p>

    <div class="flex min-w-0 flex-col overflow-hidden rounded-md border border-default font-mono text-sm">
      <div class="flex min-w-0 flex-col px-2 py-1">
        <p class="flex min-w-0 flex-wrap gap-x-2">
          <span class="break-all text-(--ansi-gray)">{{ who }}</span>
          <span class="tabular-nums text-(--ansi-yellow)">{{ formatTime(props.row.line.at) }}</span>
          <span v-if="cwd !== null" class="break-all text-(--ansi-blue)">{{ cwd }}</span>
          <span v-if="props.branch !== null" class="text-(--ansi-gray)">{{ props.branch }}<span v-if="props.dirty" class="text-(--ansi-red)">*</span></span>
        </p>
        <p class="flex min-w-0 gap-2">
          <span class="shrink-0 text-(--ansi-blue)" aria-hidden="true">❯</span>
          <span class="min-w-0 grow break-words whitespace-pre-wrap text-highlighted" data-tool-command>{{ command }}</span>
        </p>
        <p v-if="props.row.line.truncated" class="font-sans text-sm text-dimmed">{{ $t("agents.label.record_ends") }}</p>
      </div>

      <template v-for="result in results" :key="result.line.id">
        <!-- A change stands as Claude Code draws it, every line, with its numbers and marks. -->
        <div v-if="result.changes !== null" class="flex min-w-0 flex-col gap-1 border-t border-default py-1" data-tool-change>
          <template v-for="(file, index) in result.changes.files" :key="index">
            <p class="px-2 break-all text-highlighted">{{ fileHead(file) }}</p>
            <AgentLogDiff :view="file" bare />
          </template>
          <p class="px-2 font-sans text-sm text-muted">{{ result.changes.summary }}</p>
          <p v-if="result.changes.more !== null" class="px-2 font-sans text-sm text-dimmed">{{ result.changes.more }}</p>
        </div>

        <AgentToolResult v-else-if="result.line.text.trim() !== ''" :text="result.line.text" :look="lookOf(result.line)" :truncated="result.line.truncated" />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { catalogueAgents } from "~/domain/agents";
import { GENERIC_TOOL_ICON } from "~/domain/log";
import { changesView } from "~/domain/patch";
import { callCommand, callTopLine, resultLook } from "~/domain/tool-view";
import { formatTime } from "bmo-ui/app/domain/time";

import type { AgentLogLine } from "#shared/types";
import type { LogRow } from "~/domain/log";
import type { ChangesView, DiffView } from "~/domain/patch";

interface Props {
  row: LogRow;
  // The checkout the agent works in, where the catalogue names one; its folder names the prompt's host.
  cwd?: string | null;
  // The checkout's branch and whether it is dirty, where a unit serves them.
  branch?: string | null;
  dirty?: boolean;
}

const props = withDefaults(defineProps<Props>(), { cwd: undefined, branch: null, dirty: false });
const { t } = useI18n();

const line = computed(() => props.row.line);
const cwd = computed<string | null>(() =>
  props.cwd !== undefined ? props.cwd : (catalogueAgents().find((agent) => agent.name === line.value.agent)?.cwd ?? null)
);

const top = computed(() => callTopLine(line.value.name, line.value.text) || (line.value.tool?.name ?? line.value.name ?? ""));
const command = computed(() => callCommand(line.value.name, line.value.text));
const icon = computed(() => line.value.tool?.icon ?? GENERIC_TOOL_ICON);

// Who ran it: the agent at the checkout's folder, as the pure prompt names a user at a host.
const who = computed(() => {
  const folder = cwd.value?.replace(/\/+$/, "").split("/").at(-1) ?? "";

  return folder === "" ? line.value.agent : `${line.value.agent}@${folder}`;
});

const results = computed<Array<{ line: AgentLogLine; changes: ChangesView | null }>>(() =>
  props.row.results.map((result) => ({ line: result, changes: changesView(t, result.patches, result.patchesMore, cwd.value) }))
);

function lookOf(result: AgentLogLine) {
  return resultLook(line.value.name, line.value.text, result.text);
}

// A file's head as the terminal writes it.
function fileHead(file: DiffView): string {
  return file.head;
}
</script>
