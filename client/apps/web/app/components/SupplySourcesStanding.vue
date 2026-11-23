<template>
  <!-- The supply section's agent supply sources (docs/web.md, 「Settings」, the supply section): the three sources a run
       of the reader's takes, each with whether it stands open for them and, where a unit above or the platform decided
       it, who did. The reader writes none of them, so no row carries a control. -->
  <SettingsGroup :title="$t('org_agents.title.sources')" data-own-sources>
    <p v-if="rows === null && failure !== ''" role="alert" class="py-3 text-sm text-error">{{ failure }}</p>
    <ContentSkeleton v-else-if="rows === null" :rows="3" list-class="flex flex-col divide-y divide-default" :label="$t('supply.status.loading')">
      <div class="flex items-center gap-4 py-3">
        <SkeletonLine width="w-1/3" />
        <SkeletonLine class="ms-auto" width="w-12" />
      </div>
    </ContentSkeleton>
    <template v-else>
      <SettingsRow v-for="row in rows" :key="row.source" :label="sourceName(row.source)" :description="decidedLine(t, row.decided) ?? ''" :data-own-source="row.source" :data-own-source-decided="row.decided === null ? undefined : ''">
        <span :class="['text-sm', row.on ? 'text-highlighted' : 'text-muted']">{{ row.on ? $t("org_agents.label.state_on") : $t("org_agents.label.state_off") }}</span>
      </SettingsRow>
    </template>
  </SettingsGroup>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import { decidedLine } from "~/domain/chain-decided";

import type { OwnSupplySource } from "#shared/organisation-agents";
import type { SourceKind } from "#shared/organisation-supply";

const { t } = useI18n();

// Each source's word, from the pack whole.
const SOURCE_WORDS: Readonly<Record<SourceKind, string>> = {
  personal: "org_agents.label.source_personal",
  organisation: "org_agents.label.source_organisation",
  platform: "org_agents.label.source_platform"
};

const rows = ref<OwnSupplySource[] | null>(null);
const failure = ref("");

function sourceName(source: SourceKind): string {
  return t(SOURCE_WORDS[source]);
}

onMounted(async () => {
  try {
    rows.value = await $fetch<OwnSupplySource[]>("/api/account/supply-sources");
  } catch (error) {
    failure.value = failureText(error, t("supply.error.read_failed"));
  }
});
</script>
