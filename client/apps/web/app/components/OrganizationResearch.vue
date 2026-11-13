<template>
  <!-- The research tab of the organisation settings screen (docs/web.md, 「Organisation settings」, the research tab):
       the supervisor a search or browse run no supervisor delegated writes its brain for, as the agency's own
       settings hold it. A choice is saved as it is made; one the agency refused goes back to what it holds, the
       reason under the row. -->
  <div class="flex flex-col gap-6">
    <ContentSkeleton v-if="chosen === null && failure === ''" :rows="1" listClass="flex flex-col divide-y divide-default" :label="$t('settings.status.research_loading')">
      <div class="flex items-center gap-4 py-3">
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <SkeletonLine width="w-1/3" />
          <SkeletonLine width="w-1/2" />
        </div>
        <SkeletonBar class="h-8 w-48 shrink-0 rounded-md" />
      </div>
    </ContentSkeleton>

    <div v-else-if="chosen === null" class="flex flex-col items-end gap-3">
      <UAlert class="w-full" color="error" variant="subtle" :description="failure" />
      <UButton color="neutral" variant="subtle" icon="i-material-symbols-refresh" :label="$t('common.action.refresh')" @click="read" />
    </div>

    <template v-else>
      <SettingsGroup>
        <SettingsRow :label="$t('settings.label.research_supervisor')" :description="$t('settings.label.research_supervisor_note')">
          <USelect
            :model-value="chosen"
            :items="items"
            value-key="value"
            class="w-48"
            :disabled="busy"
            :aria-label="$t('settings.label.research_supervisor')"
            data-research-supervisor
            @update:model-value="(value: string) => void choose(value)"
          />
        </SettingsRow>
      </SettingsGroup>
      <p v-if="failure !== ''" role="alert" class="break-words text-sm text-error">{{ failure }}</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import type { ResearchSupervisorView, SupervisorView } from "#shared/axes";

const { t } = useI18n();

// No supervisor stands after every supervisor, as a value no supervisor's name can be: a name starts with a letter, and a
// list's value is never empty.
const NONE = "-";

const supervisors = ref<SupervisorView[]>([]);
const chosen = ref<string | null>(null);
const busy = ref(false);
const failure = ref("");

// Every supervisor under its own label with its name under it, then none.
const items = computed(() => [
  ...supervisors.value.map((one) => ({ label: one.label, value: one.name, description: one.name })),
  { label: t("settings.label.supervisor_none"), value: NONE }
]);

async function read(): Promise<void> {
  failure.value = "";

  try {
    const [listed, held] = await Promise.all([$fetch<SupervisorView[]>("/api/supervisors"), $fetch<ResearchSupervisorView>("/api/research-supervisor")]);

    supervisors.value = listed;
    chosen.value = held.supervisor ?? NONE;
  } catch (error) {
    failure.value = failureText(error, t("settings.error.research_read_failed"));
  }
}

// The choice saved; the answer is how the agency then holds it.
async function choose(value: string): Promise<void> {
  const before = chosen.value;

  busy.value = true;
  failure.value = "";
  chosen.value = value;

  try {
    const held = await $fetch<ResearchSupervisorView>("/api/research-supervisor", { method: "PUT", body: { supervisor: value === NONE ? null : value } });

    chosen.value = held.supervisor ?? NONE;
  } catch (error) {
    chosen.value = before;
    failure.value = failureText(error, t("settings.error.research_write_failed"));
  } finally {
    busy.value = false;
  }
}

onMounted(() => void read());
</script>
