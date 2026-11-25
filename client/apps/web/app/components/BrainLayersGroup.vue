<template>
  <!-- The read layers on the organisation screen's org memory tab (docs/web.md, 「System and organisation」, the org memory tab): whether the
       base and the org brains are read for the people under the node, each a switch that turns the layer off here or
       on again to follow above, beside what the units below may do with it. A layer off above stands off and
       disabled; the group stands only where the chain answers the reader the node's link. -->
  <SettingsGroup v-if="!hidden" :title="$t('org_memory.label.layers')" data-brain-layers>
    <ContentSkeleton v-if="view === null && failure === ''" :rows="2" list-class="flex flex-col divide-y divide-default" :label="$t('org_memory.status.loading')">
      <div class="flex items-center gap-4 py-3">
        <SkeletonLine width="w-1/3" />
        <SkeletonBar class="ms-auto h-8 w-40 shrink-0 rounded-md" />
        <SkeletonBar class="h-5 w-9 shrink-0 rounded-full" />
      </div>
    </ContentSkeleton>

    <FailedRead v-else-if="view === null" class="py-3" :message="failure" :reading="reading" @retry="read" />

    <template v-else>
      <template v-for="layer in BRAIN_LAYERS" :key="layer">
        <SettingsRow v-if="view[layer] !== null" :label="$t(LABELS[layer])" :description="lineOf(view[layer]!)" :data-brain-layer="layer">
          <div class="flex flex-wrap items-center justify-end gap-2">
            <ChoiceSelect
              :model-value="view[layer]!.delegation"
              :items="delegations"
              value-key="value"
              class="w-40"
              :disabled="busy !== '' || !view[layer]!.writable || view[layer]!.lockedBy !== null"
              :aria-label="$t('org_agents.aria.delegation', { name: $t(LABELS[layer]) })"
              data-brain-layer-delegation
              @update:model-value="(value: unknown) => void change(layer, { delegation: value as ChainDelegation })"
            />
            <USwitch
              :model-value="view[layer]!.read"
              :loading="busy === layer"
              :disabled="busy !== '' || !view[layer]!.writable || view[layer]!.closedAbove || view[layer]!.lockedBy !== null"
              :aria-label="$t(LABELS[layer])"
              data-brain-layer-switch
              @update:model-value="(on: boolean) => void change(layer, { value: on ? null : false })"
            />
          </div>
        </SettingsRow>
      </template>
      <p v-if="failure !== ''" role="alert" class="break-words py-3 text-sm text-error">{{ failure }}</p>
    </template>
  </SettingsGroup>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import { decidedLine } from "~/domain/chain-decided";

import { BRAIN_LAYERS } from "#shared/org-memory";

import type { BrainLayer, BrainLayerSetting, BrainLayersView } from "#shared/org-memory";
import type { ChainDelegation } from "#shared/organisation-supply";

interface Props {
  // The unit whose link is shown, or null for the platform's.
  unit: number | null;
}

const props = defineProps<Props>();

const { t } = useI18n();

const LABELS: Readonly<Record<BrainLayer, string>> = {
  global: "org_memory.label.layer_global",
  organisation: "org_memory.label.layer_organisation"
};

const view = ref<BrainLayersView | null>(null);
const failure = ref("");
const reading = ref(false);
// The layer whose change is under way, or the empty word.
const busy = ref("");
// Whether the chain answers the reader no link of the node: the group then stands not at all.
const hidden = ref(false);

const address = computed(() => (props.unit === null ? "/api/organization/platform/brain-layers" : `/api/organization/units/${props.unit}/brain-layers`));

const delegations = computed(() => [
  { value: "inherit", label: t("org_agents.label.delegation_inherit") },
  { value: "allow", label: t("org_agents.label.delegation_allow") },
  { value: "lock", label: t("org_agents.label.delegation_lock") }
]);

// What a layer's row says under its name: who locks it or turned it off above, or nothing while it stands by its own
// word or follows a layer read.
function lineOf(setting: BrainLayerSetting): string {
  if (setting.lockedBy !== null) return decidedLine(t, setting.locker) ?? t("org_agents.label.decided_unit");
  if (setting.closedAbove) return decidedLine(t, setting.closer) ?? t("org_agents.label.decided_unit");

  return "";
}

async function read(): Promise<void> {
  reading.value = true;

  try {
    view.value = await $fetch<BrainLayersView>(address.value);
    failure.value = "";
    hidden.value = false;
  } catch (error) {
    if ((error as { statusCode?: number } | null)?.statusCode === 403) hidden.value = true;
    else failure.value = failureText(error, t("org_memory.error.read_failed"));
  } finally {
    reading.value = false;
  }
}

// One change written on the chain as the reader, and the group read again; a refusal is said under it.
async function change(layer: BrainLayer, asked: { value?: false | null; delegation?: ChainDelegation }): Promise<void> {
  busy.value = layer;
  failure.value = "";

  try {
    await $fetch(address.value, { method: "PUT", body: { layer, ...asked } });
  } catch (error) {
    failure.value = failureText(error, t("org_memory.error.failed"));
  } finally {
    busy.value = "";
  }

  const refused = failure.value;

  await read();
  if (refused !== "") failure.value = refused;
}

onMounted(() => watch(address, () => void read(), { immediate: true }));
</script>
