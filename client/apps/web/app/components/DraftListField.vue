<template>
  <!-- A list of the draft process's questions, edited in place (docs/web.md, 「Agent management screen」, the settings
       dialog's draft block): an ordered pick from the catalogue, each question under the pack's word for it and one
       the console added under its own name. The questions chosen stand in order, each with a checkbox that switches
       it off or on where it stands, moved up or down or taken out; one not yet chosen is added before `final`, which
       stands last in every list that holds a question, is taken out only where it stands alone and carries no
       checkbox. The form that holds the field saves it. -->
  <div class="flex min-w-0 flex-col gap-2">
    <ol class="flex flex-col gap-1" :aria-label="props.label">
      <li v-for="(name, index) in list" :key="name" class="flex min-w-0 items-center gap-1" :data-draft-question="name">
        <span class="w-5 shrink-0 text-end text-sm text-dimmed tabular-nums">{{ index + 1 }}</span>
        <UCheckbox
          v-if="name !== FINAL_QUESTION"
          :model-value="!off.includes(name)"
          :disabled="props.disabled"
          :aria-label="$t('agents.aria.draft_question_on', { name: draftQuestionLabel($t, name) })"
          @update:model-value="(on: boolean | 'indeterminate') => (off = switchedQuestion(off, name, on === true))"
        />
        <span v-else class="size-4 shrink-0" aria-hidden="true" />
        <span class="min-w-0 flex-1 truncate text-sm" :class="off.includes(name) ? 'text-dimmed line-through' : 'text-highlighted'" :title="off.includes(name) ? $t('agents.label.draft_question_off') : undefined">
          {{ draftQuestionLabel($t, name) }}
        </span>
        <template v-if="name !== FINAL_QUESTION">
          <UButton icon="i-material-symbols-arrow-upward" color="neutral" variant="ghost" size="xs" :disabled="props.disabled || index === 0" :aria-label="$t('agents.aria.draft_move_up', { name: draftQuestionLabel($t, name) })" @click="list = movedQuestion(list, name, -1)" />
          <UButton icon="i-material-symbols-arrow-downward" color="neutral" variant="ghost" size="xs" :disabled="props.disabled || index >= asked - 1" :aria-label="$t('agents.aria.draft_move_down', { name: draftQuestionLabel($t, name) })" @click="list = movedQuestion(list, name, 1)" />
        </template>
        <UButton
          v-if="name !== FINAL_QUESTION || list.length === 1"
          icon="i-material-symbols-close"
          color="neutral"
          variant="ghost"
          size="xs"
          :disabled="props.disabled"
          :aria-label="$t('agents.aria.draft_remove_question', { name: draftQuestionLabel($t, name) })"
          @click="list = withoutQuestion(list, name)"
        />
      </li>
      <li v-if="list.length === 0" class="text-sm text-dimmed">{{ $t("agents.label.draft_no_questions") }}</li>
    </ol>

    <USelect
      :model-value="undefined"
      :items="addable"
      value-key="value"
      :placeholder="$t('agents.placeholder.draft_add_question')"
      :aria-label="$t('agents.aria.draft_add_to', { list: props.label })"
      :disabled="props.disabled || addable.length === 0"
      class="w-full sm:w-64"
      @update:model-value="(value: unknown) => typeof value === 'string' && (list = withQuestion(list, value))"
    />
  </div>
</template>

<script setup lang="ts">
import { FINAL_QUESTION } from "#shared/drafting";
import { movedQuestion, switchedQuestion, withoutQuestion, withQuestion } from "~/domain/draft-process";
import { draftQuestionLabel } from "~/domain/working";

interface Props {
  // Every name the supervisor's catalogue holds, in its order.
  catalogue: string[];
  label: string;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), { disabled: false });
const { t } = useI18n();

// The list, and the questions switched off, whichever of the process's lists holds them.
const list = defineModel<string[]>({ required: true });
const off = defineModel<string[]>("off", { required: true });

// How many questions stand before `final`, which the down arrow stops at.
const asked = computed(() => list.value.filter((name) => name !== FINAL_QUESTION).length);
const addable = computed(() =>
  props.catalogue
    .filter((name) => !list.value.includes(name) && (name !== FINAL_QUESTION || list.value.length === 0))
    .map((name) => ({ value: name, label: draftQuestionLabel(t, name) }))
);
</script>
