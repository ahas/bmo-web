<template>
  <!-- Work that goes in steps, one under the other on a rail: a work order's stages, an agent's runs.
       Each step's head says its state, its name and its time, and pressing it unfolds what the place
       puts in its body. The marks and the folding are this component's; the words are the place's. -->
  <ol class="flex flex-col" :aria-label="props.label">
    <li v-for="(step, index) in props.steps" :key="step.key" class="flex min-w-0 gap-2" :data-step="step.state">
      <!-- The rail: the step's mark, and the line down to the next step. -->
      <div class="flex shrink-0 flex-col items-center">
        <span class="flex size-8 shrink-0 items-center justify-center">
          <UIcon
            :name="stepLook(step.state).icon"
            class="size-5 shrink-0"
            :class="[stepLook(step.state).tone, stepLook(step.state).spins ? 'animate-spin motion-reduce:animate-none' : '']"
          />
        </span>
        <span v-if="index < props.steps.length - 1" class="w-px grow bg-accented" aria-hidden="true" />
      </div>

      <UCollapsible
        :open="folds.isOpen(step)"
        class="flex min-w-0 flex-1 flex-col gap-2"
        :class="index < props.steps.length - 1 ? 'pb-3' : ''"
        @update:open="folds.set(step.key, $event)"
      >
        <button
          type="button"
          class="flex min-h-8 w-full min-w-0 flex-col justify-center gap-1 rounded-md px-2 py-1 text-start text-sm transition-colors hover:bg-elevated active:bg-accented"
          :aria-label="`${step.stateLabel} · ${step.title} ${folds.isOpen(step) ? $t('common.action.collapse') : $t('common.action.expand')}`"
        >
          <span class="flex w-full min-w-0 items-center gap-2">
            <span class="flex min-w-0 flex-1 items-center gap-2">
              <slot name="title" :step="step">
                <span class="min-w-0 flex-1 truncate font-medium text-highlighted">{{ step.title }}</span>
              </slot>
            </span>
            <span v-if="$slots.time || step.time !== ''" class="shrink-0 tabular-nums text-muted">
              <slot name="time" :step="step">{{ step.time }}</slot>
            </span>
            <UIcon
              name="i-material-symbols-expand-more"
              class="size-5 shrink-0 text-dimmed transition-transform"
              :class="folds.isOpen(step) ? 'rotate-180' : ''"
            />
          </span>
          <span v-if="$slots.detail" class="flex w-full min-w-0 items-center gap-3 pe-7 text-muted">
            <slot name="detail" :step="step" />
          </span>
        </button>

        <template #content>
          <div class="min-w-0 px-2 pb-1">
            <slot name="body" :step="step" />
          </div>
        </template>
      </UCollapsible>
    </li>
  </ol>
</template>

<script setup lang="ts" generic="T extends StepperStep">
// The one vertical stepper the console reads work progress on (docs/web.md, 「The progress stepper」).
// A step is folded or open the first time it is seen, by what its place said of it then; after that
// only a press changes it, so nothing folds under a reader's eyes.

import { stepFolds, stepLook } from "~/domain/stepper";

import type { StepperStep } from "~/domain/stepper";

// A place hands its steps with whatever more it reads them by — a work order's step, a run's lines —
// and gets each back whole in the slots.
interface Props {
  steps: readonly T[];
  // What the list is, read out to a reader who cannot see it.
  label: string;
}

const props = defineProps<Props>();

defineSlots<{
  title?: (scope: { step: T }) => unknown;
  time?: (scope: { step: T }) => unknown;
  detail?: (scope: { step: T }) => unknown;
  body?: (scope: { step: T }) => unknown;
}>();

const held = ref<Record<string, boolean>>({});
const folds = stepFolds(held);

watch(
  () => props.steps,
  (steps) => folds.see(steps),
  { immediate: true }
);
</script>
