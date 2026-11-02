<template>
  <!-- A supervisor's own settings as a block of its settings form (docs/web.md, 「Agent management screen」, the supervisors tab):
       its label, its provider order and quota share, its warming per provider, its compaction threshold and the
       repository its TODO items go to. Every change waits for the form's one save; a refusal stands under the field
       it names, every field kept as written. -->
  <div class="flex min-w-0 flex-col gap-4">
    <UFormField :label="$t('agents.label.display_name')" name="label" :error="errorAt('label')">
      <UInput v-model="draft.label" class="w-full" :disabled="busy" :aria-label="$t('agents.label.display_name')" />
    </UFormField>

    <UFormField :label="$t('agents.label.order')" name="order">
      <ProviderOrderField v-model="draft.order" v-model:share="draft.quotaShare" :line="SUPERVISOR_LINE" :refusal="orderRefusal" :disabled="busy" />
    </UFormField>

    <UFormField :label="$t('agents.label.column_warming')" name="warming" :error="errorAt('warming')">
      <div class="flex flex-col divide-y divide-default">
        <div v-for="entry in draft.order" :key="entry.provider" class="flex min-h-10 items-center justify-between gap-3">
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
        <NumberInput v-model="draft.threshold" :min="1" :max="100" :step="1" :digits="3" unit="%" :disabled="busy" :aria-label="$t('agents.label.column_threshold')" />
      </UFormField>
      <UFormField :label="$t('agents.label.work_repository')" name="repository" :error="errorAt('repository')">
        <USelect v-model="draft.repository" :items="repositoryItems" value-key="value" class="w-full" :disabled="busy" :aria-label="$t('agents.label.work_repository')" />
      </UFormField>
    </div>

    <p v-if="refusal !== null && !FIELDS.has(refusal.field ?? '') && orderRefusal === null" role="alert" class="break-words text-sm text-error">{{ refusal.text }}</p>
  </div>
</template>

<script setup lang="ts">
import { useFormPart } from "bmo-ui/app/domain/form-save";

import { fractionOf, orderRefusalEntry, percentOf, providerWord, refusalOf, SUPERVISOR_LINE, useProviders } from "~/domain/axes";

import type { OrderEntryView, RepositoryView, SupervisorView } from "#shared/axes";

const props = defineProps<{ supervisor: SupervisorView }>();
const emit = defineEmits<{ saved: [supervisor: SupervisorView] }>();

const { t } = useI18n();
const { data: providers } = useProviders();
const { data: repositories } = useFetch<RepositoryView[]>("/api/repositories", { key: "repositories", lazy: true, server: false });

const FIELDS = new Set(["label", "warming", "foldRatio", "repository"]);

interface Draft {
  label: string;
  order: OrderEntryView[];
  quotaShare: number;
  warming: Record<string, boolean>;
  threshold: number;
  repository: string;
}

function draftOf(supervisor: SupervisorView): Draft {
  return {
    label: supervisor.label,
    order: supervisor.order.map((one) => ({ ...one })),
    quotaShare: supervisor.quotaShare,
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
const orderRefusal = computed(() => {
  const field = refusal.value?.field ?? null;

  return refusal.value !== null && field !== null && (field.startsWith("order") || field === "quotaShare") ? { entry: orderRefusalEntry(field), text: refusal.value.text } : null;
});

function errorAt(field: string): string | undefined {
  return refusal.value?.field === field ? refusal.value.text : undefined;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

// What differs from what is saved, as the agency takes it.
function changed(): Record<string, unknown> {
  const body: Record<string, unknown> = {};

  if (draft.value.label.trim() !== saved.value.label) body.label = draft.value.label.trim();
  if (!same(draft.value.order, saved.value.order)) body.order = draft.value.order;
  if (draft.value.quotaShare !== saved.value.quotaShare) body.quotaShare = draft.value.quotaShare;
  if (!same(draft.value.warming, saved.value.warming)) body.warming = draft.value.warming;
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
  dirty: () => Object.keys(changed()).length > 0,
  save,
  discard: () => {
    draft.value = draftOf(props.supervisor);
    refusal.value = null;
  }
});
</script>
