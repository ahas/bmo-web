<template>
  <!-- How many co-workers of each tier may be alive on each provider, as the agency's pool holds them: a
       co-worker tier to a row, a provider to a column, only those the pool has places for. A cell's number box
       sets that one limit. -->
  <section class="flex min-w-0 flex-col" aria-labelledby="coworker-limits-title">
    <div class="flex min-h-12 items-center gap-2 border-y border-default px-4 py-2">
      <h2 id="coworker-limits-title" class="text-base font-semibold text-highlighted">{{ $t("agents.title.coworker_limits") }}</h2>
    </div>

    <DataTableSkeleton v-if="board === null && !failed" :headers="tableHeaders(columns)" :rows="4" :label="$t('agents.status.limits_loading')" />

    <ReadFailure class="mx-4 my-4 w-auto" :failure="readFailure" :message="$t('agents.error.limits_read_failed')" :reading="status === 'pending'" @retry="refresh()" />

    <template v-if="board !== null">
      <DataTable :data="rows" :columns="columns">
        <template #tier-cell="{ row }">
          <span :id="settingsAnchor(`pool-${row.original.tier}`)" :class="CELL_TEXT" class="ps-4 font-medium text-highlighted">
            <SearchText :text="row.original.tier" :query="props.query" />
          </span>
        </template>

        <template v-for="name in providerColumns" :key="name" #[`${name}-header`]>
          {{ modeLabel($t, name) }}
        </template>

        <template v-for="name in providerColumns" :key="name" #[`${name}-cell`]="{ row }">
          <SettingsInputCell
            v-if="bucketOf(row.original.tier, name) !== null"
            :value="bucketOf(row.original.tier, name)!.capacity"
            :label="$t('agents.aria.limit_of', { mode: modeLabel($t, name), tier: row.original.tier })"
            :min="0"
            :step="1"
            :check="limitFault"
            :save="(text: string) => save(name, row.original.tier, text)"
          >
            <span class="flex items-center gap-2">
              <UIcon
                :name="bucketOf(row.original.tier, name)!.capacity === 0 ? 'i-material-symbols-block' : 'i-material-symbols-check-circle-outline'"
                class="size-4"
                :class="bucketOf(row.original.tier, name)!.capacity === 0 ? 'text-warning' : 'text-success'"
              />
              <span class="font-medium tabular-nums text-highlighted">{{ bucketOf(row.original.tier, name)!.capacity.toLocaleString("ko-KR") }}</span>
            </span>
            <span class="tabular-nums text-muted">{{ countsText(bucketOf(row.original.tier, name)!) }}</span>
          </SettingsInputCell>
          <span v-else :class="CELL_TEXT" class="text-muted">—</span>
        </template>
      </DataTable>
    </template>
  </section>
</template>

<script setup lang="ts">
import { tableHeaders } from "bmo-ui/app/domain/column-widths";
import { failureText } from "bmo-ui/app/domain/errors";
import { CELL_TEXT, PROVIDER_COLUMNS, ROLE_POOL_READS, settingsAnchor } from "~/domain/agent-settings";
import { useReadFailure } from "~/domain/events";
import { usePolling } from "~/domain/polling";
import { modeLabel } from "~/domain/status";

import type { CoworkerTier, PoolBoard, PoolBoardBucket, TierProvider } from "#shared/agency";
import type { TableColumn } from "@nuxt/ui";

const props = withDefaults(defineProps<{ query?: string }>(), { query: "" });

// How often the pool's counts are read again while the tab stands and is seen.
const POLL_MS = 5_000;

const { t } = useI18n();
const { data, status, refresh } = useFetch<PoolBoard>("/api/agency/pool", { key: "coworker-pool", lazy: true, server: false });

// What was last read stays standing when a reread fails; only a first read that fails says so.
const board = computed(() => data.value ?? null);
const failed = computed(() => status.value === "error");
const readFailure = useReadFailure({ failed: () => board.value === null && failed.value, reading: () => status.value === "pending", reread: () => void refresh() });

usePolling(() => {
  if (document.visibilityState === "visible") void refresh();
}, POLL_MS);

// The tiers and the providers in the order the pool lists its places; until it is read, every
// provider holds a column of the skeleton.
const rows = computed(() => [...new Set((board.value?.buckets ?? []).map((bucket) => bucket.tier))].map((tier) => ({ tier })));
const providerColumns = computed<TierProvider[]>(() => board.value === null
  ? [...PROVIDER_COLUMNS]
  : [...new Set(board.value.buckets.map((bucket) => bucket.provider))]);

const columns = computed<TableColumn<{ tier: CoworkerTier }>[]>(() => [
  { accessorKey: "tier", header: t("agents.label.tier"), meta: { class: { th: "w-28" } } },
  ...providerColumns.value.map((name) => ({ id: name, header: modeLabel(t, name) }))
]);

function bucketOf(tier: CoworkerTier, provider: TierProvider): PoolBoardBucket | null {
  return board.value?.buckets.find((bucket) => bucket.tier === tier && bucket.provider === provider) ?? null;
}

// What a cell says under its limit: running, held and waiting, as three short counts.
function countsText(bucket: PoolBoardBucket): string {
  return t("agents.label.place_counts", {
    active: bucket.tiles.filter((tile) => tile.state === "working").length.toLocaleString("ko-KR"),
    reserved: bucket.tiles.filter((tile) => tile.state === "held").length.toLocaleString("ko-KR"),
    waiting: bucket.waiting.length.toLocaleString("ko-KR")
  });
}

// A limit is a whole number from 0, which closes the place; the most it may be is the agency's policy's to say, and a
// number past it is the agency's refusal under the box.
function limitFault(text: string): string | null {
  return /^\d+$/.test(text.trim()) ? null : t("agents.error.limit_whole");
}

// One place's limit set, then the pool, the roles, the agent list and the tiers read again; the agency's refusal,
// in the pack's words, stays under the box.
async function save(provider: TierProvider, tier: CoworkerTier, text: string): Promise<string | null> {
  try {
    await $fetch("/api/agency/pool/limits", { method: "PATCH", body: { provider, tier, capacity: Number(text.trim()) } });
    await refreshNuxtData(ROLE_POOL_READS);

    return null;
  } catch (failure) {
    return failureText(failure, t("common.error.save_failed"));
  }
}
</script>
