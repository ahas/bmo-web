<template>
  <!-- Work that goes forward in stages, on Nuxt UI's stepper standing upright (docs/web.md, 「The progress stepper」):
       each stage's dot, title, how many times its review sent it back, owner, model and time, and under a stage of
       several tasks its sub-stages. No stage
       folds and none has a body; pressing a stage or a sub-stage opens it in the work view. -->
  <UStepper
    :items="items"
    orientation="vertical"
    :linear="false"
    :model-value="-1"
    color="neutral"
    :aria-label="props.label"
    :ui="STEPPER_UI"
    data-stage-stepper
    @update:model-value="pressed"
  >
    <template #indicator="{ item }">
      <UIcon
        :name="stepLook(stageOf(item).state).icon"
        class="size-5 shrink-0"
        :class="[stepLook(stageOf(item).state).tone, stepLook(stageOf(item).state).spins ? 'animate-spin motion-reduce:animate-none' : '']"
        :aria-label="stageOf(item).stateLabel"
      />
    </template>

    <template #title="{ item }">
      <button
        type="button"
        class="flex min-h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 py-1 text-start text-sm transition-colors hover:bg-elevated active:bg-accented"
        :data-stage="stageOf(item).state"
        :aria-label="`${stageOf(item).stateLabel} · ${stageOf(item).title}`"
        @click="emit('open', stageOf(item).key)"
      >
        <span class="min-w-0 flex-1 truncate font-medium text-highlighted" :class="{ 'text-muted': stageOf(item).state === 'skipped' }">{{ stageOf(item).title }}</span>
        <!-- How many times its review sent it back (docs/web.md, the TODO modal's work order steps). -->
        <UBadge v-if="stageOf(item).rejections > 0" color="warning" variant="subtle" size="sm" class="shrink-0" :label="$t('todo.label.step_rejections', { n: stageOf(item).rejections })" data-stage-rejections />
        <span v-if="stageOf(item).seconds !== null" class="shrink-0 tabular-nums text-muted">{{ spanClock($t, stageOf(item).seconds!) }}</span>
      </button>
    </template>

    <template #description="{ item }">
      <div class="flex min-w-0 flex-col gap-1 ps-2">
        <p v-if="detail(stageOf(item)) !== ''" class="min-w-0 truncate text-sm text-muted">{{ detail(stageOf(item)) }}</p>

        <ul v-if="stageOf(item).subs.length > 0" class="flex min-w-0 flex-col gap-1">
          <li v-for="sub in stageOf(item).subs" :key="sub.key">
            <button
              type="button"
              class="flex w-full min-w-0 flex-col gap-0.5 rounded-md bg-elevated/60 px-2 py-1 text-start text-sm transition-colors hover:bg-elevated active:bg-accented"
              :data-substage="sub.state"
              :aria-label="`${sub.stateLabel} · ${sub.title}`"
              @click="emit('open', sub.key)"
            >
              <span class="flex w-full min-w-0 items-center gap-2">
                <UIcon
                  :name="stepLook(sub.state).icon"
                  class="size-4 shrink-0"
                  :class="[stepLook(sub.state).tone, stepLook(sub.state).spins ? 'animate-spin motion-reduce:animate-none' : '']"
                />
                <span class="min-w-0 flex-1 truncate text-highlighted" :class="{ 'text-muted': sub.state === 'skipped' }">{{ sub.title }}</span>
                <span v-if="sub.seconds !== null" class="shrink-0 tabular-nums text-muted">{{ spanClock($t, sub.seconds) }}</span>
              </span>
              <span v-if="detail(sub) !== ''" class="min-w-0 truncate ps-6 text-muted">{{ detail(sub) }}</span>
            </button>
          </li>
        </ul>
      </div>
    </template>
  </UStepper>
</template>

<script setup lang="ts">
import { stepLook } from "~/domain/stepper";
import { spanClock } from "bmo-ui/app/domain/time";

import type { Stage } from "~/domain/stepper";

interface Props {
  stages: readonly Stage[];
  // What the list is, read out to a reader who cannot see it.
  label: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{ open: [key: string] }>();

// The stepper's own rail and dots give way to the stage's state: the trigger is the dot alone, on no fill of its own,
// and the words stand at the size the screen reads them at.
const STEPPER_UI = {
  root: "w-full min-w-0",
  header: "w-full min-w-0 gap-2",
  item: "min-w-0 gap-2",
  trigger: "size-8 shrink-0 rounded-full bg-transparent text-muted group-data-[state=completed]:text-muted group-data-[state=active]:text-muted",
  title: "w-full min-w-0 text-sm font-normal",
  description: "w-full min-w-0 text-sm",
  wrapper: "mt-0 min-w-0 flex-1 pb-2",
  separator: "bg-accented"
};

const items = computed(() => props.stages.map((stage) => ({ value: stage.key, title: stage.title })));

function stageOf(item: { value?: string | number }): Stage {
  return props.stages.find((stage) => stage.key === item.value) ?? props.stages[0]!;
}

// The line under a stage's title: its owner and the model it ran on.
function detail(stage: Stage): string {
  return [stage.owner, stage.model].filter((part) => part.trim() !== "").join(" · ");
}

// A press on a stage's dot moves the stepper's own place; it opens that stage instead, and the stepper keeps none.
function pressed(index: string | number | undefined): void {
  const stage = typeof index === "number" ? props.stages[index] : props.stages.find((one) => one.key === index);

  if (stage !== undefined) emit("open", stage.key);
}
</script>
