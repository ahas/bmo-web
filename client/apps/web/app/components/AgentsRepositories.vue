<template>
  <!-- The repositories (docs/web.md, 「Agent management screen」, the repositories tab; the agency's
       docs/repositories.md): one row each in the agency's order, under a repository whose checkout a job holds the
       job's item and role. Pressing a row's name opens its dialog; its more-menu holds the edit, its log and its
       removal. -->
  <section class="flex min-h-0 min-w-0 flex-1 flex-col" :aria-label="$t('agents.label.tab_repositories')">
    <DataTableSkeleton v-if="repositories === undefined && !error" layout="fill" :headers="tableHeaders(columns)" :rows="4" :label="$t('agents.status.repositories_loading')" />
    <ReadFailure
      v-else-if="error && repositories === undefined"
      class="mx-4 my-4 w-auto"
      :failure="readFailure"
      :message="failureText(error, $t('agents.error.repositories_read_failed'))"
      :reading="status === 'pending'"
      @retry="refresh()"
    />
    <p v-else-if="repositories !== undefined && repositories.length === 0" class="px-4 py-3 text-sm text-muted">{{ $t("agents.status.no_repositories") }}</p>

    <SettingsTable v-if="repositories !== undefined && repositories.length > 0" layout="fill" :data="repositories" :columns="columns" :row-key="(row: RepositoryView) => row.name">
      <template #repository-cell="{ row }">
        <button
          :id="settingsAnchor(`repository-${row.original.name}`)"
          type="button"
          :class="CELL_BUTTON"
          class="flex-row items-start justify-start gap-2 ps-4"
          :disabled="props.readonly"
          :aria-label="$t('agents.aria.settings_of', { name: row.original.label })"
          @click="openEdit(row.original.name)"
        >
          <UIcon :name="row.original.icon ?? REPOSITORY_ICON" class="mt-0.5 size-5 shrink-0 text-muted" />
          <span class="flex min-w-0 flex-col">
            <SearchText class="truncate text-sm font-medium text-highlighted" :text="row.original.label" :query="props.query" />
            <SearchText class="truncate font-mono text-sm text-muted" :text="row.original.name" :query="props.query" />
            <span v-for="job in jobsOf(row.original)" :key="job" class="truncate text-sm text-primary">{{ job }}</span>
          </span>
        </button>
      </template>

      <template #path-cell="{ row }">
        <span :class="CELL_TEXT" class="w-full text-sm">
          <SearchText class="truncate font-mono text-toned" :text="row.original.path" :query="props.query" />
          <span v-if="row.original.nodeName !== null" class="truncate text-muted">{{ nodeLabel(row.original.nodeName) }}</span>
        </span>
      </template>

      <template #checkouts-cell="{ row }">
        <span :class="CELL_TEXT" class="whitespace-nowrap text-sm tabular-nums text-highlighted">
          {{ $t("agents.label.checkouts_value", { support: supportText(row.original), held: countText(heldCount(row.original)), all: countText(row.original.checkouts.length) }) }}
        </span>
      </template>

      <template #prefix-cell="{ row }">
        <span :class="[CELL_TEXT, row.original.prefixDocuments.length === 0 ? 'text-muted' : 'text-highlighted']" class="text-sm tabular-nums">{{ countText(row.original.prefixDocuments.length) }}</span>
      </template>

      <template #pin-cell="{ row }">
        <span :class="CELL_TEXT" class="whitespace-nowrap text-sm">
          <span v-if="row.original.pin === null" class="text-muted">{{ $t("agents.label.role_order") }}</span>
          <span v-else class="text-highlighted">{{ `${providerWord(providers, row.original.pin.provider)} ${shortOnProvider(row.original.pin.provider, row.original.pin.model)}` }}</span>
        </span>
      </template>

      <template #heal-cell="{ row }">
        <span :class="CELL_TEXT" class="items-start">
          <USwitch
            :model-value="row.original.downgradeHeal"
            :loading="switching === row.original.name"
            :disabled="switching !== '' || props.readonly"
            :aria-label="$t('agents.aria.heal_of', { name: row.original.label })"
            @update:model-value="(on: boolean) => void switchHeal(row.original, on)"
          />
        </span>
      </template>

      <template #actions-cell="{ row }">
        <span class="flex h-full min-h-12 items-center justify-end pe-2">
          <UDropdownMenu :items="menuOf(row.original)" :content="{ align: 'end' }">
            <UTooltip :text="$t('common.aria.menu_of', { name: row.original.label })">
              <UButton color="neutral" variant="ghost" size="sm" icon="i-material-symbols-more-vert" :loading="removing === row.original.name" :aria-label="$t('common.aria.menu_of', { name: row.original.label })" />
            </UTooltip>
          </UDropdownMenu>
        </span>
      </template>
    </SettingsTable>

    <p v-if="removeFailed !== ''" role="alert" class="px-4 py-2 break-words text-sm text-error">{{ removeFailed }}</p>

    <RepositorySettingsDialog v-model:open="editing" :name="editingName" @saved="() => void refresh()" />
  </section>
</template>

<script setup lang="ts">
import { tableHeaders } from "bmo-ui/app/domain/column-widths";
import { failureText } from "bmo-ui/app/domain/errors";
import { useIsland } from "bmo-ui/app/domain/island";

import { settingsAnchor } from "~/domain/agent-settings";
import { DEFAULT_SUPPORT_COUNT, markedDefault, providerWord, refusalOf, shortOnProvider, useProviders } from "~/domain/axes";
import { useConfirm } from "~/domain/confirm";
import { useReadFailure } from "~/domain/events";
import { countText } from "~/domain/numbers";
import { CELL_BUTTON, CELL_TEXT } from "~/domain/settings-cells";

import type { RepositoryView } from "#shared/axes";
import type { MonitorNode } from "#shared/types";
import type { DropdownMenuItem } from "@nuxt/ui";
import type { SettingsColumn } from "~/domain/settings-columns";

const props = withDefaults(defineProps<{ query?: string; readonly?: boolean }>(), { query: "", readonly: false });
const { t } = useI18n();
const island = useIsland(t);
const askFirst = useConfirm();

// The mark a repository stands under where the agency names none of its own.
const REPOSITORY_ICON = "i-material-symbols-folder-outline";

// The page's search reads the same answer under the same key.
const { data: repositories, error, refresh, status } = useFetch<RepositoryView[]>("/api/repositories", { key: "repositories", lazy: true, server: false });
const { data: nodes } = useFetch<MonitorNode[]>("/api/nodes", { key: "nodes", lazy: true, server: false });
const { data: providers } = useProviders();
const readFailure = useReadFailure({ failed: () => !!error.value && repositories.value === undefined, reading: () => status.value === "pending", reread: () => void refresh() });

const columns = computed<SettingsColumn<RepositoryView>[]>(() => [
  { id: "repository", header: t("agents.label.column_repository") },
  { id: "path", header: t("common.label.path"), ceiling: 320 },
  { id: "checkouts", header: t("agents.label.column_checkouts") },
  { id: "prefix", header: t("agents.label.prefix_documents") },
  { id: "pin", header: t("agents.label.pinned_model") },
  { id: "heal", header: t("agents.label.column_heal") },
  { id: "actions", header: "" }
]);

function nodeLabel(name: string): string {
  return nodes.value?.find((node) => node.name === name)?.label ?? name;
}

// Its support count: auto where the agency grows its support checkouts as launches find them held, or the count fixed;
// the default marked as such.
function supportText(repository: RepositoryView): string {
  const count = repository.supportCount;

  return markedDefault(t, count === "auto" ? t("common.label.auto") : countText(count), count === DEFAULT_SUPPORT_COUNT);
}

function heldCount(repository: RepositoryView): number {
  return repository.checkouts.filter((one) => one.job !== null).length;
}

// The item and the role of each job holding one of its checkouts.
function jobsOf(repository: RepositoryView): string[] {
  return repository.checkouts.flatMap((one) => {
    if (one.job === null) return [];

    const role = one.job.role;

    return [[one.job.itemId === null ? null : `#${one.job.itemId}`, role].filter((part) => part !== null).join(" · ")];
  });
}

const switching = ref("");

async function switchHeal(repository: RepositoryView, on: boolean): Promise<void> {
  switching.value = repository.name;

  try {
    const answered = await $fetch<RepositoryView>(`/api/repositories/${encodeURIComponent(repository.name)}`, { method: "PATCH", body: { downgradeHeal: on } });

    repositories.value = (repositories.value ?? []).map((one) => (one.name === repository.name ? answered : one));
  } catch (failure) {
    island.say({ key: `heal:${repository.name}`, title: t("common.error.not_saved_named", { name: t("agents.label.column_heal") }), description: refusalOf(t, failure).text, tone: "error" });
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

function menuOf(repository: RepositoryView): DropdownMenuItem[] {
  const held = heldCount(repository) > 0;
  // The log is read, and stands to a reader whose part is read alone; the edit and the removal need its write.
  const log: DropdownMenuItem = { label: t("agents.action.log"), icon: "i-material-symbols-article-outline", to: `/agents/${encodeURIComponent(repository.name)}` };

  if (props.readonly) return [log];

  return [
    { label: t("common.action.edit"), icon: "i-material-symbols-edit-outline", onSelect: () => openEdit(repository.name) },
    log,
    {
      label: t("common.action.delete"),
      icon: "i-material-symbols-delete-outline",
      color: "error" as const,
      disabled: held || removing.value !== "",
      ...(held ? { description: t("agents.status.repository_in_use") } : {}),
      onSelect: () => void remove(repository)
    }
  ];
}

async function remove(repository: RepositoryView): Promise<void> {
  const taken = await askFirst({ title: t("agents.message.repository_delete_confirm"), item: repository.label, confirm: t("common.action.delete") });

  if (!taken) return;

  removing.value = repository.name;
  removeFailed.value = "";

  try {
    await $fetch(`/api/repositories/${encodeURIComponent(repository.name)}`, { method: "DELETE" });
    await refresh();
  } catch (failure) {
    removeFailed.value = failureText(failure, t("common.error.save_failed"));
  } finally {
    removing.value = "";
  }
}

// The tab row's add names this section's add by its word and opens it.
defineExpose({ addLabel: computed(() => t("agents.title.repository_add")), openAdd, refresh });
</script>
