<template>
  <!-- A supervisor's own settings as a block of its settings form (docs/web.md, 「Agent management screen」, the supervisors tab):
       its label, its road, its warming on its road's provider, its compaction threshold and the repository its TODO
       items go to. Every change waits for the form's one save; a refusal stands under the field
       it names, every field kept as written. -->
  <div class="flex min-w-0 flex-col gap-4">
    <UFormField :label="$t('agents.label.display_name')" name="label" :error="errorAt('label')">
      <UInput v-model="draft.label" class="w-full" :disabled="busy" :aria-label="$t('agents.label.display_name')" />
    </UFormField>

    <UFormField :label="$t('agents.label.name_tag')" name="nameTag" :description="$t('agents.message.name_tag_hint')" :error="errorAt('nameTag')">
      <UInput
        v-model="draft.nameTag"
        class="w-full"
        :maxlength="40"
        :placeholder="$t('agents.label.name_tag_default', { name: draft.label.trim() === '' ? props.supervisor.name : draft.label.trim() })"
        :disabled="busy"
        :aria-label="$t('agents.label.name_tag')"
      />
    </UFormField>

    <RoadField v-model="draft.road" :line="SUPERVISOR_LINE" :refusal="refusal" :disabled="busy" :runs-as-owner="props.supervisor.runsAsOwner" />

    <UFormField :label="$t('agents.label.column_warming')" name="warming" :error="errorAt('warming')">
      <div class="flex flex-col divide-y divide-default">
        <div v-for="entry in roadOf(draft)" :key="entry.provider" class="flex min-h-10 items-center justify-between gap-3">
          <span class="text-sm text-toned">{{ providerWord(providers, entry.provider) }}</span>
          <USwitch
            :model-value="draft.warming[entry.provider] === true"
            :disabled="busy"
            :aria-label="$t('agents.aria.warming_of', { name: props.supervisor.label, provider: providerWord(providers, entry.provider) })"
            @update:model-value="(on: boolean) => (draft.warming = { ...draft.warming, [entry.provider]: on })"
          />
        </div>
      </div>
    </UFormField>

    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField :label="$t('agents.label.column_threshold')" name="foldRatio" :error="errorAt('foldRatio')">
        <NumberInput
          v-model="draft.threshold"
          :min="1"
          :max="100"
          :step="1"
          :digits="3"
          :unit="markedDefault($t, '%', isDefaultThreshold(draft.threshold, defaultThreshold(providers, draft.road.provider === '' ? null : draft.road.provider)))"
          :disabled="busy"
          :aria-label="$t('agents.label.column_threshold')"
        />
      </UFormField>
      <UFormField :label="$t('agents.label.work_repository')" name="repository" :error="errorAt('repository')">
        <ChoiceSelect v-model="draft.repository" :items="repositoryItems" value-key="value" class="w-full" :disabled="busy" :aria-label="$t('agents.label.work_repository')" />
      </UFormField>
    </div>

    <p v-if="refusal !== null && !FIELDS.has(refusal.field ?? '')" role="alert" class="break-words text-sm text-error">{{ refusal.text }}</p>
  </div>
</template>

<script setup lang="ts">
import { useFormPart, useOpenedWith } from "bmo-ui/app/domain/form-save";

import { defaultThreshold, emptyRoad, fractionOf, isDefaultThreshold, markedDefault, percentOf, providerWord, refusalOf, ROAD_FIELDS, SUPERVISOR_LINE, useProviders } from "~/domain/axes";
import { sameValue } from "~/domain/form-values";

import type { RepositoryView, RoadView, SupervisorView } from "#shared/axes";

const props = defineProps<{ supervisor: SupervisorView }>();
const emit = defineEmits<{ saved: [supervisor: SupervisorView] }>();

const { t } = useI18n();
const { data: providers } = useProviders();
const { data: repositories } = useFetch<RepositoryView[]>("/api/repositories", { key: "repositories", lazy: true, server: false });

const FIELDS = new Set(["label", "nameTag", "warming", "foldRatio", "repository", ...ROAD_FIELDS]);

interface Draft {
  label: string;
  // Its name tag as written, empty for the default.
  nameTag: string;
  // Its road, one whose provider is empty where it names none.
  road: RoadView;
  warming: Record<string, boolean>;
  threshold: number;
  repository: string;
}

function draftOf(supervisor: SupervisorView): Draft {
  return {
    label: supervisor.label,
    nameTag: supervisor.nameTag ?? "",
    road: { ...(supervisor.road ?? emptyRoad()) },
    warming: { ...supervisor.warming },
    threshold: percentOf(supervisor.foldRatio),
    repository: supervisor.repository ?? ""
  };
}

const saved = computed(() => draftOf(props.supervisor));
const draft = ref<Draft>(draftOf(props.supervisor));
const busy = ref(false);
const refusal = ref<{ field: string | null; text: string } | null>(null);

const repositoryItems = computed(() => (repositories.value ?? []).map((one) => ({ label: one.label, value: one.name, description: one.name })));
// The road its warming is switched on, none while it names none.
function roadOf(held: Draft): RoadView[] {
  return held.road.provider === "" ? [] : [held.road];
}

function errorAt(field: string): string | undefined {
  return refusal.value?.field === field ? refusal.value.text : undefined;
}

const changes = useOpenedWith(() => draft.value);

// What differs from what is saved, as the agency takes it.
function changed(): Record<string, unknown> {
  const body: Record<string, unknown> = {};

  if (draft.value.label.trim() !== saved.value.label) body.label = draft.value.label.trim();
  if (draft.value.nameTag.trim() !== saved.value.nameTag) body.nameTag = draft.value.nameTag.trim() === "" ? null : draft.value.nameTag.trim();
  // A road is sent whole once it names its provider and model.
  if (!sameValue(draft.value.road, saved.value.road) && draft.value.road.model !== "") body.road = draft.value.road;
  if (!sameValue(draft.value.warming, saved.value.warming)) body.warming = draft.value.warming;
  if (draft.value.threshold !== saved.value.threshold) body.foldRatio = fractionOf(draft.value.threshold);
  if (draft.value.repository !== saved.value.repository) body.repository = draft.value.repository === "" ? null : draft.value.repository;

  return body;
}

async function save(): Promise<boolean> {
  busy.value = true;
  refusal.value = null;

  try {
    const answered = await $fetch<SupervisorView>(`/api/supervisors/${encodeURIComponent(props.supervisor.name)}`, { method: "PATCH", body: changed() });

    draft.value = draftOf(answered);
    emit("saved", answered);

    return true;
  } catch (failure) {
    refusal.value = refusalOf(t, failure);

    return false;
  } finally {
    busy.value = false;
  }
}

useFormPart({
  dirty: changes,
  save,
  discard: () => {
    draft.value = draftOf(props.supervisor);
    refusal.value = null;
  }
});
</script>
