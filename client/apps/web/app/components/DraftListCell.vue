<template>
  <!-- A cell holding a list of the draft process's questions: its dropdown is an ordered pick from the catalogue,
       each question under the pack's word for it and one the console added under its own name. The questions chosen
       stand in order, each with a checkbox that switches it off or on where it stands, moved up or down or taken
       out; one not yet chosen is added before `final`, which stands last in every list that holds a question, is
       taken out only where it stands alone and carries no checkbox. The save button sends the list and what is
       switched off; a refusal keeps the dropdown open with the reason under it. -->
  <SettingsPopoverCell v-model:open="open" :label="props.label" :disabled="props.disabled" :busy="saving">
    <slot />

    <template #content>
      <form class="flex min-w-0 flex-col gap-3" novalidate @submit.prevent="submit">
        <UFormField :label="props.label" :name="props.label" :error="shownFault" :ui="CELL_FIELD_UI">
          <ol class="flex flex-col gap-1" :aria-label="props.label">
            <li v-for="(name, index) in list" :key="name" class="flex min-w-0 items-center gap-1">
              <span class="w-5 shrink-0 text-end text-sm text-dimmed tabular-nums">{{ index + 1 }}</span>
              <UCheckbox
                v-if="name !== FINAL_QUESTION"
                :model-value="!offs.includes(name)"
                :disabled="saving"
                :aria-label="$t('agents.aria.draft_question_on', { name: draftQuestionLabel($t, name) })"
                @update:model-value="(on: boolean | 'indeterminate') => (offs = switchedQuestion(offs, name, on === true))"
              />
              <span class="min-w-0 flex-1 truncate text-sm" :class="offs.includes(name) ? 'text-dimmed line-through' : 'text-highlighted'">{{ draftQuestionLabel($t, name) }}</span>
              <template v-if="name !== FINAL_QUESTION">
                <UButton icon="i-material-symbols-arrow-upward" color="neutral" variant="ghost" size="xs" :disabled="saving || index === 0" :aria-label="$t('agents.aria.draft_move_up', { name: draftQuestionLabel($t, name) })" @click="list = movedQuestion(list, name, -1)" />
                <UButton icon="i-material-symbols-arrow-downward" color="neutral" variant="ghost" size="xs" :disabled="saving || index >= asked - 1" :aria-label="$t('agents.aria.draft_move_down', { name: draftQuestionLabel($t, name) })" @click="list = movedQuestion(list, name, 1)" />
              </template>
              <UButton
                v-if="name !== FINAL_QUESTION || list.length === 1"
                icon="i-material-symbols-close"
                color="neutral"
                variant="ghost"
                size="xs"
                :disabled="saving"
                :aria-label="$t('agents.aria.draft_remove_question', { name: draftQuestionLabel($t, name) })"
                @click="list = withoutQuestion(list, name)"
              />
            </li>
            <li v-if="list.length === 0" class="text-sm text-dimmed">{{ $t("agents.label.draft_no_questions") }}</li>
          </ol>
        </UFormField>

        <div class="flex min-w-0 items-center gap-2">
          <USelect
            :model-value="undefined"
            :items="addable"
            value-key="value"
            :placeholder="$t('agents.placeholder.draft_add_question')"
            :aria-label="$t('agents.placeholder.draft_add_question')"
            :disabled="saving || addable.length === 0"
            class="min-w-0 flex-1"
            @update:model-value="(value: unknown) => typeof value === 'string' && (list = withQuestion(list, value))"
          />
          <UButton type="submit" :label="$t('common.action.save')" color="primary" variant="soft" :loading="saving" :disabled="!changed || fault !== null" />
        </div>
      </form>
    </template>
  </SettingsPopoverCell>
</template>

<script setup lang="ts">
import { FINAL_QUESTION } from "#shared/drafting";
import { draftListFault, movedQuestion, switchedQuestion, withoutQuestion, withQuestion } from "~/domain/draft-process";
import { CELL_FIELD_UI } from "~/domain/settings-cells";
import { draftQuestionLabel } from "~/domain/working";

interface Props {
  value: string[];
  // The questions the row has switched off, whichever of its lists holds them.
  off: string[];
  // Every name the catalogue holds, in its order.
  catalogue: string[];
  label: string;
  // Whether the cell stands closed to change, for a reader whose section is read alone.
  disabled?: boolean;
  // Saves the list and what is switched off; the receiver's refusal in the pack's words, or null once it took it.
  save: (list: string[], off: string[]) => Promise<string | null>;
}

const props = defineProps<Props>();
const { t } = useI18n();

const open = ref(false);
const list = ref<string[]>([]);
const offs = ref<string[]>([]);
const refused = ref("");
const saving = ref(false);

// How many questions stand before `final`, which the down arrow stops at.
const asked = computed(() => list.value.filter((name) => name !== FINAL_QUESTION).length);
const addable = computed(() =>
  props.catalogue
    .filter((name) => !list.value.includes(name) && (name !== FINAL_QUESTION || list.value.length === 0))
    .map((name) => ({ value: name, label: draftQuestionLabel(t, name) }))
);
const changed = computed(() => list.value.join("\n") !== props.value.join("\n") || [...offs.value].sort().join("\n") !== [...props.off].sort().join("\n"));
const fault = computed(() => draftListFault(t, list.value, props.catalogue));
const shownFault = computed(() => (fault.value ?? refused.value) || undefined);

// Every opening starts from what the receiver holds now.
watch(open, (now) => {
  if (!now) return;
  list.value = [...props.value];
  offs.value = [...props.off];
  refused.value = "";
});

watch([list, offs], () => {
  refused.value = "";
});

async function submit(): Promise<void> {
  if (!changed.value || fault.value !== null || saving.value) return;

  saving.value = true;

  try {
    const answer = await props.save([...list.value], [...offs.value]);

    if (answer === null) {
      open.value = false;
    } else {
      refused.value = answer;
    }
  } finally {
    saving.value = false;
  }
}
</script>
