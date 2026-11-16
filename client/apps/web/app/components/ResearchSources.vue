<template>
  <!-- The sources the research unit reads its categories' candidates from (docs/web.md, 「Research screen」), one row
       each, with the source added, changed and taken away. -->
  <!-- The sources are a tab of their own, which names them and holds their add, so the section carries no head. -->
  <section class="flex min-w-0 flex-col gap-3" :aria-label="$t('research.title.sources')">

    <ReadFailure
      v-if="!props.quiet"
      :failure="readFailure"
      :message="failureText(error, $t('research.error.sources_read_failed'))"
      :reading="status === 'pending'"
      @retry="refresh()"
    />

    <DataTableSkeleton v-if="!sources && !error" :headers="tableHeaders(columns)" :rows="3" :label="$t('research.status.sources_loading')" />

    <p v-else-if="sources && sources.length === 0" class="py-4 text-sm text-muted">{{ $t("research.status.no_sources") }}</p>

    <DataTable v-else-if="sources" :data="sources" :columns="columns">
      <template #id-cell="{ row }">
        <span :class="CELL_TEXT" class="ps-4 tabular-nums text-muted">{{ row.original.id }}</span>
      </template>

      <template #categoryName-cell="{ row }">
        <span :class="CELL_TEXT" class="font-mono text-highlighted">{{ row.original.categoryName }}</span>
      </template>

      <template #kind-cell="{ row }">
        <span :class="CELL_TEXT" class="text-highlighted">{{ sourceKindLabel($t, row.original.kind) }}</span>
      </template>

      <template #target-cell="{ row }">
        <span :class="CELL_TEXT" class="font-mono">
          <span class="break-all text-toned">{{ row.original.address }}</span>
          <span v-if="row.original.query !== null" class="break-all text-highlighted">{{ row.original.query }}</span>
        </span>
      </template>

      <template #filter-cell="{ row }">
        <span :class="CELL_TEXT" class="text-muted">
          <span v-if="row.original.filter.require.length > 0" class="break-words">{{ $t("research.label.filter_require", { words: wordsText(row.original.filter.require) }) }}</span>
          <span v-if="row.original.filter.exclude.length > 0" class="break-words">{{ $t("research.label.filter_exclude", { words: wordsText(row.original.filter.exclude) }) }}</span>
          <span v-if="row.original.filter.require.length === 0 && row.original.filter.exclude.length === 0">{{ $t("common.label.none") }}</span>
        </span>
      </template>

      <template #everyMinutes-cell="{ row }">
        <span :class="CELL_TEXT" class="tabular-nums text-highlighted">{{ everyText($t, row.original.everyMinutes, cadenceOf(row.original.categoryName)) }}</span>
      </template>

      <template #limit-cell="{ row }">
        <span :class="CELL_TEXT" class="tabular-nums text-highlighted">{{ $t("research.label.limit_value", { n: countText(row.original.limit) }) }}</span>
      </template>

      <template #readAt-cell="{ row }">
        <span :class="CELL_TEXT" class="tabular-nums text-muted">{{ row.original.readAt === null ? "—" : formatDayClock(toUnixSeconds(row.original.readAt)) }}</span>
      </template>

      <template #failureCount-cell="{ row }">
        <span :class="CELL_TEXT">
          <span v-if="row.original.failureCount === 0" class="text-muted">—</span>
          <span v-else class="tabular-nums text-error">{{ $t("research.label.failure_count", { n: countText(row.original.failureCount) }) }}</span>
          <span v-if="row.original.lastError !== null" class="break-words text-error">{{ row.original.lastError }}</span>
        </span>
      </template>

      <template #actions-cell="{ row }">
        <span :class="CELL_TEXT" class="flex-row items-center justify-end gap-1 pe-4">
          <UTooltip :text="$t('common.action.edit')">
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-material-symbols-edit-outline"
              :aria-label="$t('research.aria.edit_source_named', { id: row.original.id })"
              @click="openDialog(row.original)"
            />
          </UTooltip>
          <UTooltip :text="$t('common.action.delete')">
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-material-symbols-delete-outline"
              :loading="removing === row.original.id"
              :aria-label="$t('research.aria.delete_source_named', { id: row.original.id })"
              @click="void remove(row.original)"
            />
          </UTooltip>
        </span>
      </template>
    </DataTable>

    <ResearchSourceDialog v-model:open="dialogOpen" :source="editing" :categories="props.categories" @saved="saved" />
  </section>
</template>

<script setup lang="ts">
import { tableHeaders } from "bmo-ui/app/domain/column-widths";
import { failureText } from "bmo-ui/app/domain/errors";
import { useIsland } from "bmo-ui/app/domain/island";
import { useConfirm } from "~/domain/confirm";
import { countText } from "bmo-ui/app/domain/numbers";
import { formatDayClock, toUnixSeconds } from "bmo-ui/app/domain/time";
import { CELL_TEXT } from "~/domain/agent-settings";
import { useReadFailure } from "~/domain/events";
import { usePolling } from "~/domain/polling";
import { everyText, sourceKindLabel, wordsText } from "~/domain/research";

import type { ResearchCategoryView, ResearchSource } from "#shared/research";
import type { TableColumn } from "@nuxt/ui";

const props = defineProps<{
  // The categories the unit holds, a source's category among them, for the cadence a source without its own reads at.
  categories: readonly ResearchCategoryView[];
  // Whether the screen already says the unit does not answer, so this section says nothing more.
  quiet: boolean;
}>();

const { t } = useI18n();
const island = useIsland(t);
const askFirst = useConfirm();

// How often the sources are read again while the tab is seen: the clock the rest of the screen reads on.
const POLL_MS = 10_000;

const { data, error, refresh, status } = useFetch<{ items: ResearchSource[] }>("/api/research/sources", { key: "research-sources", lazy: true, server: false });

const sources = computed(() => data.value?.items ?? null);
const readFailure = useReadFailure({ failed: () => !!error.value, reading: () => status.value === "pending", reread: () => void refresh() });
const removing = ref<number | null>(null);
const dialogOpen = ref(false);
const editing = ref<ResearchSource | null>(null);

usePolling(() => {
  if (document.visibilityState === "visible" && !dialogOpen.value) void refresh();
}, POLL_MS);

// The columns the unit answers a source with. A figure it comes to answer stands as one more entry here.
const columns = computed<TableColumn<ResearchSource>[]>(() => [
  { accessorKey: "id", header: t("research.label.source_id"), meta: { class: { th: "w-16" } } },
  { accessorKey: "categoryName", header: t("research.label.category") },
  { accessorKey: "kind", header: t("research.label.kind") },
  { id: "target", header: t("research.label.source_target") },
  { id: "filter", header: t("research.label.filter") },
  { accessorKey: "everyMinutes", header: t("research.label.every") },
  { accessorKey: "limit", header: t("research.label.limit") },
  { accessorKey: "readAt", header: t("research.label.read_at") },
  { accessorKey: "failureCount", header: t("research.label.failures") },
  { id: "actions", header: "" }
]);

function cadenceOf(categoryName: string): number | null {
  return props.categories.find((one) => one.name === categoryName)?.cadenceMinutes ?? null;
}

function openDialog(source: ResearchSource | null): void {
  editing.value = source;
  dialogOpen.value = true;
}

// A new source, from the add the tab row holds.
function openAdd(): void {
  openDialog(null);
}

defineExpose({ openAdd });

function saved(): void {
  void refresh();
}

// A source taken away once its dialog is answered; what it turned up stays.
async function remove(source: ResearchSource): Promise<void> {
  const taken = await askFirst({
    title: t("research.message.source_delete_confirm", { id: source.id }),
    effect: t("research.message.source_delete_note"),
    confirm: t("common.action.delete")
  });

  if (!taken) return;

  removing.value = source.id;

  try {
    await $fetch(`/api/research/sources/${source.id}`, { method: "DELETE" });
    await refresh();
  } catch (failure) {
    island.fail(failure, t("research.error.source_delete_failed"));
  } finally {
    removing.value = null;
  }
}
</script>
