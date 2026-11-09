<template>
  <!-- The roles the agency holds (docs/web.md, 「Agent management screen」, the roles tab; the agency's
       docs/agent-roles.md): one row each in its order — a role is a preset, its prompt, its tools and its line —
       with how many agents stand on it and how many of its runs go and wait, read again every few seconds.
       Pressing a role's name opens its dialog; its removal stands in the row's more-menu. -->
  <section class="flex min-h-0 min-w-0 flex-1 flex-col" :aria-label="$t('agents.label.tab_roles')">
    <DataTableSkeleton v-if="!view && !error" layout="fill" :headers="tableHeaders(columns)" :rows="6" :label="$t('agents.status.roles_loading')" />
    <ReadFailure
      v-else-if="error && !view"
      class="mx-4 my-4 w-auto"
      :failure="readFailure"
      :message="failureText(error, $t('agents.error.roles_read_failed'))"
      :reading="status === 'pending'"
      @retry="refresh()"
    />
    <p v-else-if="view && view.roles.length === 0" class="px-4 py-3 text-sm text-muted">{{ $t("agents.status.no_roles") }}</p>

    <SettingsTable v-if="view && view.roles.length > 0" layout="fill" :data="view.roles" :columns="columns" :row-key="(row: RoleView) => row.name">
      <template #role-cell="{ row }">
        <button
          :id="settingsAnchor(`role-${row.original.name}`)"
          type="button"
          :class="CELL_BUTTON"
          class="ps-4"
          :disabled="props.readonly"
          :aria-label="$t('agents.aria.settings_of', { name: row.original.name })"
          @click="openEdit(row.original.name)"
        >
          <SearchText class="truncate font-mono text-sm font-medium text-highlighted" :text="row.original.name" :query="props.query" />
          <SearchHit :match="hiddenMatch(row.original)" :query="props.query" />
        </button>
      </template>

      <template #bundles-cell="{ row }">
        <span :class="CELL_TEXT" class="w-full">
          <span v-if="row.original.bundles.length > 0" class="flex flex-wrap gap-1">
            <UBadge v-for="bundle in row.original.bundles" :key="bundle.name" color="neutral" variant="subtle" size="sm">
              <SearchText :text="bundle.label" :query="props.query" />
            </UBadge>
          </span>
          <span v-else class="text-sm text-muted">{{ $t("agents.label.role_bundles_none") }}</span>
        </span>
      </template>

      <template #line-cell="{ row }">
        <span :class="CELL_TEXT">
          <SearchText class="font-mono text-sm text-highlighted" :text="row.original.line" :query="props.query" />
        </span>
      </template>

      <!-- Whether it carries a prompt of its own, which every run of it opens with. -->
      <template #prompt-cell="{ row }">
        <span :class="CELL_TEXT">
          <span class="text-sm" :class="row.original.prompt === null ? 'text-muted' : 'text-highlighted'">{{ row.original.prompt === null ? $t("agents.label.role_prompt_none") : $t("agents.label.role_prompt_set") }}</span>
        </span>
      </template>

      <!-- How many agents stand on it and how many of its runs go and wait; its agents are changed in the agents
           tab. -->
      <template #agents-cell="{ row }">
        <span :class="CELL_TEXT">
          <span class="whitespace-nowrap text-sm tabular-nums" :class="row.original.maxConcurrent === 0 ? 'text-warning' : 'text-highlighted'">{{ concurrencyText(row.original) }}</span>
        </span>
      </template>

      <template v-if="!props.readonly" #actions-cell="{ row }">
        <span class="flex h-full min-h-12 items-center justify-end pe-2">
          <UDropdownMenu :items="menuOf(row.original)" :content="{ align: 'end' }">
            <UTooltip :text="$t('common.aria.menu_of', { name: row.original.name })">
              <UButton color="neutral" variant="ghost" size="sm" icon="i-material-symbols-more-vert" :loading="removing === row.original.name" :aria-label="$t('common.aria.menu_of', { name: row.original.name })" />
            </UTooltip>
          </UDropdownMenu>
        </span>
      </template>
    </SettingsTable>

    <p v-if="removeFailed !== ''" role="alert" class="px-4 py-2 break-words text-sm text-error">{{ removeFailed }}</p>

    <RoleSettingsDialog v-model:open="editing" :name="editingName" @saved="() => void refresh()" />
  </section>
</template>

<script setup lang="ts">
import { matchFields } from "bmo-ui/shared/search";
import { tableHeaders } from "bmo-ui/app/domain/column-widths";
import { failureText } from "bmo-ui/app/domain/errors";

import { settingsAnchor } from "~/domain/agent-settings";
import { useConfirm } from "~/domain/confirm";
import { useReadFailure } from "~/domain/events";
import { countText } from "~/domain/numbers";
import { usePolling } from "~/domain/polling";
import { CELL_BUTTON, CELL_TEXT } from "~/domain/settings-cells";

import type { RolesView, RoleView } from "#shared/axes";
import type { DropdownMenuItem } from "@nuxt/ui";
import type { SettingsColumn } from "~/domain/settings-columns";

const props = withDefaults(defineProps<{ query?: string; readonly?: boolean }>(), { query: "", readonly: false });
const { t } = useI18n();
const askFirst = useConfirm();

// How often what goes and waits is read again while the tab stands and the browser tab is seen.
const COUNTS_MS = 5_000;

// The page's search reads the same answer under the same key.
const { data: view, error, refresh, status } = useFetch<RolesView>("/api/roles", { key: "roles", lazy: true, server: false });
const readFailure = useReadFailure({ failed: () => !!error.value && !view.value, reading: () => status.value === "pending", reread: () => void refresh() });

usePolling(() => {
  if (document.visibilityState === "visible" && !editing.value) void refresh();
}, COUNTS_MS);

const columns = computed<SettingsColumn<RoleView>[]>(() => [
  { id: "role", header: t("agents.label.column_role") },
  { id: "line", header: t("agents.label.run_line") },
  { id: "bundles", header: t("agents.label.column_bundles"), ceiling: 320 },
  { id: "prompt", header: t("agents.label.role_prompt") },
  { id: "agents", header: t("agents.label.role_agents") },
  ...(props.readonly ? [] : [{ id: "actions", header: "" }])
]);

function hiddenMatch(role: RoleView) {
  return matchFields([{ label: t("agents.label.description"), text: role.description ?? "", shown: false }], props.query);
}

// How many of its agents are switched on with how many of its runs go and wait beside it, and the closed word where
// none is.
function concurrencyText(role: RoleView): string {
  if (role.maxConcurrent === 0) return t("agents.status.role_blocked");

  const going = t("agents.label.role_running", { running: countText(role.running), cap: countText(role.maxConcurrent) });

  return role.waiting === 0 ? going : `${going} · ${t("agents.label.role_waiting", { n: countText(role.waiting) })}`;
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
  const taken = await askFirst({ title: t("agents.message.role_delete_confirm"), item: role.name, confirm: t("common.action.delete") });

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
