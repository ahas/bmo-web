<template>
  <!-- The roles the agency holds (docs/web.md, 「Agent management screen」, the roles tab; the agency's
       docs/agent-roles.md): one row each in its order, every value a cell of its own that saves it, the counts of
       what goes and waits read again every few seconds. Pressing a role's name opens its dialog; its removal stands
       in the row's more-menu. -->
  <section class="flex min-w-0 flex-col" :aria-label="$t('agents.label.tab_roles')">
    <DataTableSkeleton v-if="!view && !error" :headers="tableHeaders(columns)" :rows="6" :label="$t('agents.status.roles_loading')" />
    <ReadFailure
      v-else-if="error && !view"
      class="mx-4 my-4 w-auto"
      :failure="readFailure"
      :message="failureText(error, $t('agents.error.roles_read_failed'))"
      :reading="status === 'pending'"
      @retry="refresh()"
    />
    <p v-else-if="view && view.roles.length === 0" class="px-4 py-3 text-sm text-muted">{{ $t("agents.status.no_roles") }}</p>

    <DataTable v-if="view && view.roles.length > 0" data-settings-table :data="view.roles" :columns="columns" :row-key="(row: RoleView) => row.name">
      <template #role-cell="{ row }">
        <button
          :id="settingsAnchor(`role-${row.original.name}`)"
          type="button"
          :class="CELL_BUTTON"
          class="ps-4"
          :aria-label="$t('agents.aria.settings_of', { name: row.original.shown })"
          @click="openEdit(row.original.name)"
        >
          <SearchText class="truncate text-sm font-medium text-highlighted" :text="row.original.shown" :query="props.query" />
          <SearchText class="truncate font-mono text-sm text-muted" :text="row.original.name" :query="props.query" />
          <SearchHit :match="hiddenMatch(row.original)" :query="props.query" />
        </button>
      </template>

      <template #bundles-cell="{ row, held }">
        <span :class="[CELL_TEXT, held ? 'w-full' : 'w-max max-w-80']">
          <span v-if="row.original.bundles.length > 0" class="flex flex-wrap gap-1">
            <UBadge v-for="bundle in row.original.bundles" :key="bundle.name" color="neutral" variant="subtle" size="sm">
              <SearchText :text="bundle.label" :query="props.query" />
            </UBadge>
          </span>
          <span v-else class="text-sm text-muted">{{ $t("agents.label.role_bundles_none") }}</span>
        </span>
      </template>

      <template #order-cell="{ row, held }">
        <ProviderOrderCell
          :order="row.original.order"
          :share="row.original.quotaShare"
          :line="row.original.line"
          :name="row.original.shown"
          :held="held"
          :save="(order, quotaShare) => change(row.original.name, { order, quotaShare })"
        />
        <HintTip v-if="row.original.waitingFor !== null" :text="row.original.waitingFor" class="px-2 pb-1">
          <span class="text-sm text-warning">{{ $t("agents.status.waiting_for_quota") }}</span>
        </HintTip>
      </template>

      <template #concurrency-cell="{ row }">
        <SettingsInputCell
          :value="row.original.maxConcurrent"
          :label="$t('agents.aria.max_concurrent_of', { name: row.original.shown })"
          :min="0"
          :step="1"
          :save="(value: string) => saved(change(row.original.name, { maxConcurrent: Number(value) }))"
        >
          <span class="whitespace-nowrap text-sm tabular-nums" :class="row.original.maxConcurrent === 0 ? 'text-warning' : 'text-highlighted'">{{ concurrencyText(row.original) }}</span>
        </SettingsInputCell>
      </template>

      <template #sessions-cell="{ row }">
        <SettingsChoiceCell
          :value="row.original.sessions"
          :items="sessionItems"
          :label="$t('agents.aria.sessions_of', { name: row.original.shown })"
          :save="(value: string | number) => saved(change(row.original.name, { sessions: String(value) }))"
        >
          <span class="whitespace-nowrap text-sm text-highlighted">{{ sessionsText($t, row.original.sessions) }}</span>
        </SettingsChoiceCell>
      </template>

      <template #threshold-cell="{ row }">
        <SettingsInputCell
          :value="percentOf(row.original.foldRatio)"
          :label="$t('agents.aria.threshold_of', { name: row.original.shown })"
          :min="1"
          :max="100"
          :step="1"
          :save="(value: string) => saved(change(row.original.name, { foldRatio: fractionOf(Number(value)) }))"
        >
          <span class="text-sm tabular-nums text-highlighted">{{ thresholdText(row.original.foldRatio) }}</span>
        </SettingsInputCell>
      </template>

      <template #callable-cell="{ row }">
        <span :class="CELL_TEXT" class="items-start">
          <USwitch
            :model-value="row.original.callable"
            :loading="switching === row.original.name"
            :disabled="switching !== ''"
            :aria-label="$t('agents.aria.callable_of', { name: row.original.shown })"
            @update:model-value="(on: boolean) => void switchCallable(row.original, on)"
          />
        </span>
      </template>

      <template #actions-cell="{ row }">
        <span class="flex min-h-12 items-center justify-end pe-2">
          <UDropdownMenu :items="menuOf(row.original)" :content="{ align: 'end' }">
            <UTooltip :text="$t('common.aria.menu_of', { name: row.original.shown })">
              <UButton color="neutral" variant="ghost" size="sm" icon="i-material-symbols-more-vert" :loading="removing === row.original.name" :aria-label="$t('common.aria.menu_of', { name: row.original.shown })" />
            </UTooltip>
          </UDropdownMenu>
        </span>
      </template>
    </DataTable>

    <p v-if="removeFailed !== ''" role="alert" class="px-4 py-2 break-words text-sm text-error">{{ removeFailed }}</p>

    <RoleSettingsDialog v-model:open="editing" :name="editingName" @saved="() => void refresh()" />
  </section>
</template>

<script setup lang="ts">
import { matchFields } from "bmo-ui/shared/search";
import { tableHeaders } from "bmo-ui/app/domain/column-widths";
import { failureText } from "bmo-ui/app/domain/errors";
import { useIsland } from "bmo-ui/app/domain/island";

import { settingsAnchor } from "~/domain/agent-settings";
import { fractionOf, percentOf, refusalOf, sessionsText, thresholdText } from "~/domain/axes";
import { useConfirm } from "~/domain/confirm";
import { useReadFailure } from "~/domain/events";
import { countText } from "~/domain/numbers";
import { usePolling } from "~/domain/polling";
import { CELL_BUTTON, CELL_TEXT } from "~/domain/settings-cells";

import type { OrderEntryView, RolesView, RoleView } from "#shared/axes";
import type { DropdownMenuItem, TableColumn } from "@nuxt/ui";
import type { CellChoice } from "~/domain/settings-cells";

const props = withDefaults(defineProps<{ query?: string }>(), { query: "" });
const { t } = useI18n();
const island = useIsland(t);
const askFirst = useConfirm();

// How often what goes and waits is read again while the tab stands and the browser tab is seen.
const COUNTS_MS = 5_000;

// The page's search reads the same answer under the same key.
const { data: view, error, refresh, status } = useFetch<RolesView>("/api/roles", { key: "roles", lazy: true, server: false });
const readFailure = useReadFailure({ failed: () => !!error.value && !view.value, reading: () => status.value === "pending", reread: () => void refresh() });

usePolling(() => {
  if (document.visibilityState === "visible" && !editing.value) void refresh();
}, COUNTS_MS);

const columns = computed<TableColumn<RoleView>[]>(() => [
  { id: "role", header: t("agents.label.column_role"), meta: { class: { th: "w-full" } } },
  { id: "bundles", header: t("agents.label.column_bundles") },
  { id: "order", header: t("agents.label.order") },
  { id: "concurrency", header: t("agents.label.column_max_concurrent") },
  { id: "sessions", header: t("agents.label.column_sessions") },
  { id: "threshold", header: t("agents.label.column_threshold") },
  { id: "callable", header: t("agents.label.column_callable") },
  { id: "actions", header: "" }
]);

const sessionItems = computed<CellChoice[]>(() => (["keep", "fresh"] as const).map((value) => ({ value, label: sessionsText(t, value) })));

function hiddenMatch(role: RoleView) {
  return matchFields([{ label: t("agents.label.role_label"), text: role.label, shown: false }, { label: t("agents.label.description"), text: role.description ?? "", shown: false }], props.query);
}

// Its cap with how many of its runs go and wait beside it, and the closed word at a cap of none.
function concurrencyText(role: RoleView): string {
  if (role.maxConcurrent === 0) return t("agents.status.role_blocked");

  const going = t("agents.label.role_running", { running: countText(role.running), cap: countText(role.maxConcurrent) });

  return role.waiting === 0 ? going : `${going} · ${t("agents.label.role_waiting", { n: countText(role.waiting) })}`;
}

/** One change of a role sent; the table stands as the agency answered it, or the refusal with its field. */
async function change(name: string, body: { order?: OrderEntryView[]; quotaShare?: number; maxConcurrent?: number; sessions?: string; foldRatio?: number; callable?: boolean }): Promise<{ field: string | null; text: string } | null> {
  try {
    const answered = await $fetch<RoleView>(`/api/roles/${encodeURIComponent(name)}`, { method: "PATCH", body });

    if (view.value) view.value = { ...view.value, roles: view.value.roles.map((one) => (one.name === name ? answered : one)) };

    return null;
  } catch (failure) {
    return refusalOf(t, failure);
  }
}

async function saved(asked: Promise<{ field: string | null; text: string } | null>): Promise<string | null> {
  return (await asked)?.text ?? null;
}

const switching = ref("");

async function switchCallable(role: RoleView, on: boolean): Promise<void> {
  switching.value = role.name;

  try {
    const refused = await change(role.name, { callable: on });

    if (refused !== null) island.say({ key: `callable:${role.name}`, title: t("common.error.not_saved_named", { name: t("agents.label.column_callable") }), description: refused.text, tone: "error" });
  } finally {
    switching.value = "";
  }
}

const editing = ref(false);
const editingName = ref<string | null>(null);

function openEdit(name: string): void {
  editingName.value = name;
  editing.value = true;
}

function openAdd(): void {
  editingName.value = null;
  editing.value = true;
}

const removing = ref("");
const removeFailed = ref("");

// A role a run goes or waits under is not removed, which its menu item says.
function menuOf(role: RoleView): DropdownMenuItem[] {
  const held = role.running > 0 || role.waiting > 0;

  return [
    { label: t("agents.action.settings"), icon: "i-material-symbols-settings-outline", onSelect: () => openEdit(role.name) },
    {
      label: t("common.action.delete"),
      icon: "i-material-symbols-delete-outline",
      color: "error" as const,
      disabled: held || removing.value !== "",
      ...(held ? { description: t("agents.status.role_in_use") } : {}),
      onSelect: () => void remove(role)
    }
  ];
}

// A removal is asked first in a dialog naming the role; one the agency refuses all the same says why under the table.
async function remove(role: RoleView): Promise<void> {
  const taken = await askFirst({ title: t("agents.message.role_delete_confirm"), item: role.shown, confirm: t("common.action.delete") });

  if (!taken) return;

  removing.value = role.name;
  removeFailed.value = "";

  try {
    await $fetch(`/api/roles/${encodeURIComponent(role.name)}`, { method: "DELETE" });
    await refresh();
  } catch (failure) {
    removeFailed.value = failureText(failure, t("common.error.save_failed"));
  } finally {
    removing.value = "";
  }
}

defineExpose({ openAdd, refresh });
</script>
