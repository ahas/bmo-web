<template>
  <!-- The research supervisor on the research screen's settings tab (docs/web.md, 「Research screen」, its settings
       tab): the supervisor a search or browse run no supervisor delegated writes its brain for, as the agency's own
       settings hold it, chosen in one cell that saves it at once. It is the agency's, read apart from the research
       unit, so the agency's silence is said in this section alone. -->
  <section class="flex min-w-0 flex-col" aria-labelledby="research-supervisor-title">
    <div class="flex min-h-12 items-center gap-2 border-y border-default px-4 py-2">
      <h2 id="research-supervisor-title" class="text-base font-semibold text-highlighted">{{ $t("research.title.supervisor") }}</h2>
    </div>

    <ReadFailure
      v-if="error && !held"
      class="mx-4 my-4 w-auto"
      :failure="readFailure"
      :message="failureText(error, $t('research.error.supervisor_read_failed'))"
      :reading="status === 'pending'"
      @retry="refresh()"
    />

    <DataTableSkeleton v-else-if="!held" :headers="tableHeaders(columns)" :rows="1" :label="$t('research.status.supervisor_loading')" />

    <DataTable v-else data-settings-table data-research-supervisor :data="[held]" :columns="columns">
      <template #supervisor-cell="{ row }">
        <SettingsChoiceCell :value="row.original.supervisor ?? NONE" :items="items" :label="$t('research.label.supervisor')" :save="choose">
          <SearchText class="ps-2 font-medium text-highlighted" :text="chosen.label" :query="props.query" />
          <span v-if="chosen.name !== null" class="ps-2 text-muted">{{ chosen.name }}</span>
        </SettingsChoiceCell>
      </template>
    </DataTable>
  </section>
</template>

<script setup lang="ts">
import { tableHeaders } from "bmo-ui/app/domain/column-widths";
import { failureText } from "bmo-ui/app/domain/errors";
import { useReadFailure } from "~/domain/events";

import type { ResearchSupervisorView, SupervisorView } from "#shared/axes";
import type { CellChoice } from "~/domain/settings-cells";
import type { TableColumn } from "@nuxt/ui";

const props = withDefaults(defineProps<{ query?: string }>(), { query: "" });
const { t } = useI18n();

// No supervisor stands after every supervisor, as a value no supervisor's name can be: a name starts with a letter, and a
// list's value is never empty.
const NONE = "-";

// The one row: the supervisor the agency holds, and every supervisor it lists to choose from.
interface SupervisorRow extends ResearchSupervisorView {
  supervisors: SupervisorView[];
}

const { data, error, refresh, status } = useAsyncData<SupervisorRow>(
  "research-supervisor",
  async () => {
    const [supervisors, held] = await Promise.all([$fetch<SupervisorView[]>("/api/supervisors"), $fetch<ResearchSupervisorView>("/api/research-supervisor")]);

    return { supervisors, supervisor: held.supervisor };
  },
  { lazy: true, server: false }
);

const held = computed(() => data.value ?? null);
const readFailure = useReadFailure({ failed: () => !!error.value && !held.value, reading: () => status.value === "pending", reread: () => void refresh() });

// Every supervisor under its own label with its name under it, then none.
const items = computed<CellChoice[]>(() => [
  ...(held.value?.supervisors ?? []).map((one) => ({ value: one.name, label: one.label, description: one.name })),
  { value: NONE, label: t("settings.label.supervisor_none") }
]);

// What the cell shows: the supervisor held by its label with its name under it, a name the agency no longer lists by
// the name alone, and none by its word.
const chosen = computed<{ label: string; name: string | null }>(() => {
  const name = held.value?.supervisor ?? null;

  if (name === null) return { label: t("settings.label.supervisor_none"), name: null };

  const listed = held.value?.supervisors.find((one) => one.name === name);

  return listed === undefined || listed.label === name ? { label: name, name: null } : { label: listed.label, name };
});

const columns = computed<TableColumn<SupervisorRow>[]>(() => [{ accessorKey: "supervisor", header: t("research.label.supervisor") }]);

// The choice saved, the row standing as the agency then holds it; its refusal, in the pack's words, said by the cell.
async function choose(value: string | number): Promise<string | null> {
  try {
    const saved = await $fetch<ResearchSupervisorView>("/api/research-supervisor", { method: "PUT", body: { supervisor: value === NONE ? null : String(value) } });

    if (data.value) data.value = { ...data.value, supervisor: saved.supervisor };

    return null;
  } catch (failure) {
    return failureText(failure, t("common.error.save_failed"));
  }
}
</script>
