<template>
  <!-- How much of its model's window a session may fill before it is folded, for every provider at every tier:
       a tier to a row, a provider to a column, as the agency lists them. A cell's number box sets that one ratio,
       in percent. -->
  <section class="flex min-w-0 flex-col" aria-labelledby="fold-ratios-title">
    <div class="flex min-h-12 flex-col justify-center gap-0.5 border-y border-default px-4 py-2">
      <h2 id="fold-ratios-title" class="text-base font-semibold text-highlighted">{{ $t("agents.title.fold_ratios") }}</h2>
      <p class="text-sm text-muted">{{ $t("agents.label.fold_ratios_help") }}</p>
    </div>

    <DataTableSkeleton v-if="!data && !error" :headers="tableHeaders(columns)" :rows="6" :label="$t('agents.status.fold_ratios_loading')" />
    <ReadFailure
      v-else-if="error && !data"
      class="mx-4 my-4 w-auto"
      :failure="readFailure"
      :message="failureText(error, $t('agents.error.fold_ratios_read_failed'))"
      :reading="status === 'pending'"
      @retry="refresh()"
    />

    <DataTable v-if="data" :data="rows" :columns="columns">
      <template #tier-cell="{ row }">
        <span :id="settingsAnchor(`fold-${row.original.tier}`)" :class="CELL_TEXT" class="ps-4 font-medium text-highlighted">
          <SearchText :text="row.original.tier" :query="props.query" />
        </span>
      </template>

      <template v-for="name in providerNames" :key="name" #[`${name}-header`]>
        {{ modeLabel($t, name) }}
      </template>

      <template v-for="name in providerNames" :key="name" #[`${name}-cell`]="{ row }">
        <SettingsInputCell
          v-if="foldRatioAt(data, row.original.tier, name) !== null"
          :value="foldPercent(foldRatioAt(data, row.original.tier, name)!.ratio)"
          :label="$t('agents.aria.fold_ratio_of', { tier: row.original.tier, provider: modeLabel($t, name) })"
          :min="FOLD_PERCENT_MIN"
          :max="FOLD_PERCENT_MAX"
          :step="1"
          :check="(text: string) => foldPercentFault($t, text)"
          :save="(text: string) => save(name, row.original.tier, text)"
        >
          <span class="font-medium tabular-nums text-highlighted">{{ foldPercentText($t, foldRatioAt(data, row.original.tier, name)!.ratio) }}</span>
          <SearchText class="text-muted" :text="foldSourceText($t, foldRatioAt(data, row.original.tier, name)!.source)" :query="props.query" />
        </SettingsInputCell>
        <span v-else :class="CELL_TEXT" class="text-muted">—</span>
      </template>
    </DataTable>
  </section>
</template>

<script setup lang="ts">
import { tableHeaders } from "bmo-ui/app/domain/column-widths";
import { failureText } from "bmo-ui/app/domain/errors";
import { CELL_TEXT, PROVIDER_COLUMNS, settingsAnchor } from "~/domain/agent-settings";
import { useReadFailure } from "~/domain/events";
import { FOLD_PERCENT_MAX, FOLD_PERCENT_MIN, foldPercent, foldPercentFault, foldPercentText, foldRatioAt, foldRatioChange, foldSourceText } from "~/domain/fold-ratios";
import { modeLabel } from "~/domain/status";

import type { FoldRatiosView, ModelTier, TierProvider } from "#shared/agency";
import type { TableColumn } from "@nuxt/ui";

const props = withDefaults(defineProps<{ query?: string }>(), { query: "" });
const { t } = useI18n();

// The read is the browser's alone, and the place the grid keeps stands from the first frame, as the tier
// table's does; the page's search reads the same answer under the same key.
const { data, error, refresh, status } = useFetch<FoldRatiosView>("/api/fold-ratios", { key: "fold-ratios", server: false, lazy: true });
const readFailure = useReadFailure({ failed: () => !!error.value && !data.value, reading: () => status.value === "pending", reread: () => void refresh() });

const rows = computed(() => (data.value?.tiers ?? []).map((tier) => ({ tier })));

// The providers the agency lists, each a column; before the list lands, every provider the console carries,
// so the skeleton already has the grid's columns.
const providerNames = computed<TierProvider[]>(() => data.value?.providers ?? [...PROVIDER_COLUMNS]);

const columns = computed<TableColumn<{ tier: ModelTier }>[]>(() => [
  { accessorKey: "tier", header: t("agents.label.tier"), meta: { class: { th: "w-28" } } },
  ...providerNames.value.map((name) => ({ id: name, header: modeLabel(t, name) }))
]);

// One ratio set from the percent typed, the grid read again once the agency took it; its refusal, in the
// pack's words, stays under the box.
async function save(provider: TierProvider, tier: ModelTier, text: string): Promise<string | null> {
  try {
    await $fetch("/api/fold-ratios", { method: "POST", body: foldRatioChange(provider, tier, text) });
    await refresh();

    return null;
  } catch (failure) {
    return failureText(failure, t("common.error.save_failed"));
  }
}

defineExpose({ refresh });
</script>
