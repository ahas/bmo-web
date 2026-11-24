<template>
  <!-- The start guide's default model step (docs/web.md, 「The start guide」): the road of the supervisor that answers rooms
       naming none — a provider switched on that can answer, then a model it holds — both opening on the road as it
       stands, and written onto that supervisor's road as the next step is taken. -->
  <div class="flex flex-col gap-4" data-guide-model>
    <ContentSkeleton v-if="reading" :rows="2" :label="$t('guide.status.loading')">
      <SkeletonLine width="w-1/2" />
    </ContentSkeleton>
    <template v-else>
      <UFormField :label="$t('guide.label.provider')" name="provider">
        <ChoiceSelect v-model="provider" :items="providerItems" value-key="value" class="w-full" :aria-label="$t('guide.label.provider')" data-guide-model-provider />
      </UFormField>
      <UFormField :label="$t('guide.label.model')" name="model">
        <ChoiceSelect v-model="model" :items="modelItems" value-key="value" class="w-full" :loading="modelsReading" :aria-label="$t('guide.label.model')" data-guide-model-model />
      </UFormField>
    </template>
    <p v-if="failure !== ''" role="alert" class="break-words text-sm text-error" data-guide-failure>{{ failure }}</p>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import type { DefaultAnswererView, ProviderModelsView, ProviderView, SupervisorView } from "#shared/axes";

const done = defineModel<boolean>("done", { required: true });

const { t } = useI18n();
const reading = ref(true);
const modelsReading = ref(false);
const failure = ref("");
const supervisor = ref<string | null>(null);
const providers = ref<ProviderView[]>([]);
const models = ref<string[]>([]);
const provider = ref("");
const model = ref("");
// The road as it stood, which going on leaves unwritten where nothing was changed.
const standing = ref({ provider: "", model: "" });

const providerItems = computed(() => providers.value.map((one) => ({ value: one.name, label: one.label })));
const modelItems = computed(() => models.value.map((one) => ({ value: one, label: one })));

watch([provider, model], () => {
  done.value = supervisor.value !== null && provider.value !== "" && model.value !== "";
});

// The models the provider chosen holds; the model standing stays where the provider holds it, else the first.
async function readModels(chosen: string, keep: string): Promise<void> {
  modelsReading.value = true;
  try {
    models.value = (await $fetch<ProviderModelsView>(`/api/provider-models/${encodeURIComponent(chosen)}`)).models.map((one) => one.id);
    model.value = models.value.includes(keep) ? keep : (models.value[0] ?? "");
  } catch (error) {
    models.value = [];
    model.value = "";
    failure.value = failureText(error, t("guide.error.failed"));
  } finally {
    modelsReading.value = false;
  }
}

watch(provider, (chosen, before) => {
  if (before !== "" && chosen !== before && chosen !== "") void readModels(chosen, "");
});

/** The road written onto the default answerer; true where it went through. */
async function commit(): Promise<boolean> {
  if (supervisor.value === null) return false;
  if (provider.value === standing.value.provider && model.value === standing.value.model) return true;

  failure.value = "";
  try {
    await $fetch(`/api/supervisors/${encodeURIComponent(supervisor.value)}`, { method: "PATCH", body: { road: { provider: provider.value, model: model.value } } });

    return true;
  } catch (error) {
    failure.value = failureText(error, t("guide.error.failed"));

    return false;
  }
}

defineExpose({ commit });

onMounted(async () => {
  try {
    const [answerer, listed] = await Promise.all([$fetch<DefaultAnswererView>("/api/default-answerer"), $fetch<ProviderView[]>("/api/providers")]);
    const held = await $fetch<SupervisorView>(`/api/supervisors/${encodeURIComponent(answerer.supervisor)}`);

    supervisor.value = answerer.supervisor;
    providers.value = listed.filter((one) => one.enabled && one.reason === null);
    provider.value = providers.value.some((one) => one.name === held.road?.provider) ? (held.road?.provider ?? "") : (providers.value[0]?.name ?? "");
    if (provider.value !== "") await readModels(provider.value, held.road?.model ?? "");
    standing.value = { provider: held.road?.provider ?? "", model: held.road?.model ?? "" };
  } catch (error) {
    failure.value = failureText(error, t("guide.error.read_failed"));
  } finally {
    reading.value = false;
  }
});
</script>
