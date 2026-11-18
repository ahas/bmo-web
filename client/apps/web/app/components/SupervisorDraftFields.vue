<template>
  <!-- A supervisor's draft process as a block of its settings form (docs/web.md, 「Agent management screen」, the
       settings dialog's draft block; the receiver's `docs/drafting.md`): the questions every turn's round follows and
       the texts of the supervisor's catalogue. The block is the supervisor's own
       and sets nothing for another. Every change waits for the form's one save; what the receiver refuses stands
       under the block, every field kept as written. -->
  <section class="flex min-w-0 flex-col gap-4" data-supervisor-draft :aria-labelledby="titleId">
    <div class="flex min-h-8 items-center gap-2">
      <h3 :id="titleId" class="min-w-0 flex-1 text-sm font-medium text-highlighted" data-draft-title>{{ markedDefault($t, $t("agents.title.draft"), !own) }}</h3>
      <UButton v-if="own" :label="$t('agents.action.draft_to_default')" color="neutral" variant="ghost" size="xs" :disabled="busy" data-draft-to-default @click="form = draftToPolicy(form, props.view.policy)" />
    </div>
    <p class="text-sm text-muted">{{ $t("agents.label.draft_processes_help") }}</p>

    <UFormField v-for="field in LIST_FIELDS" :key="field" :label="$t(LIST_LABELS[field])" :name="`draft-${field}`" :error="listFault(field)">
      <DraftListField v-model="form[field]" v-model:off="form.off" :catalogue="listed" :label="$t(LIST_LABELS[field])" :disabled="busy" :data-draft-list="field" />
    </UFormField>

    <!-- The catalogue's texts: a line a question, opened in a box under it. -->
    <div class="flex min-w-0 flex-col">
      <div class="flex min-h-8 items-center gap-2">
        <h4 class="min-w-0 flex-1 text-sm font-medium text-highlighted">{{ $t("agents.label.draft_texts") }}</h4>
        <UButton icon="i-material-symbols-add" :label="$t('agents.placeholder.draft_add_question')" color="neutral" variant="ghost" size="xs" :disabled="busy" data-draft-add @click="startAdding" />
      </div>

      <ul class="flex flex-col divide-y divide-default" :aria-label="$t('agents.label.draft_texts')">
        <li v-for="question in form.questions" :key="question.name" class="flex min-w-0 flex-col" :data-draft-text="question.name">
          <div class="flex min-h-10 min-w-0 items-center gap-1">
            <button
              type="button"
              class="flex min-h-10 min-w-0 flex-1 items-center gap-3 rounded-md text-start transition-colors hover:bg-elevated active:bg-accented"
              :aria-expanded="opened === question.name"
              :aria-label="$t('agents.aria.draft_question_of', { name: draftQuestionLabel($t, question.name) })"
              @click="opened = opened === question.name ? null : question.name"
            >
              <span class="shrink-0 font-mono text-sm text-highlighted">{{ markedDefault($t, question.name, !draftTextSet(question)) }}</span>
              <span class="min-w-0 flex-1 truncate text-sm text-muted">{{ question.text }}</span>
              <UIcon :name="opened === question.name ? 'i-material-symbols-expand-less' : 'i-material-symbols-expand-more'" class="size-5 shrink-0 text-dimmed" />
            </button>
            <UTooltip v-if="draftTextSet(question)" :text="question.policyText === null ? $t('common.action.delete') : $t('agents.action.draft_text_to_default')">
              <UButton
                :icon="question.policyText === null ? 'i-material-symbols-delete-outline' : 'i-material-symbols-undo'"
                color="neutral"
                variant="ghost"
                size="xs"
                :disabled="busy"
                :aria-label="$t('agents.aria.draft_question_remove_of', { name: question.name })"
                @click="takeAway(question.name)"
              />
            </UTooltip>
          </div>
          <UFormField v-if="opened === question.name" class="pb-3" :name="`draft-text-${question.name}`" :error="questionTextFault($t, question.text) ?? undefined">
            <UTextarea v-model="question.text" class="w-full" :rows="4" autoresize :maxlength="QUESTION_TEXT_MAX" :disabled="busy" :aria-label="$t('agents.label.draft_question_text')" />
          </UFormField>
        </li>
      </ul>

      <!-- A question added under a new name: it joins the catalogue as the form stands, and the lists may name it. -->
      <form v-if="adding" class="flex min-w-0 flex-col gap-3 border-t border-default pt-3" novalidate :aria-label="$t('agents.title.draft_question_add')" data-draft-add-form @submit.prevent="add">
        <UFormField :label="$t('common.label.name')" name="draft-question-name" :error="(added.name !== '' && nameFault) || undefined">
          <UInput v-model="added.name" class="w-full font-mono sm:w-64" />
        </UFormField>
        <UFormField :label="$t('agents.label.draft_question_text')" name="draft-question-text">
          <UTextarea v-model="added.text" class="w-full" :rows="4" autoresize :maxlength="QUESTION_TEXT_MAX" />
        </UFormField>
        <div class="flex justify-end gap-2">
          <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" size="sm" @click="adding = false" />
          <UButton type="submit" :label="$t('common.action.add')" color="primary" variant="soft" size="sm" :disabled="nameFault !== null || questionTextFault($t, added.text) !== null" />
        </div>
      </form>
    </div>

    <p v-if="refusal !== ''" role="alert" class="break-words text-sm text-error">{{ refusal }}</p>
  </section>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { useFormPart, useOpenedWith } from "bmo-ui/app/domain/form-save";

import { SUPERVISOR_QUESTION } from "#shared/drafting";
import { markedDefault } from "~/domain/axes";
import {
  QUESTION_TEXT_MAX,
  draftChange,
  draftFormOf,
  draftListFault,
  draftOwn,
  draftTextSet,
  draftToPolicy,
  questionNameFault,
  questionTextFault,
  withoutDraftText
} from "~/domain/draft-process";
import { draftQuestionLabel } from "~/domain/working";

import type { SupervisorDraftView } from "#shared/drafting";
import type { DraftForm } from "~/domain/draft-process";

const props = defineProps<{ name: string; view: SupervisorDraftView }>();
const emit = defineEmits<{ saved: [view: SupervisorDraftView] }>();

const { t } = useI18n();
const titleId = useId();

// The one list the process holds, every turn's.
const LIST_FIELDS = ["rounds"] as const;
const LIST_LABELS: Record<(typeof LIST_FIELDS)[number], string> = { rounds: "agents.label.draft_rounds" };

const form = ref<DraftForm>(draftFormOf(props.view));
const changes = useOpenedWith(() => form.value);
const busy = ref(false);
const refusal = ref("");
const opened = ref<string | null>(null);

const own = computed(() => draftOwn(form.value, props.view.policy));
// The questions a list may name: the catalogue as the form stands, without the supervisor's own judgement, which is
// asked before any process.
const listed = computed(() => form.value.questions.map((one) => one.name).filter((name) => name !== SUPERVISOR_QUESTION));

function listFault(field: (typeof LIST_FIELDS)[number]): string | undefined {
  return draftListFault(t, form.value[field], listed.value) ?? undefined;
}

// Whether every field may be sent as it stands.
const sound = computed(() => LIST_FIELDS.every((field) => listFault(field) === undefined) && form.value.questions.every((one) => questionTextFault(t, one.text) === null));

function takeAway(name: string): void {
  form.value = withoutDraftText(form.value, name);
  if (opened.value === name && !form.value.questions.some((one) => one.name === name)) opened.value = null;
}

// A question added under a new name.
const adding = ref(false);
const added = reactive({ name: "", text: "" });
const nameFault = computed(() => questionNameFault(t, added.name, form.value.questions.map((one) => one.name)));

function startAdding(): void {
  Object.assign(added, { name: "", text: "" });
  adding.value = true;
}

function add(): void {
  if (nameFault.value !== null || questionTextFault(t, added.text) !== null) return;

  form.value = { ...form.value, questions: [...form.value.questions, { name: added.name, text: added.text, source: "set", policyText: null }] };
  adding.value = false;
}

async function save(): Promise<boolean> {
  if (!sound.value) {
    refusal.value = t("agents.error.draft_unsound");

    return false;
  }

  busy.value = true;
  refusal.value = "";

  try {
    const answered = await $fetch<SupervisorDraftView>(`/api/supervisors/${encodeURIComponent(props.name)}/draft`, { method: "PATCH", body: draftChange(props.view, form.value) });

    form.value = draftFormOf(answered);
    emit("saved", answered);

    return true;
  } catch (failure) {
    refusal.value = failureText(failure, t("common.error.save_failed"));

    return false;
  } finally {
    busy.value = false;
  }
}

useFormPart({
  dirty: changes,
  save,
  discard: () => {
    form.value = draftFormOf(props.view);
    refusal.value = "";
    opened.value = null;
    adding.value = false;
  }
});
</script>
