<template>
  <!-- A supervisor's road as one field of a form (docs/web.md, 「Agent management screen」; the agency's
       docs/supervisors.md): its provider over its fields, each under its own label — its model, its effort, its
       thinking and, on the registry's provider, its answer ceiling. A field the form does not take stands out of it.
       Every change waits for the form's one save, and a refusal stands under the field it names. -->
  <div class="flex min-w-0 flex-col gap-2">
    <UFormField :label="$t('agents.label.agent_provider')" name="provider" :error="errorAt('provider')" class="min-w-0 sm:w-1/2">
      <USelect
        :model-value="road.provider === '' ? undefined : road.provider"
        :items="providerItems"
        value-key="value"
        class="w-full min-w-0"
        :disabled="props.disabled"
        :aria-label="$t('agents.label.agent_provider')"
        @update:model-value="(value: string) => pickProvider(value)"
      />
    </UFormField>

    <!-- The road's fields, each under its own label: the model takes what is left, every other field its own width,
         side by side from the small breakpoint up. -->
    <div v-if="road.provider !== ''" class="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start">
      <UFormField :label="$t('common.label.model')" name="model" :error="errorAt('model')" class="min-w-0 sm:flex-1">
        <USelect
          :model-value="road.model === '' ? undefined : road.model"
          :items="modelItems"
          value-key="value"
          class="w-full min-w-0"
          :loading="models.reading"
          :disabled="props.disabled"
          :aria-label="$t('common.label.model')"
          @update:model-value="(value: string) => change({ model: value, effort: keptEffort(value) })"
        />
      </UFormField>
      <template v-if="props.whole">
        <UFormField v-if="effortItems.length > 0" :label="$t('agents.label.effort')" name="effort" :error="errorAt('effort')" class="sm:w-28 sm:shrink-0">
          <USelect
            :model-value="road.effort ?? undefined"
            :items="effortItems"
            value-key="value"
            class="w-full"
            :disabled="props.disabled"
            :aria-label="$t('agents.label.effort')"
            @update:model-value="(value: string) => change({ effort: value })"
          />
        </UFormField>
        <UFormField :label="$t('agents.label.thinking')" name="thinking" :error="errorAt('thinking')" class="sm:w-32 sm:shrink-0">
          <USelect
            :model-value="thinkingShown"
            :items="thinkingItems"
            value-key="value"
            class="w-full"
            :disabled="props.disabled"
            :aria-label="$t('agents.label.thinking')"
            @update:model-value="(value: string) => change({ thinking: value === thinkingDeclared ? null : value })"
          />
        </UFormField>
        <UFormField v-if="registered" :label="$t('agents.label.answer_ceiling')" name="answerTokens" :error="errorAt('answerTokens')" class="sm:shrink-0">
          <NumberInput
            :model-value="road.answerTokens ?? undefined"
            :min="1"
            :step="1024"
            :digits="13"
            :placeholder="ceilingPlaceholder"
            :aria-label="$t('agents.label.answer_ceiling')"
            :disabled="props.disabled"
            @update:model-value="(value: number | null | undefined) => change({ answerTokens: value ?? null })"
          />
        </UFormField>
      </template>
    </div>

    <!-- A supervisor that runs as the owner's own user, on a provider whose engine is not the owner's: what its files
         and shell read can go to that provider (the agency's docs/supervisors.md, 「What confines a session allowed
         files」). A state of the form, which holds nothing back from its save. -->
    <p v-if="outsideProvider !== null" role="note" class="whitespace-pre-line break-words break-keep text-sm text-warning">{{ $t("agents.message.road_outside_owner", { provider: outsideProvider }) }}</p>
    <p v-if="staleText !== ''" class="text-sm text-muted">{{ staleText }}</p>
    <p v-if="models.failure !== null" role="alert" class="break-words text-sm text-error">{{ models.failure }}</p>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { formatStamp } from "bmo-ui/app/domain/time";

import { ceilingDefault, effortChoices, markedDefault, thinkingDefault, useProviderModels, useProviders } from "~/domain/axes";

import type { RoadView } from "#shared/axes";

interface Props {
  // The line the supervisor's program carries, which a provider's program must carry to be offered.
  line: string;
  // Whether the form takes the whole road, or its provider and model alone.
  whole?: boolean;
  // A refusal the last save brought back, under the field it names.
  refusal?: { field: string | null; text: string } | null;
  disabled?: boolean;
  // Whether the supervisor the road is for runs as the owner's own user on this machine.
  runsAsOwner?: boolean;
}

const props = withDefaults(defineProps<Props>(), { whole: true, refusal: null, disabled: false, runsAsOwner: false });
// A road whose provider is empty names none yet.
const road = defineModel<RoadView>({ required: true });

const { t } = useI18n();
const { data: providers } = useProviders();
const held = useProviderModels();

const models = computed(() => held.stateOf(road.value.provider).value);
const provider = computed(() => providers.value?.find((one) => one.name === road.value.provider));
const registered = computed(() => provider.value?.registered === true);
// The word of the provider picked where its engine is not the owner's own and the supervisor runs as the owner's user;
// none otherwise, and none while the provider list is not read.
const outsideProvider = computed(() => (props.runsAsOwner && provider.value !== undefined && !provider.value.ownersEngine ? provider.value.label : null));

function errorAt(field: string): string | undefined {
  return props.refusal?.field === field ? props.refusal.text : undefined;
}

// Every provider whose program carries the line; one that cannot answer now stands with its reason.
const providerItems = computed(() =>
  (providers.value ?? [])
    .filter((one) => one.lines.length === 0 || one.lines.includes(props.line))
    .map((one) => ({ label: one.label, value: one.name, ...(one.reason === null ? {} : { description: one.reason }) }))
);

// The provider's models are read as it first stands in the field.
watch(() => road.value.provider, (name) => {
  if (name !== "") void held.read(name, (error) => failureText(error, t("agents.error.provider_models_read_failed")));
}, { immediate: true });

// A provider picked stands on the first model its catalogue serves once that is read, with nothing of the one before.
function pickProvider(name: string): void {
  if (name === road.value.provider) return;

  road.value = { provider: name, model: "", effort: null, thinking: null, answerTokens: null };
}

watch(() => `${road.value.provider}:${road.value.model}:${models.value.view === null ? 0 : 1}`, () => {
  if (road.value.provider === "" || road.value.model !== "") return;

  const first = models.value.view?.models.find((one) => one.inService !== false) ?? models.value.view?.models[0];

  if (first !== undefined) change({ model: first.id });
});

// The models the provider holds, the catalogue's superseded generations marked; one the road names that the list does
// not carry still stands as its own choice.
const modelItems = computed(() => {
  const items = (models.value.view?.models ?? []).map((one) => ({ label: one.id, value: one.id, ...(one.inService === false ? { description: t("agents.label.model_superseded") } : {}) }));

  return road.value.model === "" || items.some((one) => one.value === road.value.model) ? items : [{ label: road.value.model, value: road.value.model }, ...items];
});

const effortItems = computed(() => effortChoices(provider.value, models.value.view, road.value.model).map((level) => ({ label: level, value: level })));

// A model chosen keeps the effort set where it takes it, and lets it go where it does not.
function keptEffort(model: string): string | null {
  return road.value.effort !== null && effortChoices(provider.value, models.value.view, model).includes(road.value.effort) ? road.value.effort : null;
}

// The thinking default the model declares, as the switch's word: none where it declares none.
const thinkingDeclared = computed<"on" | "off" | null>(() => {
  const declared = thinkingDefault(models.value.view, road.value.model);

  return declared === null ? null : declared ? "on" : "off";
});

// On and off, the one equal to the model's declared default marked as it.
const thinkingItems = computed(() => [
  { label: markedDefault(t, t("agents.label.switch_on"), thinkingDeclared.value === "on"), value: "on" },
  { label: markedDefault(t, t("agents.label.switch_off"), thinkingDeclared.value === "off"), value: "off" }
]);

// A road that leaves thinking to the provider stands at the model's declared default, and picking that default leaves
// it so.
const thinkingShown = computed(() => road.value.thinking ?? thinkingDeclared.value ?? undefined);

// An emptied ceiling is the registration's own, which its placeholder names.
const ceilingPlaceholder = computed(() => {
  const declared = ceilingDefault(models.value.view, road.value.model);

  return declared === null ? undefined : markedDefault(t, declared.toLocaleString("ko-KR"), true);
});

const staleText = computed(() => {
  const at = models.value.view?.staleReadAt ?? null;

  return at === null ? "" : t("agents.label.models_stale", { time: formatStamp(Math.floor(at / 1000)) });
});

function change(part: Partial<RoadView>): void {
  road.value = { ...road.value, ...part };
}
</script>
