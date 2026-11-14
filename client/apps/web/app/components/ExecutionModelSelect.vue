<template>
  <div class="flex min-w-0 flex-wrap gap-2">
    <USelect :content="{ align: 'start' }" v-model="provider" :items="providers" value-key="value" class="w-full min-w-0 sm:w-36" :aria-label="$t('agents.aria.provider_of', { name: label ?? $t('common.label.model') })" />
    <USelectMenu :content="{ align: 'start' }" v-if="provider !== 'auto'" :model-value="selected" :items="items" value-key="value" class="w-full min-w-0 sm:w-64" :loading="loading" :disabled="providerOff" :aria-label="label ?? $t('common.label.model')" :placeholder="$t('agents.aria.choose_model')" @update:model-value="choose($event as string)" />
    <span v-if="providerOff" class="w-full text-sm text-toned">{{ $t("agents.error.provider_off") }}</span>
    <span v-if="error" class="w-full text-sm text-error">{{ error }}</span>
  </div>
</template>
<script setup lang="ts">
import { JOB_MODELS } from "#shared/config";
import { useProviders } from "~/domain/axes";
import { modeLabel } from "~/domain/status";

import type { AgentMode } from "#shared/types";
const { t } = useI18n();
// `line` is the line the run goes out on, which a provider's program must carry to be offered.
const props = defineProps<{ modelValue?: string | null; label?: string; line: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const { data: carried } = useProviders();
// Auto, then every provider the agency carries whose program carries the line, in the agency's order and under the
// pack's word for it, a turned-off one standing disabled (the agency's `GET /providers`). Until the read lands, the
// provider already chosen stands under the label the console knows it by, so the choice never reads as empty before
// it has been read.
const providers = computed(() => [
  { value: "auto", label: t("common.label.auto"), disabled: false },
  ...(carried.value
    ? carried.value.filter(one => one.lines.length === 0 || one.lines.includes(props.line)).map(one => ({ value: one.name, label: one.label, disabled: !one.enabled }))
    : provider.value === "auto" ? [] : [{ value: provider.value, label: modeLabel(t, provider.value as AgentMode), disabled: false }])
]);
const providerOff = computed(() => providers.value.some(one => one.value === provider.value && one.disabled));
const provider = ref(props.modelValue?.split("::")[0] && props.modelValue.includes("::") ? props.modelValue.split("::")[0]! : props.modelValue && props.modelValue !== "auto" ? "claude-code" : "auto");
watch(() => props.modelValue, value => { provider.value = value?.includes("::") ? value.split("::")[0]! : value && value !== "auto" ? "claude-code" : "auto"; });
const selected = computed(() => {
  if (!props.modelValue || props.modelValue === "auto") return undefined;
  if (props.modelValue.includes("::")) return props.modelValue.split("::")[0] === provider.value ? props.modelValue.split("::")[1] : undefined;
  return provider.value === "claude-code" ? props.modelValue : undefined;
});
const items = ref<{value: string; label: string}[]>(JOB_MODELS.map(value => ({ value, label: value })));
const loading = ref(false), error = ref("");
let generation = 0;
watch(provider, async value => {
  const current = ++generation;
  error.value = "";
  items.value = [];
  loading.value = false;
  if (value === "auto") { emit("update:modelValue", "auto"); return; }
  if (value === "claude-code") { items.value = JOB_MODELS.map(value => ({ value, label: value })); return; }
  loading.value = true;
  try {
    // Every provider but the Claude line answers the models it holds, the ones a road may name.
    const held = await $fetch<import("#shared/axes").ProviderModelsView>(`/api/provider-models/${encodeURIComponent(value)}`);
    if (current === generation) items.value = held.models.map(row => ({ value: row.id, label: row.id }));
  } catch { if (current === generation) error.value = t("agents.error.models_load_failed"); }
  finally { if (current === generation) loading.value = false; }
}, { immediate: true });
function choose(value: string) { if (providerOff.value) return; emit("update:modelValue", `${provider.value}::${value}`); }
</script>
