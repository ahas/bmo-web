<template>
  <!-- The secret form (docs/web.md, the secret store section): a kind, a name and the kind's fields, or fields composed by hand,
       and one save that writes the store at once. The values stand in this form's boxes and nowhere else: they go to
       the console's route in the body, and the boxes are emptied as soon as the answer comes and as the dialog
       closes, however it closes. -->
  <SettingsDialog v-model:open="open" :title="props.ask.replace ? $t('secrets.title.replace') : $t('secrets.title.add')" :dirty="dirty">
    <UForm id="secret-form" :state="form" class="flex flex-col gap-4" autocomplete="off" data-secret-form @submit="submit">
      <p v-if="props.ask.purpose !== ''" class="text-sm text-muted" data-secret-purpose>{{ $t("secrets.label.purpose", { purpose: props.ask.purpose }) }}</p>

      <UFormField :label="$t('secrets.label.kind')" name="kind" :description="chosenKind?.description || undefined">
        <USelect v-model="form.kind" :items="kindItems" class="w-full" :placeholder="$t('secrets.label.kind')" data-secret-kind @update:model-value="kindChosen = true" />
      </UFormField>

      <UFormField :label="$t('secrets.label.name')" name="name" required :hint="$t('secrets.label.name_hint')" :error="nameError">
        <UInput v-model="form.name" class="w-full" autocomplete="off" autocapitalize="off" spellcheck="false" data-secret-name />
      </UFormField>

      <USwitch
        v-if="standing"
        v-model="form.replace"
        :label="$t('secrets.label.replace')"
        :description="$t('secrets.label.replace_note', { name: form.name })"
        data-secret-replace
      />

      <template v-if="composing">
        <div v-for="(field, at) in composed" :key="field.id" class="flex flex-col gap-2" data-secret-composed>
          <div class="flex min-w-0 items-end gap-2">
            <UFormField :label="$t('secrets.label.field_key')" class="min-w-0 flex-1" :error="composedErrors[at]">
              <UInput v-model="field.key" class="w-full" autocomplete="off" autocapitalize="off" spellcheck="false" data-secret-field-key />
            </UFormField>
            <UFormField :label="$t('secrets.label.field_input')" class="shrink-0">
              <USelect v-model="field.input" :items="inputItems" class="w-28" />
            </UFormField>
            <UTooltip :text="$t('secrets.action.field_remove')">
              <UButton icon="i-material-symbols-close" color="neutral" variant="ghost" :aria-label="$t('secrets.action.field_remove')" @click="removeComposed(at)" />
            </UTooltip>
          </div>
          <USwitch v-if="field.input !== 'file'" v-model="field.masked" :label="$t('secrets.label.field_masked')" />
        </div>
        <div class="flex justify-end">
          <UButton color="neutral" variant="subtle" icon="i-material-symbols-add" :label="$t('secrets.action.field_add')" data-secret-field-add @click="addComposed" />
        </div>
      </template>

      <SecretFieldInput
        v-for="field in valueFields"
        :key="field.key"
        v-model:text="texts[field.key]"
        :field="field"
        :file="files.get(field.key) ?? null"
        @file="(chosen) => chooseFile(field.key, chosen)"
      />

      <template v-if="composing">
        <USwitch v-model="form.saveAsKind" :label="$t('secrets.label.save_as_kind')" data-secret-save-kind />
        <div v-if="form.saveAsKind" class="flex min-w-0 gap-2">
          <UFormField :label="$t('secrets.label.kind_key')" :hint="$t('secrets.label.kind_key_hint')" class="min-w-0 flex-1" :error="newKindErrors.key">
            <UInput v-model="form.kindKey" class="w-full" autocomplete="off" autocapitalize="off" spellcheck="false" data-secret-kind-key />
          </UFormField>
          <UFormField :label="$t('secrets.label.new_kind_name')" class="min-w-0 flex-1" :error="newKindErrors.name">
            <UInput v-model="form.kindName" class="w-full" autocomplete="off" data-secret-kind-name />
          </UFormField>
        </div>
      </template>

      <UAlert v-if="failure !== ''" color="error" variant="subtle" :description="failure" />
    </UForm>

    <template #footer="{ close }">
      <UButton color="neutral" variant="ghost" :label="$t('common.action.cancel')" @click="close()" />
      <UButton type="submit" form="secret-form" :label="$t('common.action.save')" :loading="busy" :disabled="busy || !ready" data-secret-save />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import { INPUT_LABELS, faultText, kindWords } from "~/domain/secret-form";
import { SECRET_INPUTS, fieldFaults, fieldsReady, kindFaults, secretFileOf } from "#shared/secret-kinds";
import { SECRET_NAME_MAX, secretNameIsPlain } from "#shared/secrets";

import type { SecretAsk } from "~/domain/secret-form";
import type { ChosenFile } from "~/components/SecretFieldInput.vue";
import type { SecretField, SecretInput, SecretKind } from "#shared/secret-kinds";
import type { KeptSecret } from "#shared/types";

interface Props {
  ask: SecretAsk;
  kinds: readonly SecretKind[];
  // The secrets the store holds, so a name standing already asks for replacing.
  secrets: readonly KeptSecret[];
}

const props = defineProps<Props>();
const emit = defineEmits<{ saved: [kept: KeptSecret, kind: string]; kindAdded: [kind: SecretKind] }>();
const open = defineModel<boolean>("open", { default: false });

const { t } = useI18n();

// The kind chooser's value for fields composed by hand, which no kind's key can be.
const COMPOSE = ":compose";

interface ComposedField {
  id: number;
  key: string;
  input: SecretInput;
  masked: boolean;
}

const form = reactive({ kind: "", name: "", replace: false, saveAsKind: false, kindKey: "", kindName: "" });
const composed = ref<ComposedField[]>([]);
const texts = reactive<Record<string, string>>({});
// The files chosen, by field key: their names and sizes for the form, and their bytes for the save.
const files = shallowReactive(new Map<string, ChosenFile>());
const busy = ref(false);
const failure = ref("");
let composedIds = 0;

const kindItems = computed(() => [
  ...props.kinds.map((kind) => ({ label: kind.name, value: kind.key })),
  { label: t("secrets.label.compose"), value: COMPOSE }
]);
const inputItems = computed(() => SECRET_INPUTS.map((input) => ({ label: t(INPUT_LABELS[input]), value: input })));

const composing = computed(() => form.kind === COMPOSE);
const chosenKind = computed<SecretKind | null>(() => props.kinds.find((kind) => kind.key === form.kind) ?? null);

const composedFields = computed<SecretField[]>(() =>
  composed.value.map((field) => ({ key: field.key.trim(), label: field.key.trim(), masked: field.input !== "file" && field.masked, input: field.input, required: true }))
);

// The fields the value is asked in: the kind's, or those composed by hand.
const fields = computed<SecretField[]>(() => (composing.value ? composedFields.value : (chosenKind.value?.fields ?? [])));
// Only a composed field with a key written takes a value.
const valueFields = computed<SecretField[]>(() => (composing.value ? fields.value.filter((field) => field.key !== "") : fields.value));

const composedErrors = computed<(string | undefined)[]>(() => {
  const errors: (string | undefined)[] = composed.value.map(() => undefined);

  for (const fault of fieldFaults(composedFields.value)) {
    if (fault.field !== undefined && composed.value[fault.field]?.key.trim() !== "") errors[fault.field] ??= faultText(t, fault);
  }

  return errors;
});

const newKind = computed<SecretKind>(() => ({ key: form.kindKey.trim(), name: form.kindName.trim(), description: "", fields: composedFields.value }));
const newKindErrors = computed(() => {
  const faults = kindFaults(newKind.value);
  const key = faults.find((fault) => fault.problem === "key");
  const name = faults.find((fault) => fault.problem === "name");

  return {
    key: form.kindKey !== "" && key !== undefined ? faultText(t, key) : undefined,
    name: form.kindName !== "" && name !== undefined ? faultText(t, name) : undefined
  };
});

const values = computed(() => ({ texts: { ...texts }, files: Object.fromEntries([...files].map(([key, file]) => [key, file.bytes])) }));

const standing = computed(() => props.secrets.some((secret) => secret.name === form.name));
const nameError = computed(() => (form.name !== "" && !secretNameIsPlain(form.name) ? t("secrets.error.bad_name", { max: SECRET_NAME_MAX }) : undefined));
const ready = computed(
  () =>
    secretNameIsPlain(form.name)
    && fieldFaults(fields.value).length === 0
    && fieldsReady(fields.value, values.value)
    && (!standing.value || form.replace)
    && (!composing.value || !form.saveAsKind || kindFaults(newKind.value).length === 0)
);
const holdsValue = computed(() => Object.values(texts).some((text) => text !== "") || files.size > 0);
const dirty = computed(() => holdsValue.value || form.name !== props.ask.name || (composing.value && composed.value.length > 0 && props.ask.fields === null));

function forgetValues(): void {
  for (const key of Object.keys(texts)) delete texts[key];

  files.clear();
}

function addComposed(): void {
  composed.value = [...composed.value, { id: composedIds++, key: "", input: "line", masked: true }];
}

function removeComposed(at: number): void {
  const going = composed.value[at];

  if (going !== undefined) {
    delete texts[going.key.trim()];
    files.delete(going.key.trim());
  }

  composed.value = composed.value.filter((_, index) => index !== at);
}

function chooseFile(key: string, chosen: ChosenFile | null): void {
  if (chosen === null) files.delete(key);
  else files.set(key, chosen);
}

// Each opening starts from what it was asked with: the kind named where it stands among those kept, the fields a
// request named as composed by hand, and no kind where a request named one the console holds none of.
function askedKind(): string {
  const named = props.ask.kind === null ? null : (props.kinds.find((kind) => kind.key === props.ask.kind) ?? null);

  return named?.key ?? (props.ask.fields !== null ? COMPOSE : props.ask.kind !== null ? "" : (props.kinds[0]?.key ?? COMPOSE));
}

// Whether the reader chose a kind in this opening; until they do, the kinds arriving after it opened settle it.
const kindChosen = ref(false);

function begin(): void {
  forgetValues();
  failure.value = "";
  kindChosen.value = false;

  const asked = props.ask.fields;

  Object.assign(form, {
    kind: askedKind(),
    name: props.ask.name,
    replace: props.ask.replace,
    saveAsKind: false,
    kindKey: "",
    kindName: ""
  });
  composed.value = (asked ?? []).map((field) => ({ id: composedIds++, key: field.key, input: field.input, masked: field.masked }));
}

watch(open, (opened) => {
  if (opened) begin();
  else forgetValues();
}, { immediate: true });

watch(
  () => props.kinds,
  () => {
    if (open.value && !kindChosen.value) form.kind = askedKind();
  }
);

// A field no longer asked for lets its value go at once.
watch(valueFields, (now) => {
  const asked = new Set(now.map((field) => field.key));

  for (const key of Object.keys(texts)) if (!asked.has(key)) delete texts[key];
  for (const key of [...files.keys()]) if (!asked.has(key)) files.delete(key);
});

async function submit(): Promise<void> {
  if (!ready.value) return;

  const file = secretFileOf(fields.value, values.value);

  if (file === null) return;

  busy.value = true;
  failure.value = "";

  try {
    if (composing.value && form.saveAsKind) {
      try {
        emit("kindAdded", await $fetch<SecretKind>("/api/secret-kinds", { method: "POST", body: newKind.value }));
      } catch (error) {
        failure.value = failureText(error, t("secrets.error.kind_save_failed"));

        return;
      }
    }

    const words = kindWords(t, composing.value && form.saveAsKind ? newKind.value : chosenKind.value, fields.value);
    const asked = { name: form.name, value: file.value, encoding: file.encoding, replace: standing.value && form.replace };

    try {
      const kept = await $fetch<KeptSecret>("/api/secrets", { method: "POST", body: asked });

      forgetValues();
      emit("saved", kept, words);
      open.value = false;
    } catch (error) {
      forgetValues();
      failure.value = failureText(error, t("secrets.error.save_failed"));
    }
  } finally {
    busy.value = false;
  }
}
</script>
