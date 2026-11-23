<template>
  <!-- One agent's road chosen in its own form (docs/web.md, 「Settings」, the own-agents section; 「Organisation」, the
       agents tab): the first choice names no road — the one the screen says that stands for — then every provider whose
       program carries the agent's line; under a provider its model, a model the reader's supply does not carry standing
       disabled with why, and its effort where the model takes levels. The save sends the road whole, and a refusal
       stands under the form. -->
  <SettingsDialog v-model:open="open" :title="props.title" :description="props.description" :dirty="changed">
    <form :id="formId" class="flex flex-col gap-4" data-road-dialog @submit.prevent="void save()">
      <UFormField :label="$t('agents.label.agent_provider')" name="provider">
        <ChoiceSelect
          :model-value="draft.provider === '' ? NONE : draft.provider"
          :items="providerItems"
          value-key="value"
          class="w-full"
          :aria-label="$t('agents.label.agent_provider')"
          data-road-dialog-provider
          @update:model-value="(value: string) => pickProvider(value)"
        />
      </UFormField>
      <div v-if="draft.provider !== ''" class="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start">
        <UFormField :label="$t('common.label.model')" name="model" class="min-w-0 sm:flex-1">
          <ChoiceSelect
            :model-value="draft.model === '' ? undefined : draft.model"
            :items="modelItems"
            value-key="value"
            class="w-full min-w-0"
            :loading="reading"
            :aria-label="$t('common.label.model')"
            data-road-dialog-model
            @update:model-value="(value: string) => pickModel(value)"
          />
        </UFormField>
        <UFormField v-if="effortItems.length > 0" :label="$t('agents.label.effort')" name="effort" class="sm:w-32 sm:shrink-0">
          <ChoiceSelect
            :model-value="draft.effort ?? DEFAULT_EFFORT"
            :items="effortItems"
            value-key="value"
            class="w-full"
            :aria-label="$t('agents.label.effort')"
            data-road-dialog-effort
            @update:model-value="(value: string) => (draft.effort = value === DEFAULT_EFFORT ? null : value)"
          />
        </UFormField>
      </div>
      <p v-if="readFailure !== ''" role="alert" class="break-words text-sm text-error">{{ readFailure }}</p>
      <p v-if="failure !== ''" role="alert" class="break-words text-sm text-error" data-road-dialog-failure>{{ failure }}</p>
    </form>
    <template #footer="{ close: shut }">
      <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="saving" @click="shut()" />
      <UButton type="submit" :form="formId" :label="$t('common.action.save')" :loading="saving" :disabled="saving || !complete || !changed" data-road-dialog-save />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import type { OwnModel, OwnProvider, OwnRoad } from "#shared/own-agents";

interface Props {
  title: string;
  description?: string;
  // The providers on now; those whose program carries `line` are offered.
  providers: OwnProvider[];
  line: string;
  // The road the form opens on, null for none.
  road: OwnRoad | null;
  // What naming no road stands for, the first choice's words.
  noneLabel: string;
  // Where the models of a provider are read.
  modelsUrl: (provider: string) => string;
  // The road written; a refusal it throws is said under the form.
  save: (road: OwnRoad | null) => Promise<void>;
}

const props = withDefaults(defineProps<Props>(), { description: undefined });
const open = defineModel<boolean>("open", { default: false });

// The choice that names no road, and the effort the provider's own default stands as: a select takes no empty value,
// and no provider's name or effort level holds a colon.
const NONE = ":none";
const DEFAULT_EFFORT = ":default";

const { t } = useI18n();
const formId = useId();

const draft = reactive<{ provider: string; model: string; effort: string | null }>({ provider: "", model: "", effort: null });
const models = ref<OwnModel[]>([]);
const reading = ref(false);
const readFailure = ref("");
const failure = ref("");
const saving = ref(false);

const changed = computed(() => {
  const held = props.road;

  return held === null ? draft.provider !== "" : draft.provider !== held.provider || draft.model !== held.model || draft.effort !== held.effort;
});
const complete = computed(() => draft.provider === "" || draft.model !== "");

const providerItems = computed(() => [
  { label: props.noneLabel, value: NONE },
  ...props.providers.filter((one) => one.lines.length === 0 || one.lines.includes(props.line)).map((one) => ({ label: one.label, value: one.name }))
]);

// A model the reader's supply does not carry stands disabled, saying so; one the road names that the list does not
// carry still stands as its own choice.
const modelItems = computed(() => {
  const items = models.value.map((one) => ({
    label: one.id,
    value: one.id,
    disabled: !one.supplied,
    ...(one.supplied ? (one.inService === false ? { description: t("agents.label.model_superseded") } : {}) : { description: t("own_agents.label.not_supplied") })
  }));

  return draft.model === "" || items.some((one) => one.value === draft.model) ? items : [{ label: draft.model, value: draft.model, disabled: false }, ...items];
});

const effortItems = computed(() => {
  const levels = models.value.find((one) => one.id === draft.model)?.efforts ?? [];
  const named = levels.filter((level): level is string => level !== null);

  return named.length === 0 ? [] : [{ label: t("own_agents.label.effort_default"), value: DEFAULT_EFFORT }, ...named.map((level) => ({ label: level, value: level }))];
});

async function readModels(provider: string): Promise<void> {
  models.value = [];
  readFailure.value = "";

  if (provider === "") return;

  reading.value = true;
  try {
    models.value = await $fetch<OwnModel[]>(props.modelsUrl(provider));
  } catch (error) {
    readFailure.value = failureText(error, t("agents.error.provider_models_read_failed"));
  } finally {
    reading.value = false;
  }

  // A provider picked stands on the first model the reader may take once its models are read.
  if (draft.model === "" && draft.provider === provider) {
    draft.model = models.value.find((one) => one.supplied && one.inService !== false)?.id ?? models.value.find((one) => one.supplied)?.id ?? "";
  }
}

function pickProvider(value: string): void {
  const provider = value === NONE ? "" : value;

  if (provider === draft.provider) return;

  draft.provider = provider;
  draft.model = "";
  draft.effort = null;
  void readModels(provider);
}

// A model chosen keeps the effort set where it takes it.
function pickModel(model: string): void {
  draft.model = model;

  const levels = models.value.find((one) => one.id === model)?.efforts ?? [];

  if (draft.effort !== null && !levels.includes(draft.effort)) draft.effort = null;
}

watch(open, (opened) => {
  if (!opened) return;

  draft.provider = props.road?.provider ?? "";
  draft.model = props.road?.model ?? "";
  draft.effort = props.road?.effort ?? null;
  failure.value = "";
  void readModels(draft.provider);
}, { immediate: true });

async function save(): Promise<void> {
  saving.value = true;
  failure.value = "";
  try {
    await props.save(draft.provider === "" ? null : { provider: draft.provider, model: draft.model, effort: draft.effort });
    open.value = false;
  } catch (error) {
    failure.value = failureText(error, t("own_agents.error.failed"));
  } finally {
    saving.value = false;
  }
}
</script>
