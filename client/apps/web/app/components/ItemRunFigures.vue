<template>
  <!-- How far the item's running job has come, read again every few seconds while it runs (docs/web.md, the TODO
       modal's state tab): its time, its tool calls and the tokens it wrote, as the job's own figures count them. -->
  <ItemJobFigures v-if="run !== null" :key="`${run.agent}:${run.unit}`" :agent="run.agent" :run="run.unit" />
</template>

<script setup lang="ts">
import { usePolling } from "~/domain/polling";

import type { StatusView } from "#shared/types";

interface Props {
  todoId: number;
  running: boolean;
}

const props = defineProps<Props>();

// The run working on the item, as the live picture of runs names it; none while nothing runs.
const run = ref<{ agent: string; unit: string } | null>(null);
const LOOK_MS = 3000;

async function look(): Promise<void> {
  if (!props.running) {
    run.value = null;

    return;
  }

  try {
    const { live } = await $fetch<StatusView>("/api/status");
    const found = live.find((one) => one.kind === "worker" && one.todoId === props.todoId);

    run.value = found === undefined ? null : { agent: found.agent, unit: found.unit ?? String(found.id) };
  } catch {
    return;
  }
}

onMounted(() => void look());
watch(() => [props.todoId, props.running], () => void look());
usePolling(() => void look(), LOOK_MS);
</script>
