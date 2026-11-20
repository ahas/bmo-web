<template>
  <!-- One stage of a supervisor's catalogue in its draft block (docs/web.md, 「Agent management screen」, the settings
       dialog's draft block): its name, the default's mark after one whose text is the policy's, and its text on one
       line, pressed open into a box under it. A stage of the chain stands its place, a handle that carries it, a move
       up or down and a press that takes it out of the chain; one outside the chain stands a press that adds it at the
       chain's end. A stage the console added is deleted, and one whose text the console changed is put back to the
       policy's text, from under its box. The form that holds the row saves it. -->
  <li class="flex min-w-0 flex-col rounded-md" :data-stage="props.stage.name" :data-order-index="props.place ?? undefined">
    <div class="flex min-h-10 min-w-0 items-center gap-1">
      <template v-if="props.place !== null">
        <span
          v-if="!props.disabled"
          class="flex size-6 shrink-0 cursor-grab touch-none select-none items-center justify-center text-muted transition-colors hover:text-highlighted active:text-primary"
          role="img"
          :aria-label="$t('agents.aria.drag_reorder')"
          @pointerdown="emit('grab', $event)"
        >
          <UIcon name="i-material-symbols-drag-indicator" class="size-4" />
        </span>
        <span v-else class="size-6 shrink-0" aria-hidden="true" />
        <span class="w-5 shrink-0 text-end text-sm text-dimmed tabular-nums">{{ countText(props.place + 1) }}</span>
      </template>

      <button
        type="button"
        class="flex min-h-10 min-w-0 flex-1 items-center gap-3 rounded-md px-1 text-start transition-colors hover:bg-elevated active:bg-accented"
        :aria-expanded="props.opened"
        :aria-label="$t('agents.aria.stage_text_of', { name: props.stage.name })"
        @click="emit('toggle')"
      >
        <span class="min-w-0 truncate font-mono text-sm text-highlighted" data-stage-name>{{ markedDefault($t, props.stage.name, !stageTextSet(props.stage)) }}</span>
        <span class="min-w-0 flex-1 truncate text-sm text-muted">{{ props.stage.text }}</span>
        <UIcon :name="props.opened ? 'i-material-symbols-expand-less' : 'i-material-symbols-expand-more'" class="size-5 shrink-0 text-dimmed" />
      </button>

      <template v-if="props.place !== null">
        <UTooltip :text="$t('agents.aria.stage_up', { name: props.stage.name })">
          <UButton icon="i-material-symbols-arrow-upward" color="neutral" variant="ghost" size="xs" :disabled="props.disabled || props.first" :aria-label="$t('agents.aria.stage_up', { name: props.stage.name })" @click="emit('move', -1)" />
        </UTooltip>
        <UTooltip :text="$t('agents.aria.stage_down', { name: props.stage.name })">
          <UButton icon="i-material-symbols-arrow-downward" color="neutral" variant="ghost" size="xs" :disabled="props.disabled || props.last" :aria-label="$t('agents.aria.stage_down', { name: props.stage.name })" @click="emit('move', 1)" />
        </UTooltip>
        <UTooltip :text="$t('agents.aria.stage_out', { name: props.stage.name })">
          <UButton icon="i-material-symbols-close" color="neutral" variant="ghost" size="xs" :disabled="props.disabled" :aria-label="$t('agents.aria.stage_out', { name: props.stage.name })" @click="emit('out')" />
        </UTooltip>
      </template>
      <UTooltip v-else :text="$t('agents.aria.stage_in', { name: props.stage.name })">
        <UButton icon="i-material-symbols-add" color="neutral" variant="ghost" size="xs" :disabled="props.disabled" :aria-label="$t('agents.aria.stage_in', { name: props.stage.name })" @click="emit('in')" />
      </UTooltip>
    </div>

    <div v-if="props.opened" class="flex min-w-0 flex-col gap-2 pb-3">
      <UFormField :name="`stage-text-${props.stage.name}`" :error="stageTextFault($t, text) ?? undefined">
        <UTextarea v-model="text" class="w-full" :rows="4" autoresize :maxlength="STAGE_TEXT_MAX" :disabled="props.disabled" :aria-label="$t('agents.label.stage_text')" />
      </UFormField>
      <div v-if="stageTextSet(props.stage)" class="flex justify-end">
        <UButton
          v-if="props.stage.policyText === null"
          :label="$t('common.action.delete')"
          color="error"
          variant="ghost"
          size="sm"
          :disabled="props.disabled"
          data-stage-delete
          @click="emit('delete')"
        />
        <UButton v-else :label="$t('agents.action.stage_to_default')" color="neutral" variant="ghost" size="sm" :disabled="props.disabled" data-stage-to-default @click="emit('default')" />
      </div>
    </div>
  </li>
</template>

<script setup lang="ts">
import { markedDefault } from "~/domain/axes";
import { STAGE_TEXT_MAX, stageTextFault, stageTextSet } from "~/domain/instruction-stages";
import { countText } from "~/domain/numbers";

import type { InstructionStageView } from "#shared/instruction-stages";

interface Props {
  stage: InstructionStageView;
  // Its place in the chain from 0, or null for a stage outside it.
  place?: number | null;
  first?: boolean;
  last?: boolean;
  opened: boolean;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), { place: null, first: false, last: false, disabled: false });
const emit = defineEmits<{ toggle: []; grab: [press: PointerEvent]; move: [by: -1 | 1]; out: []; in: []; default: []; delete: [] }>();

// The stage's text as the form holds it.
const text = defineModel<string>("text", { required: true });
</script>
