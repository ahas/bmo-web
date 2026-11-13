<template>
  <!-- The model files the deployment's own engines serve (docs/web.md, 「Agent management screen」, the model files tab;
       the agency's docs/model-catalogue.md): above the table the latest choice of one for each engine, read again every
       few seconds while one runs; under it one row for each entry. -->
  <section class="flex min-h-0 min-w-0 flex-1 flex-col" :aria-label="$t('agents.label.tab_model_files')">
    <ul v-if="catalogue !== undefined && catalogue.uses.length > 0" class="flex flex-col gap-2 px-4 py-3" :aria-label="$t('agents.title.catalogue_uses')">
      <li v-for="use in catalogue.uses" :key="use.id" :data-use="use.engine" class="flex flex-col gap-1 text-sm">
        <span class="flex min-w-0 items-center gap-2">
          <UIcon :name="useMark(use.state).icon" class="size-4 shrink-0" :class="[useMark(use.state).tone, use.state === 'running' ? 'animate-spin motion-reduce:animate-none' : '']" />
          <span class="min-w-0 truncate text-toned">{{ useText($t, use) }}</span>
          <span class="ms-auto shrink-0 tabular-nums text-muted">{{ timeText(use.startedAt) }}</span>
        </span>
        <pre
          v-if="use.logTail.length > 0 && use.state !== 'done'"
          class="overflow-x-auto rounded-md bg-elevated px-3 py-2 font-mono text-sm text-toned"
        >{{ use.logTail.join("\n") }}</pre>
      </li>
    </ul>

    <DataTableSkeleton v-if="catalogue === undefined && status !== 'error'" layout="fill" :headers="tableHeaders(columns)" :rows="3" :label="$t('agents.status.catalogue_loading')" />
    <ReadFailure
      v-else-if="status === 'error' && catalogue === undefined"
      class="mx-4 my-4 w-auto"
      :failure="readFailure"
      :message="$t('agents.error.catalogue_read_failed')"
      :reading="false"
      @retry="refresh()"
    />
    <p v-else-if="catalogue !== undefined && catalogue.entries.length === 0" class="px-4 py-3 text-sm text-muted">{{ $t("agents.status.no_catalogue") }}</p>

    <SettingsTable v-if="catalogue !== undefined && catalogue.entries.length > 0" layout="fill" :data="catalogue.entries" :columns="columns" :row-key="(row: CatalogueEntryView) => row.name">
      <template #entry-cell="{ row }">
        <span :id="settingsAnchor(`catalogue-${row.original.name}`)" :class="CELL_TEXT" class="ps-4" :data-entry="row.original.name">
          <span class="flex min-w-0 items-center gap-2">
            <SearchText class="truncate text-sm font-medium text-highlighted" :text="row.original.label" :query="props.query" />
            <UBadge v-if="row.original.serving" color="success" variant="subtle" size="sm" class="shrink-0">{{ $t("agents.label.serving") }}</UBadge>
          </span>
          <SearchText class="truncate font-mono text-sm text-muted" :text="row.original.name" :query="props.query" />
        </span>
      </template>

      <template #file-cell="{ row }">
        <span :class="CELL_TEXT" class="w-full">
          <SearchText class="truncate font-mono text-sm text-toned" :text="row.original.file" :query="props.query" />
        </span>
      </template>

      <template #size-cell="{ row }">
        <span :class="CELL_TEXT" class="whitespace-nowrap text-sm tabular-nums text-highlighted">{{ sizeText(row.original.bytes) }}</span>
      </template>

      <template #sha-cell="{ row }">
        <span :class="CELL_TEXT" class="font-mono text-sm text-muted">{{ row.original.sha256.slice(0, 12) }}</span>
      </template>

      <template #source-cell="{ row }">
        <span :class="CELL_TEXT" class="w-full">
          <span class="truncate text-sm text-toned">{{ sourceText($t, row.original.source) }}</span>
        </span>
      </template>

      <template #engine-cell="{ row }">
        <span :class="CELL_TEXT" class="text-sm">
          <SearchText class="whitespace-nowrap font-mono text-toned" :text="row.original.engine ?? '—'" :query="props.query" />
          <SearchText class="whitespace-nowrap font-mono text-muted" :text="row.original.registration ?? '—'" :query="props.query" />
        </span>
      </template>

      <template #nodes-cell="{ row }">
        <span :class="CELL_TEXT">
          <span v-if="row.original.nodes.length > 0" class="flex flex-wrap gap-1">
            <UBadge v-for="node in row.original.nodes" :key="node" color="neutral" variant="subtle" size="sm" class="font-mono">{{ node }}</UBadge>
          </span>
          <span v-else class="text-sm text-muted">—</span>
        </span>
      </template>

      <!-- Its defaults on one line, each a name and its value, cut at the column's ceiling. -->
      <template #defaults-cell="{ row }">
        <span :class="CELL_TEXT" class="w-full text-sm">
          <span class="truncate">
            <template v-for="(pair, at) in defaultsPairs($t, row.original)" :key="pair.name">
              <span v-if="at > 0" class="text-muted"> · </span>
              <span class="text-muted">{{ pair.name }} </span>
              <span class="tabular-nums text-highlighted">{{ pair.value }}</span>
            </template>
          </span>
        </span>
      </template>

      <template #note-cell="{ row }">
        <span :class="CELL_TEXT" class="w-full">
          <span class="truncate text-sm text-muted">{{ row.original.note ?? "—" }}</span>
        </span>
      </template>

      <template v-if="!props.readonly" #actions-cell="{ row }">
        <span class="flex h-full min-h-12 items-center justify-end pe-2">
          <UDropdownMenu :items="menuOf(row.original)" :content="{ align: 'end' }">
            <UTooltip :text="$t('common.aria.menu_of', { name: row.original.label })">
              <UButton color="neutral" variant="ghost" size="sm" icon="i-material-symbols-more-vert" :aria-label="$t('common.aria.menu_of', { name: row.original.label })" />
            </UTooltip>
          </UDropdownMenu>
        </span>
      </template>
    </SettingsTable>

    <p v-if="actionFailed !== ''" role="alert" class="px-4 py-2 break-words text-sm text-error">{{ actionFailed }}</p>

    <SettingsDialog v-model:open="editing" :title="adding ? $t('agents.title.catalogue_add') : form.label || form.name" :description="adding || form.label === '' || form.label === form.name ? undefined : form.name" :dirty="formDirty">
      <form id="catalogue-form" class="flex flex-col gap-4" @submit.prevent="save">
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField :label="$t('common.label.name')" name="name" :error="errorAt('name')">
            <UInput v-model="form.name" class="w-full font-mono" :disabled="!adding" :aria-label="$t('common.label.name')" />
          </UFormField>
          <UFormField :label="$t('agents.label.worker_label')" name="label" :error="errorAt('label')">
            <UInput v-model="form.label" class="w-full" :placeholder="form.name" :aria-label="$t('agents.label.worker_label')" />
          </UFormField>
        </div>

        <UFormField :label="$t('agents.label.model_file')" name="file" :error="errorAt('file')">
          <UInput v-model="form.file" class="w-full font-mono" placeholder="model-Q4_K_M.gguf" :aria-label="$t('agents.label.model_file')" />
        </UFormField>

        <div class="grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
          <UFormField :label="$t('agents.label.model_bytes')" name="bytes" :error="errorAt('bytes')">
            <NumberInput v-model="form.bytes" v-bind="WHOLE_NUMBER" :digits="15" :aria-label="$t('agents.label.model_bytes')" />
          </UFormField>
          <UFormField label="SHA-256" name="sha256" :error="errorAt('sha256')">
            <UInput v-model="form.sha256" class="w-full min-w-0 font-mono" aria-label="SHA-256" />
          </UFormField>
        </div>

        <UFormField :label="$t('agents.label.model_source')" name="source" :error="errorAt('source')">
          <UInput v-model="form.source" class="w-full font-mono" placeholder="https://… | train-a/run" :aria-label="$t('agents.label.model_source')" />
        </UFormField>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField :label="$t('agents.label.engine')" name="engine" :error="errorAt('engine')">
            <UInput v-model="form.engine" class="w-full font-mono" placeholder="engine-a" :aria-label="$t('agents.label.engine')" />
          </UFormField>
          <UFormField :label="$t('agents.title.registry')" name="registration" :error="errorAt('registration')">
            <UInput v-model="form.registration" class="w-full font-mono" :aria-label="$t('agents.title.registry')" />
          </UFormField>
        </div>

        <div class="grid gap-4 sm:grid-cols-3">
          <UFormField :label="$t('agents.label.thinking')" name="thinking" :error="errorAt('thinking')">
            <USelect :model-value="form.thinking === '' ? undefined : form.thinking" :items="thinkingItems" value-key="value" class="w-full" :aria-label="$t('agents.label.thinking')" @update:model-value="(value: string) => (form.thinking = value === 'on' ? 'on' : 'off')" />
          </UFormField>
          <UFormField v-for="one in GENERATION_FIELDS" :key="one.field" :label="one.label" :name="one.field" :error="errorAt(one.field)">
            <NumberInput
              v-model="form[one.field]"
              :min="one.min"
              :max="one.max"
              :step="one.step"
              :digits="one.field === 'maxTokens' ? 9 : 4"
              :format-options="{ useGrouping: true, maximumFractionDigits: one.field === 'maxTokens' ? 0 : 2 }"
              locale="en-US"
              :aria-label="one.label"
            />
          </UFormField>
        </div>

        <UFormField :label="$t('agents.label.note')" name="note" :error="errorAt('note')">
          <GrowingTextarea v-model="form.note" :rows="2" :aria-label="$t('agents.label.note')" />
        </UFormField>

        <p v-if="errorAt('form') !== undefined" role="alert" class="break-words text-sm text-error">{{ errorAt("form") }}</p>
      </form>

      <template #footer="{ close }">
        <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="busy" @click="close()" />
        <UButton type="submit" form="catalogue-form" :label="adding ? $t('common.action.add') : $t('common.action.save')" :loading="busy" :disabled="busy || !formDirty" />
      </template>
    </SettingsDialog>
  </section>
</template>

<script setup lang="ts">
import { tableHeaders } from "bmo-ui/app/domain/column-widths";
import { failureText } from "bmo-ui/app/domain/errors";

import { settingsAnchor } from "~/domain/agent-settings";
import { anyRunning, catalogueForm, catalogueRefusalPlace, catalogueSave, defaultsPairs, emptyCatalogueForm, GENERATION_FIELDS, sizeText, sourceText, useText } from "~/domain/catalogue-models";
import { useConfirm } from "~/domain/confirm";
import { useReadFailure } from "~/domain/events";
import { CELL_TEXT } from "~/domain/settings-cells";

import type { CatalogueEntryView, CatalogueView } from "#shared/agency";
import type { DropdownMenuItem } from "@nuxt/ui";
import type { CatalogueForm } from "~/domain/catalogue-models";
import type { SettingsColumn } from "~/domain/settings-columns";

const props = withDefaults(defineProps<{ query?: string; readonly?: boolean }>(), { query: "", readonly: false });
const { t } = useI18n();
const askFirst = useConfirm();
const WHOLE_NUMBER = { step: 1, formatOptions: { useGrouping: true, maximumFractionDigits: 0 }, locale: "en-US" } as const;

const { data: catalogue, refresh, status } = useFetch<CatalogueView>("/api/model-catalogue", { key: "model-catalogue", lazy: true, server: false });
const readFailure = useReadFailure({ failed: () => status.value === "error" && catalogue.value === undefined, reading: () => status.value === "pending", reread: () => void refresh() });

const columns = computed<SettingsColumn<CatalogueEntryView>[]>(() => [
  { id: "entry", header: t("agents.label.column_model_file") },
  { id: "file", header: t("agents.label.model_file"), ceiling: 288 },
  { id: "size", header: t("agents.label.column_size") },
  { id: "sha", header: "SHA-256" },
  { id: "source", header: t("agents.label.model_source"), ceiling: 240 },
  { id: "engine", header: t("agents.label.engine") },
  { id: "nodes", header: t("agents.label.column_nodes") },
  { id: "defaults", header: t("agents.label.column_model_defaults"), ceiling: 320 },
  { id: "note", header: t("agents.label.note"), ceiling: 240 },
  ...(props.readonly ? [] : [{ id: "actions", header: "" }])
]);

// While a choice runs its progress is read again every few seconds; nothing is read once all have ended.
const POLL_MS = 3_000;
let poll: ReturnType<typeof setInterval> | null = null;

watch(() => anyRunning(catalogue.value?.uses ?? []), (running) => {
  if (running && poll === null) poll = setInterval(() => void refresh(), POLL_MS);
  if (!running && poll !== null) {
    clearInterval(poll);
    poll = null;
  }
}, { immediate: true });

onBeforeUnmount(() => {
  if (poll !== null) clearInterval(poll);
});

const thinkingItems = computed(() => [
  { label: t("agents.label.think_on"), value: "on" },
  { label: t("agents.label.think_off"), value: "off" }
]);

function useMark(state: string): { icon: string; tone: string } {
  return state === "running"
    ? { icon: "i-material-symbols-progress-activity", tone: "text-info" }
    : state === "done" ? { icon: "i-material-symbols-check-circle-outline", tone: "text-success" } : { icon: "i-material-symbols-error-outline", tone: "text-error" };
}

function timeText(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const busy = ref(false);
const editing = ref(false);
const adding = ref(false);
const form = ref<CatalogueForm>(emptyCatalogueForm());
// The box as it opened; its Save button is on only while it differs (docs/web.md, 「Forms」).
const formOpened = ref(JSON.stringify(form.value));
const formDirty = computed(() => JSON.stringify(form.value) !== formOpened.value);
const refusal = ref<{ place: string; text: string } | null>(null);
const actionFailed = ref("");

function errorAt(place: string): string | undefined {
  return refusal.value?.place === place ? refusal.value.text : undefined;
}

function refusalOf(error: unknown): { field: string | null; text: string } {
  const data = (error as { data?: { data?: { field?: unknown } } } | null)?.data?.data;

  return { field: typeof data?.field === "string" ? data.field : null, text: failureText(error, t("common.error.save_failed")) };
}

function menuOf(entry: CatalogueEntryView): DropdownMenuItem[] {
  return [
    { label: t("common.action.edit"), icon: "i-material-symbols-edit-outline", onSelect: () => openEdit(entry) },
    { label: t("agents.action.use_model"), icon: "i-material-symbols-swap-horiz", disabled: entry.serving || entry.engine === null, onSelect: () => void use(entry) },
    { label: t("common.action.delete"), icon: "i-material-symbols-delete-outline", color: "error" as const, disabled: entry.serving, onSelect: () => void remove(entry) }
  ];
}

function openAdd(): void {
  adding.value = true;
  form.value = emptyCatalogueForm();
  formOpened.value = JSON.stringify(form.value);
  refusal.value = null;
  editing.value = true;
}

function openEdit(entry: CatalogueEntryView): void {
  adding.value = false;
  form.value = catalogueForm(entry);
  formOpened.value = JSON.stringify(form.value);
  refusal.value = null;
  editing.value = true;
}

async function save(): Promise<void> {
  busy.value = true;
  refusal.value = null;

  try {
    catalogue.value = await $fetch<CatalogueView>("/api/model-catalogue", { method: "POST", body: catalogueSave(form.value) });
    // What was saved is the box's saved value from here on, so closing asks nothing (docs/web.md, 「Forms」).
    formOpened.value = JSON.stringify(form.value);
    editing.value = false;
  } catch (error) {
    const { field, text } = refusalOf(error);

    refusal.value = { place: catalogueRefusalPlace(field), text };
  } finally {
    busy.value = false;
  }
}

// Choosing an entry for its engine moves every agent on its registration, so it is asked first.
async function use(entry: CatalogueEntryView): Promise<void> {
  const taken = await askFirst({
    title: t("agents.message.use_model_confirm", { engine: entry.engine ?? "", model: entry.label }),
    effect: t("agents.message.use_model_moves", { registration: entry.registration ?? "—" }),
    confirm: t("agents.action.use_model")
  });

  if (!taken) return;

  actionFailed.value = "";

  try {
    catalogue.value = await $fetch<CatalogueView>("/api/model-catalogue", { method: "POST", body: { action: "use", name: entry.name } });
  } catch (error) {
    actionFailed.value = failureText(error, t("common.error.save_failed"));
  }
}

async function remove(entry: CatalogueEntryView): Promise<void> {
  const taken = await askFirst({ title: t("agents.message.catalogue_delete_confirm"), item: entry.label, confirm: t("common.action.delete") });

  if (!taken) return;

  actionFailed.value = "";

  try {
    catalogue.value = await $fetch<CatalogueView>("/api/model-catalogue", { method: "POST", body: { action: "remove", name: entry.name } });
  } catch (error) {
    actionFailed.value = failureText(error, t("common.error.save_failed"));
  }
}

// The tab row's add names this section's add by its word and opens it.
defineExpose({ addLabel: computed(() => t("agents.title.catalogue_add")), openAdd, refresh });
</script>
