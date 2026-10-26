<template>
  <!-- A builder turn's JSON answer laid out to read: a plan as its steps and their tasks, a list of
       things to build as its tasks, anything else as its fields. The text itself opens below. -->
  <div class="flex min-w-0 flex-col gap-4">
    <template v-if="props.read.kind === 'plan'">
      <section v-for="(stage, at) in props.read.stages" :key="at" class="flex min-w-0 flex-col gap-2">
        <p class="text-sm font-medium text-highlighted">{{ $t("todo.label.builder_stage", { n: (at + 1).toLocaleString(), title: stage.title }) }}</p>
        <ReadTask v-for="(task, index) in stage.tasks" :key="index" :task="task" />
      </section>
    </template>

    <section v-else-if="props.read.kind === 'tasks'" class="flex min-w-0 flex-col gap-2">
      <ReadTask v-for="(task, index) in props.read.tasks" :key="index" :task="task" :place="`${(index + 1).toLocaleString()}.`" />
    </section>

    <dl v-else class="flex min-w-0 flex-col gap-2 text-sm">
      <div v-for="(field, index) in props.read.fields" :key="index" class="flex min-w-0 flex-col gap-1" :style="{ paddingInlineStart: `${field.depth * 16}px` }">
        <dt class="font-medium text-muted">{{ field.label }}</dt>
        <dd v-if="field.value !== ''" class="whitespace-pre-wrap break-words">{{ field.value }}</dd>
      </div>
    </dl>

    <!-- The text as the builder wrote it stands whole under its name, never folded (docs/web.md, the co-work step
         dialog). -->
    <section class="flex min-w-0 flex-col gap-1">
      <p class="text-sm font-medium text-muted">{{ $t("common.label.original") }}</p>
      <pre class="overflow-x-auto rounded-md bg-elevated p-3 font-mono text-sm whitespace-pre">{{ pretty }}</pre>
    </section>
  </div>
</template>

<script setup lang="ts">
import { h } from "vue";

import MarkdownText from "./MarkdownText.vue";

import type { ReadBuilderResult, ReadPlanTask } from "~/domain/workorder";

interface Props {
  read: ReadBuilderResult;
  text: string;
}

const props = defineProps<Props>();

const pretty = computed(() => {
  const trimmed = props.text.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");

  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return props.text;
  }
});

// One task: its place, title, role and model on a line, and its instruction under it.
const ReadTask = (task: { task: ReadPlanTask; place?: string }) =>
  h("div", { class: "flex min-w-0 flex-col gap-1 rounded-md border border-default p-3" }, [
    h("p", { class: "flex min-w-0 flex-wrap items-center gap-2 text-sm" }, [
      task.place ? h("span", { class: "text-muted tabular-nums" }, task.place) : null,
      task.task.title ? h("span", { class: "font-medium text-highlighted" }, task.task.title) : null,
      task.task.role ? h("span", { class: "rounded-sm bg-elevated px-1.5 text-muted" }, task.task.role) : null,
      task.task.model ? h("span", { class: "text-muted" }, task.task.model) : null
    ]),
    h(MarkdownText, { text: task.task.instruction, class: "text-sm" })
  ]);
</script>
