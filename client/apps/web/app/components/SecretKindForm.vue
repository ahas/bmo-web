<template>
  <!-- A secret kind's form (docs/web.md, the secret store section): its key, for a kind being added alone, its name,
       its description and its fields, each a row of its key, label, input, hidden and required. A kind holds the
       fields' shapes and never a value, and the rules the server holds it to are said under the field they name. -->
  <SettingsDialog v-model:open="open" :title="props.kind === null ? $t('secrets.title.kind_add') : $t('secrets.title.kind_edit')" :dirty="changes" wide>
    <UForm id="secret-kind-form" :state="form" class="flex flex-col gap-4" autocomplete="off" data-secret-kind-form @submit="submit">
      <UFormField v-if="props.kind === null" :label="$t('secrets.label.kind_key')" name="key" required :hint="$t('secrets.label.kind_key_hint')" :error="faultOf('key')">
        <UInput v-model="form.key" class="w-full" autocomplete="off" autocapitalize="off" spellcheck="false" data-kind-key />
      </UFormField>

      <UFormField :label="$t('secrets.label.kind_name')" name="name" required :error="faultOf('name')">
        <UInput v-model="form.name" class="w-full" autocomplete="off" data-kind-name />
      </UFormField>

      <UFormField :label="$t('secrets.label.kind_description')" name="description" :error="faultOf('description')">
        <GrowingTextarea v-model="form.description" class="w-full" :rows="2" autocomplete="off" data-kind-description />
      </UFormField>

      <UFormField :label="$t('secrets.label.fields')" :error="listFault">
        <div class="flex flex-col gap-4">
          <div v-for="(field, at) in form.fields" :key="field.id" class="flex flex-col gap-2" data-kind-field>
            <!-- On a narrow screen the key and the label each take the row, and the input stands under them. -->
            <div class="flex min-w-0 flex-wrap items-start gap-2 sm:flex-nowrap">
              <UFormField :label="$t('secrets.label.field_key')" class="min-w-0 basis-full sm:basis-0 sm:flex-1" :error="fieldFault(at, ['field_key', 'field_repeated'])">
                <UInput v-model="field.key" class="w-full" autocomplete="off" autocapitalize="off" spellcheck="false" data-kind-field-key />
              </UFormField>
              <UFormField :label="$t('secrets.label.field_label')" class="min-w-0 basis-full sm:basis-0 sm:flex-1" :error="fieldFault(at, ['field_label'])">
                <UInput v-model="field.label" class="w-full" autocomplete="off" data-kind-field-label />
              </UFormField>
              <UFormField :label="$t('secrets.label.field_input')" class="shrink-0" :error="fieldFault(at, ['field_alone'])">
                <USelect v-model="field.input" :items="inputItems" class="w-28" />
              </UFormField>
              <UTooltip :text="$t('secrets.action.field_remove')">
                <UButton class="mt-6" icon="i-material-symbols-close" color="neutral" variant="ghost" :aria-label="$t('secrets.action.field_remove')" @click="removeField(at)" />
              </UTooltip>
            </div>
            <div class="flex flex-wrap gap-4">
              <USwitch v-if="field.input !== 'file'" v-model="field.masked" :label="$t('secrets.label.field_masked')" />
              <USwitch v-model="field.required" :label="$t('secrets.label.field_required')" />
            </div>
          </div>

          <div class="flex justify-end">
            <UButton color="neutral" variant="subtle" icon="i-material-symbols-add" :label="$t('secrets.action.field_add')" data-kind-field-add @click="addField" />
          </div>
        </div>
      </UFormField>

      <UAlert v-if="failure !== ''" color="error" variant="subtle" :description="failure" />
    </UForm>

    <template #footer="{ close }">
      <UButton color="neutral" variant="ghost" :label="$t('common.action.cancel')" @click="close()" />
      <UButton type="submit" form="secret-kind-form" :label="$t('common.action.save')" :loading="busy" :disabled="busy || !ready || !changes.dirty.value" data-kind-save />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { useOpenedWith } from "bmo-ui/app/domain/form-save";

import { INPUT_LABELS, faultText } from "~/domain/secret-form";
import { SECRET_INPUTS, kindFaults } from "#shared/secret-kinds";

import type { KindProblem, SecretInput, SecretKind } from "#shared/secret-kinds";

const props = defineProps<{ kind: SecretKind | null }>();
const emit = defineEmits<{ saved: [kind: SecretKind] }>();
const open = defineModel<boolean>("open", { default: false });

const { t } = useI18n();

interface FieldRow {
  id: number;
  key: string;
  label: string;
  input: SecretInput;
  masked: boolean;
  required: boolean;
}

const form = reactive<{ key: string; name: string; description: string; fields: FieldRow[] }>({ key: "", name: "", description: "", fields: [] });
const busy = ref(false);
const failure = ref("");
let rowIds = 0;

const inputItems = computed(() => SECRET_INPUTS.map((input) => ({ label: t(INPUT_LABELS[input]), value: input })));

function rowOf(field: Omit<FieldRow, "id">): FieldRow {
  return { id: rowIds++, ...field };
}

const kind = computed<SecretKind>(() => ({
  key: form.key.trim(),
  name: form.name.trim(),
  description: form.description.trim(),
  fields: form.fields.map((field) => ({
    key: field.key.trim(),
    label: field.label.trim(),
    masked: field.input !== "file" && field.masked,
    input: field.input,
    required: field.required
  }))
}));

const faults = computed(() => kindFaults(kind.value));
const ready = computed(() => faults.value.length === 0);

const changes = useOpenedWith(() => kind.value, { open });

// A rule is said under its field once something has been written there, so an empty new form is not all red.
function faultOf(problem: KindProblem): string | undefined {
  const fault = faults.value.find((one) => one.problem === problem && one.field === undefined);
  const written = problem === "key" ? form.key : problem === "name" ? form.name : form.description;

  return fault === undefined || written === "" ? undefined : faultText(t, fault);
}

function fieldFault(at: number, problems: KindProblem[]): string | undefined {
  const fault = faults.value.find((one) => one.field === at && problems.includes(one.problem));
  const row = form.fields[at];
  const untouched = row !== undefined && row.key === "" && row.label === "" && fault?.problem !== "field_alone";

  return fault === undefined || untouched ? undefined : faultText(t, fault);
}

const listFault = computed(() => {
  const fault = faults.value.find((one) => one.problem === "too_many_fields");

  return fault === undefined ? undefined : faultText(t, fault);
});

function addField(): void {
  form.fields = [...form.fields, rowOf({ key: "", label: "", input: "line", masked: false, required: true })];
}

function removeField(at: number): void {
  form.fields = form.fields.filter((_, index) => index !== at);
}

watch(
  open,
  (standing) => {
    if (!standing) return;

    failure.value = "";
    form.key = props.kind?.key ?? "";
    form.name = props.kind?.name ?? "";
    form.description = props.kind?.description ?? "";
    form.fields = (props.kind?.fields ?? [{ key: "", label: "", input: "line" as const, masked: false, required: true }]).map((field) => rowOf({ ...field }));
  },
  { immediate: true }
);

async function submit(): Promise<void> {
  if (!ready.value || !changes.dirty.value) return;

  busy.value = true;
  failure.value = "";

  try {
    const kept = props.kind === null
      ? await $fetch<SecretKind>("/api/secret-kinds", { method: "POST", body: kind.value })
      : await $fetch<SecretKind>(`/api/secret-kinds/${encodeURIComponent(props.kind.key)}`, { method: "PUT", body: kind.value });

    emit("saved", kept);
    open.value = false;
  } catch (error) {
    failure.value = failureText(error, t("secrets.error.kind_save_failed"));
  } finally {
    busy.value = false;
  }
}
</script>
