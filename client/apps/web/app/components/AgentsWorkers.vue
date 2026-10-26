<template>
  <!-- The job workers: the one list the owner writes. The name and path cells edit themselves; the
       row's menu opens the whole of a worker, and the tab row's add button opens a new one. -->
  <section class="flex min-w-0 flex-col" :aria-label="$t('common.label.worker')">
    <DataTable :data="workers" :columns="columns">
      <template #name-cell="{ row }">
        <SettingsInputCell
          kind="text"
          :value="row.original.label ?? row.original.name"
          :label="$t('agents.aria.label_of', { name: row.original.name })"
          :disabled="isSupport(row.original)"
          :check="(text: string) => (text.trim() === '' ? $t('agents.error.label_needed') : null)"
          :save="(text: string) => update(row.original, { label: text })"
        >
          <span :id="settingsAnchor(`worker-${row.original.name}`)" class="flex min-w-0 items-start gap-2 ps-2">
            <UIcon :name="row.original.icon ?? 'i-material-symbols-construction'" class="mt-0.5 size-4 shrink-0 text-muted" />
            <span class="flex min-w-0 flex-col">
              <span class="flex min-w-0 items-center gap-2">
                <SearchText class="truncate font-medium text-highlighted" :text="row.original.label ?? row.original.name" :query="props.query" />
                <UBadge v-if="row.original.builtin" color="neutral" variant="subtle" size="sm" :label="$t('agents.label.builtin')" />
                <!-- A support worker of a base, which follows that base (the agency's docs/worker-slots.md). -->
                <UBadge v-if="isSupport(row.original)" color="neutral" variant="subtle" size="sm">
                  <SearchText :text="$t('agents.label.support')" :query="props.query" />
                </UBadge>
                <!-- A worker whose own warming switch is down, so the list says it without opening it. -->
                <UBadge v-if="row.original.keepaliveStopped" color="warning" variant="subtle" size="sm">
                  <SearchText :text="$t(KEEPALIVE_OFF_LABEL)" :query="props.query" />
                </UBadge>
                <!-- A directory that is not a checkout: ordinary jobs only, no co-work. A support
                     worker's worktree is made with its first job, so it is never marked so. -->
                <UBadge v-if="row.original.checkout === false && !isSupport(row.original)" color="neutral" variant="subtle" size="sm">
                  <SearchText :text="$t(NOT_CHECKOUT_LABEL)" :query="props.query" />
                </UBadge>
              </span>
              <SearchText class="truncate font-mono text-muted" :text="row.original.name" :query="props.query" />
            </span>
          </span>
        </SettingsInputCell>
      </template>

      <template #cwd-cell="{ row }">
        <SettingsInputCell
          kind="text"
          mono
          :value="row.original.cwd ?? ''"
          :label="$t('agents.aria.cwd_of', { name: row.original.name })"
          :help="$t('agents.label.no_cowork_without_git')"
          :disabled="row.original.builtin || isSupport(row.original)"
          :check="(text: string) => (text.trim() === '' ? $t('agents.error.path_needed') : null)"
          :save="(text: string) => update(row.original, { path: text })"
        >
          <!-- A path is the one cell allowed to run past its width; it scrolls inside itself. -->
          <span data-overflow-cell class="block max-w-full overflow-x-auto whitespace-nowrap [scrollbar-width:thin]">
            <SearchText class="font-mono text-muted" :text="row.original.cwd ?? '—'" :query="props.query" />
          </span>
          <!-- The documents its session prefix carries, in their order, under the path they are read against. -->
          <span v-if="(row.original.prefixDocuments ?? []).length > 0" data-prefix-documents class="flex min-w-0 items-baseline gap-1.5 text-sm text-dimmed">
            <span class="shrink-0">{{ $t("agents.label.prefix_documents") }}</span>
            <SearchText class="truncate font-mono" :text="(row.original.prefixDocuments ?? []).join(' · ')" :query="props.query" />
          </span>
        </SettingsInputCell>
      </template>

      <template #mode-cell="{ row }">
        <span :class="CELL_TEXT">
          <SearchText class="truncate text-highlighted" :text="startText(row.original)" :query="props.query" />
          <span class="truncate tabular-nums text-muted">{{ $t("agents.label.runs", { n: countText(row.original.runs) }) }}</span>
        </span>
      </template>

      <template #actions-cell="{ row }">
        <span class="flex min-h-12 items-center justify-end pe-2">
          <UDropdownMenu :items="menuOf(row.original)" :content="{ align: 'end' }">
            <UTooltip :text="$t('common.aria.menu_of', { name: row.original.name })">
              <UButton color="neutral" variant="ghost" size="sm" icon="i-material-symbols-more-vert" :aria-label="$t('common.aria.menu_of', { name: row.original.name })" />
            </UTooltip>
          </UDropdownMenu>
        </span>
      </template>
    </DataTable>

    <p v-if="failed !== ''" role="alert" class="px-4 py-2 text-sm text-error">{{ failed }}</p>

    <!-- Adding one, or the whole of one: the same dialog a worker's own agent screen opens. -->
    <WorkerSettingsDialog v-model:open="editing" :worker="editWorker" :reread="props.reread" />

    <SettingsDialog v-model:open="removing" :title="$t('common.title.delete_named', { name: removeName })">
      <p class="text-sm text-toned">{{ $t("agents.message.worker_delete_confirm") }}</p>

      <template #footer>
        <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="busy !== ''" @click="removing = false" />
        <UButton :label="$t('common.action.delete')" color="error" :loading="busy === 'remove'" :disabled="busy !== ''" @click="remove" />
      </template>
    </SettingsDialog>
  </section>
</template>

<script setup lang="ts">
import { CELL_TEXT, settingsAnchor } from "~/domain/agent-settings";
import { KEEPALIVE_OFF_LABEL, NOT_CHECKOUT_LABEL } from "~/domain/agents";
import { failureText } from "bmo-ui/app/domain/errors";
import { countText } from "~/domain/numbers";
import { agentStartText } from "~/domain/status";

import type { AgentSummary } from "#shared/types";
import type { DropdownMenuItem, TableColumn } from "@nuxt/ui";

interface Props {
  workers: AgentSummary[];
  // The catalogue read back once a change was taken.
  reread: () => Promise<void>;
  query?: string;
}

const { t } = useI18n();
const props = withDefaults(defineProps<Props>(), { query: "" });

const columns: TableColumn<AgentSummary>[] = [
  { accessorKey: "name", header: t("common.label.worker"), meta: { class: { th: "w-[30%]" } } },
  { accessorKey: "cwd", header: t("agents.label.column_cwd") },
  { id: "mode", header: t("agents.label.column_auto_job"), meta: { class: { th: "w-[22%]" } } },
  { id: "actions", header: "", meta: { class: { th: "w-12" } } }
];

const busy = ref("");
const failed = ref("");
const editing = ref(false);
// The worker the dialog opens on; none is a new one.
const editWorker = ref<AgentSummary | null>(null);
const removing = ref(false);
const removeName = ref("");

// What an automatic job of this worker starts on, from the order and the worker key every worker
// follows together.
function startText(worker: AgentSummary): string {
  if (!worker.configuredMode) return t("agents.label.no_route");

  return agentStartText(t, worker);
}

// A support worker follows its base: its name and place are the base's to set, and it is counted
// up and down rather than removed (the agency's docs/worker-slots.md).
function isSupport(worker: AgentSummary): boolean {
  return typeof worker.supportOf === "string" && worker.supportOf !== "";
}

function menuOf(worker: AgentSummary): DropdownMenuItem[] {
  return [
    { label: t("common.action.edit"), icon: "i-material-symbols-edit-outline", onSelect: () => openEdit(worker) },
    { label: t("agents.action.log"), icon: "i-material-symbols-description-outline", to: `/agents/${encodeURIComponent(worker.name)}` },
    ...(worker.builtin || isSupport(worker)
      ? []
      : [{ label: t("common.action.delete"), icon: "i-material-symbols-delete-outline", color: "error" as const, onSelect: () => { removeName.value = worker.name; removing.value = true; } }])
  ];
}

function openAdd(): void {
  editWorker.value = null;
  editing.value = true;
}

function openEdit(worker: AgentSummary): void {
  editWorker.value = worker;
  editing.value = true;
}

// One cell's value, sent as the worker's update; a field left out stays as it stands.
async function update(worker: AgentSummary, change: { label?: string; path?: string }): Promise<string | null> {
  try {
    await $fetch("/api/workers", {
      method: "POST",
      body: {
        action: "update",
        name: worker.name,
        label: change.label?.trim(),
        path: worker.builtin ? undefined : change.path?.trim()
      }
    });
    await props.reread();

    return null;
  } catch (error) {
    return failureText(error, t("common.error.save_failed"));
  }
}

defineExpose({ openAdd });

async function remove(): Promise<void> {
  busy.value = "remove";
  failed.value = "";

  try {
    await $fetch("/api/workers", { method: "POST", body: { action: "remove", name: removeName.value } });
    await props.reread();
    removing.value = false;
  } catch (error) {
    failed.value = failureText(error, t("common.error.save_failed"));
  } finally {
    busy.value = "";
  }
}
</script>
