<template>
  <!-- One call as the terminal draws it (docs/web.md, 「A tool call」): its description on the top line, then one block
       in the look a diff is drawn in — the command under a prompt of oh-my-zsh's pure theme in the console's ANSI
       palette, never folded, and under it what came back: the change it made, never folded, or its result, whose
       lines past the first five fold. Nothing of the call stands as its raw JSON. -->
  <div class="flex min-w-0 flex-col gap-1" data-tool-call>
    <p class="flex min-w-0 items-start gap-2 text-sm">
      <!-- A call still running spins its mark until its result comes back. -->
      <UIcon
        :name="props.row.running ? 'i-material-symbols-progress-activity' : icon"
        class="mt-0.5 size-4 shrink-0"
        :class="props.row.running ? 'animate-spin text-primary motion-reduce:animate-none' : 'text-muted'"
        :aria-label="props.row.running ? $t('agents.status.call_running') : undefined"
        :role="props.row.running ? 'img' : undefined"
      />
      <span class="min-w-0 break-words text-highlighted">
        {{ top }}
        <!-- The files a shell command visibly writes, named after its description. -->
        <span v-if="written.length > 0" class="font-mono break-all text-muted" data-tool-writes>→ {{ written.join(", ") }}</span>
      </span>
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
          <!-- A shell command coloured as zsh colours a typed line; any other call's command plain. -->
          <span class="min-w-0 grow break-words whitespace-pre-wrap text-highlighted" data-tool-command
            ><template v-if="shell"><span v-for="(token, index) in tokens" :key="index" :class="SHELL_COLOURS[token.part]">{{ token.text }}</span></template
            ><template v-else>{{ command }}</template></span
          >
        </p>
        <p v-if="props.row.line.truncated" class="font-sans text-sm text-dimmed">{{ $t("agents.label.record_ends") }}</p>
      </div>

      <!-- The change an edit or a write made, read off its arguments: its head with how many lines went in and out,
           pressed to spread the lines and again to fold them. -->
      <div v-if="change !== null" class="flex min-w-0 flex-col border-t border-default" data-tool-change>
        <button
          type="button"
          class="flex min-w-0 items-center gap-2 px-2 py-1 text-start hover:bg-elevated active:bg-accented"
          :aria-expanded="changeOpen"
          data-tool-change-head
          @click="changeOpen = !changeOpen"
        >
          <UIcon name="i-material-symbols-chevron-right" aria-hidden="true" class="size-4 shrink-0 text-dimmed transition-transform" :class="changeOpen ? 'rotate-90' : ''" />
          <span class="min-w-0 break-all text-highlighted">{{ change.head }}</span>
          <span class="shrink-0 tabular-nums"><span class="text-success">+{{ countText(change.added) }}</span> <span class="text-error">-{{ countText(change.removed) }}</span></span>
        </button>
        <AgentLogDiff v-if="changeOpen" :view="change" bare class="pb-1" />
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

        <!-- A pane program's call says only how long it ran and how much came back, in words. -->
        <p v-else-if="result.settled !== null" class="flex min-w-0 flex-wrap items-center gap-x-2 border-t border-default px-2 py-1 font-sans text-sm text-muted tabular-nums" data-tool-settled>
          <span :class="result.settled.failed ? 'text-error' : 'text-success'">{{ result.settled.failed ? $t("agents.label.call_failed") : $t("agents.label.call_done") }}</span>
          <span>{{ secondsText($t, result.settled.ms) }}</span>
          <span v-if="result.settled.bytes !== null">{{ fileSizeText(result.settled.bytes) }}</span>
        </p>

        <AgentToolResult v-else-if="result.line.text.trim() !== ''" :text="result.line.text" :look="lookOf(result.line)" :truncated="result.line.truncated" />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { catalogueAgents } from "~/domain/agents";
import { callChange } from "~/domain/call-change";
import { GENERIC_TOOL_ICON } from "~/domain/log";
import { countText, secondsText } from "~/domain/numbers";
import { changesView, shownPath } from "~/domain/patch";
import { SHELL_COLOURS, shellTokens, writtenFiles } from "~/domain/shell-colour";
import { callArguments, callCommand, callTopLine, isShell, paneSettled, resultLook, toolName } from "~/domain/tool-view";
import { fileSizeText } from "~/domain/attachments";
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
  props.cwd !== undefined ? props.cwd : (catalogueAgents().find((agent) => agent.name === line.value.agent)?.path ?? null)
);

const top = computed(() => callTopLine(line.value.name, line.value.text) || (line.value.tool?.name ?? line.value.name ?? ""));
// An edit or a write is drawn as the change it made, so its command names the tool and the file alone.
const change = computed(() => callChange(t, line.value.name, line.value.text, cwd.value));
const changeOpen = ref(false);
const command = computed(() => {
  if (change.value === null) return callCommand(line.value.name, line.value.text);

  const fields = callArguments(line.value.text);
  const path = fields.get("file_path") ?? fields.get("path") ?? fields.get("filePath") ?? "";

  return `${toolName(line.value.name)} ${shownPath(path, cwd.value)}`;
});
const shell = computed(() => isShell(line.value.name));
const tokens = computed(() => (shell.value ? shellTokens(command.value) : []));
const written = computed(() => (shell.value ? writtenFiles(command.value).map((path) => shownPath(path, cwd.value)) : []));
const icon = computed(() => line.value.tool?.icon ?? GENERIC_TOOL_ICON);

// Who ran it: the agent at the checkout's folder, as the pure prompt names a user at a host.
const who = computed(() => {
  const folder = cwd.value?.replace(/\/+$/, "").split("/").at(-1) ?? "";

  return folder === "" ? line.value.agent : `${line.value.agent}@${folder}`;
});

const results = computed<Array<{ line: AgentLogLine; changes: ChangesView | null; settled: ReturnType<typeof paneSettled> }>>(() =>
  props.row.results.map((result) => ({ line: result, changes: changesView(t, result.patches, result.patchesMore, cwd.value), settled: paneSettled(result.text) }))
);

function lookOf(result: AgentLogLine) {
  return resultLook(line.value.name, line.value.text, result.text);
}

// A file's head as the terminal writes it.
function fileHead(file: DiffView): string {
  return file.head;
}
</script>
