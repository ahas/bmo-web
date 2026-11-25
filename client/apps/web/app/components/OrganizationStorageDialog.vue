<template>
  <!-- The storage form of the storage tab (docs/web.md, 「System and organisation」, the storage tab): the place a unit keeps its
       people's documents at, or following above, and the settings the place takes, saved together through
       bmo-artifact, which judges them; a refusal is said under the form. -->
  <SettingsDialog v-model:open="open" :title="$t('org_storage.title.storage')" :dirty="changes">
    <UForm id="storage-form" :state="draft" class="flex flex-col gap-4" @submit="save">
      <UFormField :label="$t('org_storage.label.place')" name="place" required>
        <ChoiceSelect v-model="draft.place" :items="placeItems" value-key="value" class="w-full" data-storage-choice />
      </UFormField>
      <UFormField
        v-for="field in fields"
        :key="field.key"
        :label="storageFieldLabel(t, draft.place, field.key)"
        :name="field.key"
        :required="field.required"
        :hint="field.required ? undefined : $t('org_storage.label.optional')"
        :help="helpOf(field.key)"
      >
        <UInput
          v-model="draft.fields[field.key]"
          :type="field.shape === 'number' ? 'number' : 'text'"
          :inputmode="field.shape === 'number' ? 'numeric' : undefined"
          :placeholder="field.required ? undefined : unsetLine(t, draft.place, field.key)"
          class="w-full"
          :data-storage-input="field.key"
        />
      </UFormField>
      <UAlert v-if="failure !== ''" color="error" variant="subtle" :description="failure" class="whitespace-pre-line" data-storage-refused />
    </UForm>

    <template #footer="{ close }">
      <UButton color="neutral" variant="ghost" :label="$t('common.action.cancel')" @click="close()" />
      <UButton type="submit" form="storage-form" :label="$t('common.action.save')" :loading="busy" :disabled="busy || !changes.dirty.value || !complete" data-storage-save />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { useOpenedWith } from "bmo-ui/app/domain/form-save";

import { FOLLOWS, placeName, storageFieldLabel, unsetLine } from "~/domain/artifact-storage";

import type { StoragePlaceView, StorageValue } from "#shared/artifact-storage";

interface Props {
  unit: number;
  places: StoragePlaceView[];
  // The unit's own value, or null where it follows above.
  own: StorageValue | null;
}

const props = defineProps<Props>();
const emit = defineEmits<{ saved: [] }>();
const open = defineModel<boolean>("open", { default: false });

const { t } = useI18n();

const draft = reactive<{ place: string; fields: Record<string, string> }>({ place: FOLLOWS, fields: {} });
const changes = useOpenedWith(() => ({ place: draft.place, fields: { ...draft.fields } }), { open });
const busy = ref(false);
const failure = ref("");

const placeItems = computed(() => [{ value: FOLLOWS, label: t("org_agents.label.delegation_inherit") }, ...props.places.map((one) => ({ value: one.name, label: placeName(t, one.name) }))]);
const fields = computed(() => props.places.find((one) => one.name === draft.place)?.fields ?? []);
// Whether every setting the place needs is given.
const complete = computed(() => fields.value.every((field) => !field.required || (draft.fields[field.key] ?? "").trim() !== ""));

function helpOf(key: string): string | undefined {
  return key === "folder" ? t("org_storage.label.folder_help") : undefined;
}

watch(open, (now) => {
  if (!now) return;

  draft.place = props.own?.place ?? FOLLOWS;
  draft.fields = Object.fromEntries(Object.entries(props.own ?? {}).filter(([key]) => key !== "place").map(([key, value]) => [key, String(value)]));
  failure.value = "";
});

// The value the form holds: null to follow above, else the place and the settings it takes that are given.
function valueOf(): StorageValue | null {
  if (draft.place === FOLLOWS) return null;

  const given = fields.value.flatMap((field) => {
    const said = (draft.fields[field.key] ?? "").trim();

    if (said === "") return [];

    return [[field.key, field.shape === "number" ? Number(said) : said] as const];
  });

  return { place: draft.place, ...Object.fromEntries(given) };
}

async function save(): Promise<void> {
  busy.value = true;
  failure.value = "";
  try {
    await $fetch("/api/organization/storage", { method: "PUT", body: { unit: props.unit, value: valueOf() } });
    open.value = false;
    emit("saved");
  } catch (error) {
    failure.value = failureText(error, t("org_storage.error.failed"));
  } finally {
    busy.value = false;
  }
}
</script>
