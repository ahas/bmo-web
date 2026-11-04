<template>
  <!-- What a round's answer is asked before it goes out, as the receiver's draft process table holds it: a row per
       key of a provider, a tier and an agent, each a name or any, and under it the questions the rows name. Every
       cell sets its one value with the row's others as they stand (docs/web.md, 「Agent management screen」, the
       supervisors tab's draft process). A row or a question the receiver's policy holds unchanged carries the default
       mark after its key or its name. -->
  <section class="flex min-w-0 flex-col" aria-labelledby="draft-processes-title">
    <div class="flex min-h-12 items-center gap-2 border-y border-default px-4 py-2">
      <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <h2 id="draft-processes-title" class="text-base font-semibold text-highlighted">{{ $t("agents.title.draft_processes") }}</h2>
        <p class="text-sm text-muted">{{ $t("agents.label.draft_processes_help") }}</p>
      </div>

      <!-- A row of a key that stands nowhere yet, which starts from the row that key matches now. -->
      <UPopover v-if="data && !props.readonly" v-model:open="adding" :content="{ align: 'end', side: 'bottom' }">
        <UButton icon="i-material-symbols-add" color="neutral" variant="ghost" :label="$t('common.action.add')" :aria-label="$t('agents.title.draft_process_add')" />

        <template #content>
          <form class="flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-3 p-4" novalidate :aria-label="$t('agents.title.draft_process_add')" @submit.prevent="addRow">
            <UFormField :label="$t('agents.label.column_provider')" name="draft-provider">
              <USelect v-model="newKey.provider" :items="providerChoices" value-key="value" class="w-full" />
            </UFormField>
            <UFormField :label="$t('agents.label.tier')" name="draft-tier">
              <USelect v-model="newKey.tier" :items="tierChoices" value-key="value" class="w-full" />
            </UFormField>
            <UFormField :label="$t('agents.label.draft_agent')" name="draft-agent" :error="addFault || undefined">
              <USelect v-model="newKey.agentName" :items="agentChoices" value-key="value" class="w-full" />
            </UFormField>
            <div class="flex justify-end gap-2">
              <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="addSaving" @click="adding = false" />
              <UButton type="submit" :label="$t('common.action.add')" color="primary" :loading="addSaving" :disabled="keyTaken" />
            </div>
          </form>
        </template>
      </UPopover>
    </div>

    <DataTableSkeleton v-if="!data && !error" :headers="tableHeaders(columns)" :rows="2" :label="$t('agents.status.draft_processes_loading')" />
    <ReadFailure
      v-else-if="error && !data"
      class="mx-4 my-4 w-auto"
      :failure="readFailure"
      :message="failureText(error, $t('agents.error.draft_processes_read_failed'))"
      :reading="status === 'pending'"
      @retry="refresh()"
    />

    <!-- Each table stands in the supervisors tab's scrolling body, scrolling sideways in its own box, its head held at
         the body's top. -->
    <SettingsTable v-if="data" data-draft-processes :data="data.rows" :columns="columns">
      <template #provider-cell="{ row }">
        <span :id="settingsAnchor(`draft-${draftKeyId(row.original)}`)" :class="CELL_TEXT" class="ps-4 text-highlighted">
          <SearchText :text="draftProviderText($t, row.original.provider)" :query="props.query" />
        </span>
      </template>
      <template #tier-cell="{ row }">
        <span :class="CELL_TEXT" class="text-highlighted"><SearchText :text="draftKeyText($t, row.original.tier)" :query="props.query" /></span>
      </template>
      <template #agentName-cell="{ row }">
        <span :class="CELL_TEXT" class="whitespace-nowrap text-highlighted"><SearchText :text="markedDefault($t, draftKeyText($t, row.original.agentName), row.original.source === 'default')" :query="props.query" /></span>
      </template>

      <template v-for="field in LIST_FIELDS" :key="field" #[`${field}-cell`]="{ row }">
        <DraftListCell
          :value="row.original[field]"
          :catalogue="catalogue"
          :label="$t(LIST_LABELS[field], { key: keyText(row.original) })"
          :disabled="props.readonly"
          :save="(list: string[]) => save(row.original, { [field]: list })"
        >
          <span class="max-w-full truncate font-mono text-sm text-highlighted">{{ draftListText($t, row.original[field]) }}</span>
        </DraftListCell>
      </template>

      <template #lightChars-cell="{ row }">
        <SettingsInputCell
          :value="row.original.lightChars"
          :label="$t('agents.aria.draft_light_chars_of', { key: keyText(row.original) })"
          :disabled="props.readonly"
          :min="LIGHT_CHARS_MIN"
          :max="LIGHT_CHARS_MAX"
          :step="1"
          :check="(text: string) => draftNumberFault($t, text, LIGHT_CHARS_MIN, LIGHT_CHARS_MAX)"
          :save="(text: string) => save(row.original, { lightChars: Number(text) })"
        >
          <span class="tabular-nums text-highlighted">{{ $t("agents.label.draft_chars", { n: countText(row.original.lightChars) }) }}</span>
        </SettingsInputCell>
      </template>

      <template #ceilingSeconds-cell="{ row }">
        <SettingsInputCell
          :value="row.original.ceilingSeconds"
          :label="$t('agents.aria.draft_ceiling_of', { key: keyText(row.original) })"
          :disabled="props.readonly"
          :min="CEILING_SECONDS_MIN"
          :max="CEILING_SECONDS_MAX"
          :step="1"
          :check="(text: string) => draftNumberFault($t, text, CEILING_SECONDS_MIN, CEILING_SECONDS_MAX)"
          :save="(text: string) => save(row.original, { ceilingSeconds: Number(text) })"
        >
          <span class="tabular-nums text-highlighted">{{ $t("common.label.seconds", { n: countText(row.original.ceilingSeconds) }) }}</span>
        </SettingsInputCell>
      </template>

      <template #pastCeiling-cell="{ row }">
        <SettingsChoiceCell
          :value="row.original.pastCeiling"
          :items="pastChoices"
          :label="$t('agents.aria.draft_past_of', { key: keyText(row.original) })"
          :disabled="props.readonly"
          :save="(value: string | number) => saveChoice(row.original, String(value))"
        >
          <span class="text-highlighted">{{ pastCeilingText($t, row.original.pastCeiling) }}</span>
        </SettingsChoiceCell>
      </template>

      <template #remove-cell="{ row }">
        <span class="flex h-full min-h-12 items-center justify-end pe-2">
          <UTooltip v-if="row.original.source === 'set' && !props.readonly" :text="$t('common.action.delete')">
            <UButton icon="i-material-symbols-delete-outline" color="neutral" variant="ghost" :aria-label="$t('agents.aria.draft_remove_of', { key: keyText(row.original) })" @click="remove(row.original)" />
          </UTooltip>
        </span>
      </template>
    </SettingsTable>

    <p v-if="actionFailed !== ''" role="alert" class="px-4 py-2 text-sm text-error">{{ actionFailed }}</p>

    <!-- The questions the rows name: each one's text, in the language it was written in, and a new one added. -->
    <div class="mt-6 flex min-h-12 items-center gap-2 border-y border-default px-4 py-2">
      <h2 id="draft-questions-title" class="min-w-0 flex-1 text-base font-semibold text-highlighted">{{ $t("agents.title.draft_questions") }}</h2>

      <UPopover v-if="data && !props.readonly" v-model:open="addingQuestion" :content="{ align: 'end', side: 'bottom' }">
        <UButton icon="i-material-symbols-add" color="neutral" variant="ghost" :label="$t('common.action.add')" :aria-label="$t('agents.title.draft_question_add')" />

        <template #content>
          <form class="flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-3 p-4" novalidate :aria-label="$t('agents.title.draft_question_add')" @submit.prevent="addQuestion">
            <UFormField :label="$t('common.label.name')" name="draft-question-name" :error="(newQuestion.name !== '' && questionNameFault($t, newQuestion.name, catalogue)) || undefined">
              <UInput v-model="newQuestion.name" class="w-full font-mono" />
            </UFormField>
            <UFormField :label="$t('agents.label.draft_question_text')" name="draft-question-text" :error="questionRefused || undefined">
              <UTextarea v-model="newQuestion.text" class="w-full" :rows="4" autoresize :maxlength="QUESTION_TEXT_MAX" />
            </UFormField>
            <div class="flex justify-end gap-2">
              <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="questionSaving" @click="addingQuestion = false" />
              <UButton
                type="submit"
                :label="$t('common.action.add')"
                color="primary"
                :loading="questionSaving"
                :disabled="questionNameFault($t, newQuestion.name, catalogue) !== null || questionTextFault($t, newQuestion.text) !== null"
              />
            </div>
          </form>
        </template>
      </UPopover>
    </div>

    <SettingsTable v-if="data" data-draft-questions :data="data.questions" :columns="questionColumns" aria-labelledby="draft-questions-title">
      <template #name-cell="{ row }">
        <span :id="settingsAnchor(`draft-question-${row.original.name}`)" :class="CELL_TEXT" class="ps-4 font-mono text-highlighted">
          <SearchText :text="markedDefault($t, row.original.name, row.original.source === 'default')" :query="props.query" />
        </span>
      </template>
      <template #text-cell="{ row }">
        <SettingsPopoverCell v-model:open="editing[row.original.name]" :label="$t('agents.aria.draft_question_of', { name: row.original.name })" :disabled="props.readonly" :busy="questionSaving && editingName === row.original.name">
          <span class="max-w-full truncate text-sm text-highlighted"><SearchText :text="row.original.text" :query="props.query" /></span>

          <template #content>
            <form class="flex min-w-0 flex-col gap-3" novalidate @submit.prevent="saveQuestion(row.original.name)">
              <UFormField :label="row.original.name" :name="`draft-question-${row.original.name}`" :error="(questionTextFault($t, editedText) ?? questionRefused) || undefined" :ui="CELL_FIELD_UI">
                <UTextarea v-model="editedText" class="w-lg max-w-full" :rows="4" autoresize :maxlength="QUESTION_TEXT_MAX" autofocus />
              </UFormField>
              <div class="flex justify-end">
                <UButton type="submit" :label="$t('common.action.save')" color="primary" variant="soft" :loading="questionSaving" :disabled="editedText === row.original.text || questionTextFault($t, editedText) !== null" />
              </div>
            </form>
          </template>
        </SettingsPopoverCell>
      </template>
    </SettingsTable>
  </section>
</template>

<script setup lang="ts">
import { tableHeaders } from "bmo-ui/app/domain/column-widths";
import { failureText } from "bmo-ui/app/domain/errors";
import { useConfirm } from "~/domain/confirm";
import { ANY_KEY } from "#shared/drafting";
import { settingsAnchor } from "~/domain/agent-settings";
import { markedDefault, useProviders } from "~/domain/axes";
import { CELL_FIELD_UI, CELL_TEXT } from "~/domain/settings-cells";
import {
  CEILING_SECONDS_MAX,
  CEILING_SECONDS_MIN,
  LIGHT_CHARS_MAX,
  LIGHT_CHARS_MIN,
  PAST_CEILINGS,
  QUESTION_TEXT_MAX,
  draftKeyId,
  draftKeyLabel,
  draftKeyText,
  draftListText,
  draftNumberFault,
  draftProviderText,
  draftRowFor,
  draftValues,
  pastCeilingText,
  questionNameFault,
  questionTextFault,
  sameDraftKey
} from "~/domain/draft-process";
import { useReadFailure } from "~/domain/events";
import { countText } from "~/domain/numbers";

import type { DraftKey, DraftProcessesView, DraftProcessValues, DraftProcessView, DraftQuestionView, PastCeiling } from "#shared/drafting";
import type { SupervisorView } from "#shared/axes";
import type { CellChoice } from "~/domain/settings-cells";
import type { SettingsColumn } from "~/domain/settings-columns";

const props = withDefaults(defineProps<{ query?: string; readonly?: boolean }>(), { query: "", readonly: false });
const { t } = useI18n();
const askFirst = useConfirm();

// The two lists a row holds, each a cell of the same kind named by its own words.
const LIST_FIELDS = ["rounds", "light"] as const;
const LIST_LABELS: Record<(typeof LIST_FIELDS)[number], string> = { rounds: "agents.aria.draft_rounds_of", light: "agents.aria.draft_light_of" };

// The read is the browser's alone, as the fold-ratio grid's is; the page's search reads the same answer under the
// same key.
const { data, error, refresh, status } = useFetch<DraftProcessesView>("/api/draft-processes", { key: "draft-processes", server: false, lazy: true });
const readFailure = useReadFailure({ failed: () => !!error.value && !data.value, reading: () => status.value === "pending", reread: () => void refresh() });
// The providers the agency carries and its supervisors, offered for a new key beside the tiers the receiver's rows key
// by.
const { data: providers } = useProviders();
const { data: supervisors } = useFetch<SupervisorView[]>("/api/supervisors", { key: "supervisors", lazy: true, server: false });

const catalogue = computed<string[]>(() => (data.value?.questions ?? []).map((question) => question.name));
const actionFailed = ref("");

// The key is the row's title, and its last part the one flexible column; every other column stands at its own
// content's width (docs/web.md, 「Agent management screen」, the draft process).
const columns = computed<SettingsColumn<DraftProcessView>[]>(() => [
  { accessorKey: "provider", header: t("agents.label.column_provider") },
  { accessorKey: "tier", header: t("agents.label.tier") },
  { accessorKey: "agentName", header: t("agents.label.draft_agent") },
  { id: "rounds", header: t("agents.label.draft_rounds"), ceiling: 304 },
  { id: "light", header: t("agents.label.draft_light"), ceiling: 304 },
  { id: "lightChars", header: t("agents.label.draft_light_chars") },
  { id: "ceilingSeconds", header: t("agents.label.draft_ceiling") },
  { id: "pastCeiling", header: t("agents.label.draft_past_ceiling") },
  { id: "remove", header: "" }
]);

// A question's name is its row's title and the flexible column; its text stands on one line under a ceiling.
const questionColumns = computed<SettingsColumn<DraftQuestionView>[]>(() => [
  { accessorKey: "name", header: t("common.label.name") },
  { id: "text", header: t("agents.label.draft_question_text"), ceiling: 592 }
]);

const pastChoices = computed<CellChoice[]>(() => PAST_CEILINGS.map((past) => ({ value: past, label: pastCeilingText(t, past) })));

function keyText(key: DraftKey): string {
  return draftKeyLabel(t, key);
}

// One row set from what stands with one value changed, the table read again once the receiver took it; its refusal,
// in the pack's words, stands under the box.
async function save(row: DraftProcessView, change: Partial<DraftProcessValues>): Promise<string | null> {
  try {
    await $fetch("/api/draft-processes", { method: "POST", body: { provider: row.provider, tier: row.tier, agentName: row.agentName, ...draftValues(row), ...change } });
    await refresh();

    return null;
  } catch (failure) {
    return failureText(failure, t("common.error.save_failed"));
  }
}

async function saveChoice(row: DraftProcessView, value: string): Promise<string | null> {
  return value === "send" || value === "skip" ? await save(row, { pastCeiling: value as PastCeiling }) : t("common.error.bad_action");
}

// A console's row taken away, asked first in a dialog; the policy's row of the key stands again where it
// holds one.
async function remove(row: DraftProcessView): Promise<void> {
  const taken = await askFirst({ title: t("agents.message.draft_process_remove_confirm"), item: keyText(row), confirm: t("common.action.delete") });

  if (!taken) return;

  actionFailed.value = "";

  try {
    await $fetch("/api/draft-processes", { method: "DELETE", body: { provider: row.provider, tier: row.tier, agentName: row.agentName } });
    await refresh();
  } catch (failure) {
    actionFailed.value = failureText(failure, t("common.error.save_failed"));
  }
}

// A new key: any or one name in each place, a key that already stands not taken.
const adding = ref(false);
const addSaving = ref(false);
const addFault = ref("");
const newKey = reactive<DraftKey>({ provider: ANY_KEY, tier: ANY_KEY, agentName: ANY_KEY });

const anyChoice = computed<CellChoice>(() => ({ value: ANY_KEY, label: draftKeyText(t, ANY_KEY) }));
const providerChoices = computed<CellChoice[]>(() => [anyChoice.value, ...(providers.value ?? []).map((one) => ({ value: one.name, label: one.label }))]);
const tierChoices = computed<CellChoice[]>(() => [anyChoice.value, ...[...new Set((data.value?.rows ?? []).map((row) => row.tier).filter((tier) => tier !== ANY_KEY))].map((tier) => ({ value: tier, label: tier }))]);
const agentChoices = computed<CellChoice[]>(() => [anyChoice.value, ...(supervisors.value ?? []).map((one) => ({ value: one.name, label: one.label }))]);
const keyTaken = computed<boolean>(() => (data.value?.rows ?? []).some((row) => sameDraftKey(row, newKey)));

watch(adding, (now) => {
  if (!now) return;
  Object.assign(newKey, { provider: ANY_KEY, tier: ANY_KEY, agentName: ANY_KEY });
  addFault.value = "";
});

watch(newKey, () => {
  addFault.value = keyTaken.value ? t("agents.error.draft_key_taken") : "";
});

async function addRow(): Promise<void> {
  if (keyTaken.value || addSaving.value || data.value == null) return;

  const from = draftRowFor(data.value.rows, newKey);

  if (from === null) return;

  addSaving.value = true;

  try {
    const refused = await save({ ...from, ...newKey }, {});

    if (refused === null) {
      adding.value = false;
    } else {
      addFault.value = refused;
    }
  } finally {
    addSaving.value = false;
  }
}

// A question's text, edited in its cell's box or added under a new name.
const editing = reactive<Record<string, boolean>>({});
const editingName = ref<string | null>(null);
const editedText = ref("");
const questionSaving = ref(false);
const questionRefused = ref("");
const addingQuestion = ref(false);
const newQuestion = reactive({ name: "", text: "" });

// Opening a question's cell starts its box from the text the receiver holds. Closing one leaves the box as it stands
// until the next opening: the dropdown is still on screen while it goes, and a box emptied on the closing frame would
// flash the required-text refusal as it left.
watch(
  () => Object.keys(editing).find((one) => editing[one]) ?? null,
  (name) => {
    if (name === null) return;

    editingName.value = name;
    editedText.value = data.value?.questions.find((one) => one.name === name)?.text ?? "";
    questionRefused.value = "";
  }
);

watch(addingQuestion, (now) => {
  if (!now) return;
  Object.assign(newQuestion, { name: "", text: "" });
  questionRefused.value = "";
});

async function writeQuestion(name: string, text: string): Promise<boolean> {
  questionSaving.value = true;
  questionRefused.value = "";

  try {
    await $fetch("/api/draft-questions", { method: "POST", body: { name, text } });
    await refresh();

    return true;
  } catch (failure) {
    questionRefused.value = failureText(failure, t("common.error.save_failed"));

    return false;
  } finally {
    questionSaving.value = false;
  }
}

async function saveQuestion(name: string): Promise<void> {
  if (questionTextFault(t, editedText.value) !== null || questionSaving.value) return;
  if (await writeQuestion(name, editedText.value)) editing[name] = false;
}

async function addQuestion(): Promise<void> {
  if (questionNameFault(t, newQuestion.name, catalogue.value) !== null || questionTextFault(t, newQuestion.text) !== null || questionSaving.value) return;
  if (await writeQuestion(newQuestion.name, newQuestion.text)) addingQuestion.value = false;
}

defineExpose({ refresh });
</script>
