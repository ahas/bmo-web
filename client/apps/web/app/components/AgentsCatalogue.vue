<template>
  <!-- The model files the deployment's own engines serve (the agency's docs/model-catalogue.md), and the latest choice of one
       for each engine above them, read again every few seconds while one runs. -->
  <section :id="settingsAnchor('catalogue')" class="flex flex-col gap-3" aria-labelledby="catalogue-title">
    <h2 id="catalogue-title" class="text-lg font-semibold text-highlighted">{{ generalSectionTitle($t, "catalogue") }}</h2>

    <UAlert
      v-if="status === 'error' && catalogue === undefined"
      color="error"
      variant="subtle"
      :description="$t('agents.error.catalogue_read_failed')"
      :actions="[{ label: $t('common.action.refresh'), color: 'neutral', variant: 'outline', onClick: () => void refresh() }]"
    />

    <AgentsRegistrySkeleton v-else-if="catalogue === undefined" :rows="CATALOGUE_WAITING" />

    <template v-else>
      <ul v-if="catalogue.uses.length > 0" class="flex flex-col gap-2" :aria-label="$t('agents.title.catalogue_uses')">
        <li v-for="use in catalogue.uses" :key="use.id" :data-use="use.engine" class="flex flex-col gap-1 text-sm">
          <span class="flex min-w-0 items-center gap-2">
            <UIcon :name="useMark(use.state).icon" class="size-4 shrink-0" :class="[useMark(use.state).tone, use.state === 'running' ? 'animate-spin' : '']" />
            <span class="min-w-0 truncate text-toned">{{ useText($t, use) }}</span>
            <span class="ms-auto shrink-0 tabular-nums text-muted">{{ timeText(use.startedAt) }}</span>
          </span>
          <pre
            v-if="use.logTail.length > 0 && use.state !== 'done'"
            class="max-h-48 overflow-auto rounded-md bg-elevated px-3 py-2 font-mono text-sm text-toned"
          >{{ use.logTail.join("\n") }}</pre>
        </li>
      </ul>

      <ul class="flex flex-col divide-y divide-default overflow-hidden rounded-lg border border-default" :aria-label="$t('agents.title.catalogue')">
        <li v-for="one in catalogue.entries" :key="one.name" :data-entry="one.name" class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 py-2 ps-4 pe-2">
          <span class="flex min-w-0 flex-col gap-1">
            <span class="flex min-w-0 items-center gap-2">
              <SearchText class="truncate text-sm font-medium text-highlighted" :text="one.label" :query="props.query" />
              <SearchText class="truncate font-mono text-sm text-muted" :text="one.name" :query="props.query" />
              <UBadge v-if="one.serving" color="success" variant="subtle" size="sm" class="shrink-0">{{ $t("agents.label.serving") }}</UBadge>
            </span>
            <span data-overflow-cell class="block max-w-full overflow-x-auto whitespace-nowrap [scrollbar-width:thin]">
              <SearchText class="font-mono text-sm text-toned" :text="one.file" :query="props.query" />
            </span>
            <span class="text-sm tabular-nums text-muted">
              {{ [sizeText(one.bytes), `sha256 ${one.sha256.slice(0, 12)}`, sourceText($t, one.source), `${one.engine ?? "—"} · ${one.registration ?? "—"}`].join(" · ") }}
            </span>
            <span class="text-sm tabular-nums text-muted">{{ defaultsText($t, one) }}</span>
            <span v-if="one.note !== null" class="break-words text-sm text-muted">{{ one.note }}</span>
            <span v-if="one.nodes.length > 0" class="flex flex-wrap gap-1 pt-1">
              <UBadge v-for="node in one.nodes" :key="node" color="neutral" variant="subtle" size="sm" class="font-mono">{{ node }}</UBadge>
            </span>
          </span>

          <UDropdownMenu :items="menuOf(one)" :content="{ align: 'end' }">
            <UTooltip :text="$t('common.aria.menu_of', { name: one.label })">
              <UButton color="neutral" variant="ghost" size="sm" icon="i-material-symbols-more-vert" :aria-label="$t('common.aria.menu_of', { name: one.label })" />
            </UTooltip>
          </UDropdownMenu>
        </li>

        <li v-if="catalogue.entries.length === 0" class="px-4 py-3 text-sm text-muted">{{ $t("agents.status.no_catalogue") }}</li>
      </ul>
    </template>

    <p v-if="actionFailed !== ''" role="alert" class="break-words text-sm text-error">{{ actionFailed }}</p>

    <SettingsDialog v-model:open="editing" :title="adding ? $t('agents.title.catalogue_add') : form.label || form.name" :description="adding ? undefined : form.name" :dirty="formDirty">
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
            <USelect v-model="form.thinking" :items="thinkingItems" value-key="value" class="w-full" :aria-label="$t('agents.label.thinking')" />
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
              :placeholder="$t('common.label.default_choice')"
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
import { settingsAnchor } from "~/domain/agent-settings";
import { GENERAL_SECTIONS, generalSectionTitle } from "~/domain/agents";
import { anyRunning, catalogueForm, catalogueRefusalPlace, catalogueSave, defaultsText, emptyCatalogueForm, GENERATION_FIELDS, sizeText, sourceText, useText } from "~/domain/catalogue-models";
import { failureText } from "bmo-ui/app/domain/errors";
import { useConfirm } from "~/domain/confirm";

import type { CatalogueEntryView, CatalogueView } from "#shared/agency";
import type { DropdownMenuItem } from "@nuxt/ui";
import type { CatalogueForm } from "~/domain/catalogue-models";

const props = withDefaults(defineProps<{ query?: string }>(), { query: "" });
const { t } = useI18n();
const askFirst = useConfirm();
const CATALOGUE_WAITING = GENERAL_SECTIONS.find((one) => one.id === "catalogue")?.waiting ?? 1;
const WHOLE_NUMBER = { step: 1, formatOptions: { useGrouping: true, maximumFractionDigits: 0 }, locale: "en-US" } as const;

const { data: catalogue, refresh, status } = useFetch<CatalogueView>("/api/model-catalogue", { key: "model-catalogue", lazy: true, server: false });

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
  { label: t("common.label.default_choice"), value: "default" },
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

defineExpose({ openAdd, refresh });
</script>
