<template>
  <!-- What every research run is held to, each value in a cell of its own that saves it at once, the research
       supervisor for the administrator, and the search engines' state (docs/web.md, 「Research screen」, its
       settings tab). -->
  <div class="flex min-w-0 flex-col">
    <ReadFailure
      v-if="error && !settings"
      class="mx-4 my-4 w-auto"
      :failure="readFailure"
      :message="failureText(error, $t('research.error.settings_read_failed'))"
      :reading="status === 'pending'"
      @retry="refresh()"
    />

    <section class="flex min-w-0 flex-col" aria-labelledby="research-limits-title">
      <div class="flex min-h-12 items-center gap-2 border-y border-default px-4 py-2">
        <h2 id="research-limits-title" class="text-base font-semibold text-highlighted">{{ $t("research.title.limits") }}</h2>
      </div>

      <DataTableSkeleton v-if="!settings && !error" :headers="tableHeaders(limitColumns)" :rows="4" :label="$t('research.status.settings_loading')" />

      <DataTable v-if="settings" data-settings-table :data="settings.keys" :columns="limitColumns">
        <template #key-cell="{ row }">
          <span :class="CELL_TEXT" class="ps-4 font-medium text-highlighted">
            <SearchText :text="profileLabel($t, row.original.key)" :query="props.query" />
          </span>
        </template>

        <template #branches-cell="{ row }">
          <SettingsInputCell
            :value="row.original.branches"
            :label="$t('research.aria.branches_of', { key: profileLabel($t, row.original.key) })"
            :min="0"
            :step="1"
            :save="(text: string) => saveKey(row.original.key, { branches: Number(text) })"
          >
            <span class="font-medium tabular-nums text-highlighted">{{ countText(row.original.branches) }}</span>
          </SettingsInputCell>
        </template>

        <template #minutes-cell="{ row }">
          <SettingsInputCell
            :value="row.original.minutes"
            :label="$t('research.aria.minutes_of', { key: profileLabel($t, row.original.key) })"
            :min="1"
            :step="1"
            :save="(text: string) => saveKey(row.original.key, { minutes: Number(text) })"
          >
            <span class="font-medium tabular-nums text-highlighted">{{ $t("research.label.minutes_value", { n: countText(row.original.minutes) }) }}</span>
          </SettingsInputCell>
        </template>
      </DataTable>
    </section>

    <section class="flex min-w-0 flex-col" aria-labelledby="research-fetching-title">
      <div class="flex min-h-12 items-center gap-2 border-y border-default px-4 py-2">
        <h2 id="research-fetching-title" class="text-base font-semibold text-highlighted">{{ $t("research.title.fetching") }}</h2>
      </div>

      <DataTableSkeleton v-if="!settings && !error" :headers="tableHeaders(fetchColumns)" :rows="1" :label="$t('research.status.settings_loading')" />

      <DataTable v-if="settings" data-settings-table :data="[settings]" :columns="fetchColumns">
        <template #branchRole-cell="{ row }">
          <SettingsChoiceCell
            :value="row.original.branchRole"
            :items="roleItems"
            :label="$t('research.label.branch_role')"
            :save="(value: string | number) => save({ branchRole: String(value) })"
          >
            <SearchText class="ps-2 font-medium text-highlighted" :text="row.original.branchRole" :query="props.query" />
          </SettingsChoiceCell>
        </template>

        <template #strategy-cell="{ row }">
          <SettingsChoiceCell
            :value="row.original.strategy"
            :items="strategyItems"
            :label="$t('research.label.strategy')"
            :save="(value: string | number) => save({ strategy: String(value) })"
          >
            <SearchText class="ps-2 font-medium text-highlighted" :text="strategyLabel($t, row.original.strategy)" :query="props.query" />
          </SettingsChoiceCell>
        </template>

        <template #hostIntervalMs-cell="{ row }">
          <SettingsInputCell
            :value="row.original.hostIntervalMs"
            :label="$t('research.label.host_gap')"
            :help="$t('research.message.gap_help')"
            :min="0"
            :step="1"
            :save="(text: string) => save({ hostIntervalMs: gapOf(text) })"
          >
            <span class="font-medium tabular-nums text-highlighted">{{ gapText($t, row.original.hostIntervalMs) }}</span>
          </SettingsInputCell>
        </template>

        <template #engineIntervalMs-cell="{ row }">
          <SettingsInputCell
            :value="row.original.engineIntervalMs"
            :label="$t('research.label.engine_gap')"
            :help="$t('research.message.gap_help')"
            :min="0"
            :step="1"
            :save="(text: string) => save({ engineIntervalMs: gapOf(text) })"
          >
            <span class="font-medium tabular-nums text-highlighted">{{ gapText($t, row.original.engineIntervalMs) }}</span>
          </SettingsInputCell>
        </template>
      </DataTable>
    </section>

    <ResearchSupervisor v-if="administrator" :query="props.query" />

    <section class="flex min-w-0 flex-col" aria-labelledby="research-engines-title">
      <div class="flex min-h-12 items-center gap-2 border-y border-default px-4 py-2">
        <h2 id="research-engines-title" class="text-base font-semibold text-highlighted">{{ $t("research.title.engines") }}</h2>
      </div>

      <DataTableSkeleton v-if="!settings && !error" :headers="tableHeaders(engineColumns)" :rows="6" :label="$t('research.status.settings_loading')" />

      <p v-else-if="settings && settings.engines === null" role="alert" class="px-4 py-4 text-sm text-error">
        {{ $t("research.error.engines_unread", { reason: settings.enginesUnread ?? "" }) }}
      </p>

      <p v-else-if="settings && settings.engines !== null && settings.engines.length === 0" class="px-4 py-4 text-sm text-muted">{{ $t("research.status.no_engines") }}</p>

      <DataTable v-else-if="settings && settings.engines !== null" data-settings-table :data="settings.engines" :columns="engineColumns">
        <template #name-cell="{ row }">
          <span :class="CELL_TEXT" class="ps-4 font-medium text-highlighted">
            <SearchText :text="row.original.name" :query="props.query" />
          </span>
        </template>

        <template #category-cell="{ row }">
          <span :class="CELL_TEXT" class="font-mono text-muted">
            <SearchText :text="row.original.category ?? '—'" :query="props.query" />
          </span>
        </template>

        <template #state-cell="{ row }">
          <span :class="CELL_TEXT">
            <span class="flex items-center gap-2">
              <UIcon :name="engineLook($t, row.original.state).icon" class="size-4 shrink-0" :class="engineLook($t, row.original.state).tone" />
              <SearchText class="text-highlighted" :text="engineLook($t, row.original.state).label" :query="props.query" />
            </span>
          </span>
        </template>

        <template #reason-cell="{ row }">
          <span :class="CELL_TEXT" class="font-mono text-muted">
            <SearchText :text="row.original.reason ?? '—'" :query="props.query" />
          </span>
        </template>

        <template #observedAt-cell="{ row }">
          <span :class="CELL_TEXT" class="tabular-nums text-muted">{{ row.original.observedAt === null ? "—" : formatStamp(toUnixSeconds(row.original.observedAt)) }}</span>
        </template>

        <template #suspendedUntil-cell="{ row }">
          <span :class="CELL_TEXT" class="tabular-nums text-muted">
            {{ row.original.suspendedUntil === null ? "—" : remainingText($t, toUnixSeconds(row.original.suspendedUntil), now) }}
          </span>
        </template>
      </DataTable>
    </section>
  </div>
</template>

<script setup lang="ts">
import { tableHeaders } from "bmo-ui/app/domain/column-widths";
import { failureText } from "bmo-ui/app/domain/errors";
import { countText } from "bmo-ui/app/domain/numbers";
import { formatStamp, remainingText, toUnixSeconds, useNowSeconds } from "bmo-ui/app/domain/time";
import { useAdministrator } from "~/domain/access";
import { useReadFailure } from "~/domain/events";
import { usePolling } from "~/domain/polling";
import { engineLook, gapOf, gapText, profileLabel, STRATEGY_LABELS, strategyLabel } from "~/domain/research";
import { CELL_TEXT } from "~/domain/settings-cells";

import type { ResearchKeySettings, ResearchSettingsChange, ResearchSettingsView, SearchEngineState } from "#shared/research";
import type { CellChoice } from "~/domain/settings-cells";
import type { TableColumn } from "@nuxt/ui";

const props = withDefaults(defineProps<{ query?: string }>(), { query: "" });
const { t } = useI18n();
// The research supervisor is the agency's, set by the administrator alone.
const administrator = useAdministrator();

// How often the engines' state is read again while the tab stands and is seen: a suspension lasts seconds.
const POLL_MS = 15_000;

const { data: settingsData, error, refresh, status } = useFetch<ResearchSettingsView>("/api/research-settings", { key: "research-settings", lazy: true, server: false });

const settings = computed(() => settingsData.value ?? null);
const readFailure = useReadFailure({ failed: () => !!error.value && !settings.value, reading: () => status.value === "pending", reread: () => void refresh() });
const { now } = useNowSeconds();

usePolling(() => {
  if (document.visibilityState === "visible") void refresh();
}, POLL_MS);

// The roles the agency lists with an agent switched on, each by the words the role tab names it by; the role the
// settings hold still stands as its own choice where the agency no longer lists it.
const roleItems = computed<CellChoice[]>(() => {
  const roles = settings.value?.roles ?? [];
  const held = settings.value?.branchRole;
  const items = roles.map((role) => ({ value: role.name, label: role.label }));

  return held === undefined || items.some((one) => one.value === held) ? items : [{ value: held, label: held }, ...items];
});

const strategyItems = computed<CellChoice[]>(() => Object.keys(STRATEGY_LABELS).map((value) => ({ value, label: strategyLabel(t, value) })));

const limitColumns = computed<TableColumn<ResearchKeySettings>[]>(() => [
  { accessorKey: "key", header: t("research.label.key") },
  { accessorKey: "branches", header: t("research.label.branches"), meta: { class: { th: "w-32" } } },
  { accessorKey: "minutes", header: t("research.label.minutes"), meta: { class: { th: "w-32" } } }
]);

const fetchColumns = computed<TableColumn<ResearchSettingsView>[]>(() => [
  { accessorKey: "branchRole", header: t("research.label.branch_role") },
  { accessorKey: "strategy", header: t("research.label.strategy") },
  { accessorKey: "hostIntervalMs", header: t("research.label.host_gap") },
  { accessorKey: "engineIntervalMs", header: t("research.label.engine_gap") }
]);

const engineColumns = computed<TableColumn<SearchEngineState>[]>(() => [
  { accessorKey: "name", header: t("research.label.engine") },
  { accessorKey: "category", header: t("research.label.category") },
  { accessorKey: "state", header: t("research.label.state") },
  { accessorKey: "reason", header: t("research.label.reason") },
  { accessorKey: "observedAt", header: t("research.label.observed") },
  { accessorKey: "suspendedUntil", header: t("research.label.suspended_until") }
]);

// One setting changed, the settings standing as the research unit answered them; its refusal, in the pack's words,
// stays under the box.
async function save(change: ResearchSettingsChange): Promise<string | null> {
  try {
    settingsData.value = await $fetch<ResearchSettingsView>("/api/research-settings", { method: "PUT", body: change });

    return null;
  } catch (failure) {
    return failureText(failure, t("common.error.save_failed"));
  }
}

// One key's branches or clock changed, every key sent as it stands with that one value changed.
async function saveKey(key: string, change: Partial<Pick<ResearchKeySettings, "branches" | "minutes">>): Promise<string | null> {
  const held = settings.value?.keys ?? [];

  return await save({ keys: held.map((one) => (one.key === key ? { ...one, ...change } : one)) });
}
</script>
