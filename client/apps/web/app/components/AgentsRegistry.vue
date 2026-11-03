<template>
  <!-- The registered models (docs/web.md, 「Agent management screen」, the registered models tab; the agency's
       docs/api.md, 「providers, models and model files」): one row each, its name with a mark saying whether its engine
       answers, the model behind it, what names it and its card service. A row's more-menu changes or removes it. -->
  <section class="flex min-h-0 min-w-0 flex-1 flex-col" :aria-label="$t('agents.label.tab_models')">
    <DataTableSkeleton v-if="models === undefined && !error" layout="fill" :headers="tableHeaders(columns)" :rows="3" :label="$t('agents.status.registry_loading')" />
    <ReadFailure
      v-else-if="error && models === undefined"
      class="mx-4 my-4 w-auto"
      :failure="readFailure"
      :message="$t('agents.error.registry_read_failed')"
      :reading="status === 'pending'"
      @retry="refresh()"
    />
    <p v-else-if="models !== undefined && rows.length === 0" class="px-4 py-3 text-sm text-muted">{{ $t("agents.status.no_registrations") }}</p>

    <SettingsTable v-if="models !== undefined && rows.length > 0" layout="fill" :data="rows" :columns="columns" :row-key="(row: RegistryRow) => row.name">
      <template #name-cell="{ row }">
        <span :id="settingsAnchor(`registry-${row.original.name}`)" :class="CELL_TEXT" class="ps-4" :data-registration="row.original.name">
          <span class="flex min-w-0 items-center gap-2">
            <SearchText class="truncate text-sm font-medium text-highlighted" :text="row.original.name" :query="props.query" />
            <span v-if="row.original.health !== null" class="flex shrink-0 items-center gap-1 text-sm text-muted">
              <UIcon :name="row.original.health.icon" class="size-4 shrink-0" :class="row.original.health.tone" aria-hidden="true" />
              {{ row.original.health.text }}
            </span>
          </span>
        </span>
      </template>

      <template #model-cell="{ row }">
        <span :class="CELL_TEXT">
          <SearchText class="whitespace-nowrap font-mono text-sm text-toned" :text="row.original.model.model" :query="props.query" />
        </span>
      </template>

      <template #usedBy-cell="{ row }">
        <span :class="CELL_TEXT" class="w-full text-sm">
          <span v-if="row.original.usedBy.length === 0" class="text-muted">—</span>
          <span v-else class="truncate text-toned">
            <template v-for="(one, at) in row.original.usedBy" :key="one">
              <span v-if="at > 0" class="text-muted"> · </span>
              <SearchText :text="one" :query="props.query" />
            </template>
          </span>
        </span>
      </template>

      <template #cardService-cell="{ row }">
        <span :class="CELL_TEXT" class="text-sm">
          <span class="whitespace-nowrap font-mono" :class="row.original.model.cardService ? 'text-toned' : 'text-muted'">{{ row.original.model.cardService ?? "—" }}</span>
        </span>
      </template>

      <template #actions-cell="{ row }">
        <span class="flex h-full min-h-12 items-center justify-end pe-2">
          <UDropdownMenu :items="menuOf(row.original)" :content="{ align: 'end' }">
            <UTooltip :text="$t('common.aria.menu_of', { name: row.original.name })">
              <UButton color="neutral" variant="ghost" size="sm" icon="i-material-symbols-more-vert" :aria-label="$t('common.aria.menu_of', { name: row.original.name })" />
            </UTooltip>
          </UDropdownMenu>
        </span>
      </template>
    </SettingsTable>

    <p v-if="removeFailed !== ''" role="alert" class="px-4 py-2 break-words text-sm text-error">{{ removeFailed }}</p>

    <SettingsDialog v-model:open="editing" :title="adding ? $t('agents.title.registry_add') : form.name" :dirty="formDirty">
      <form id="registry-form" class="flex flex-col gap-4" @submit.prevent="save">
        <UFormField :label="$t('common.label.name')" name="name" :error="errorAt('name')">
          <UInput v-model="form.name" class="w-full font-mono" :disabled="!adding" :placeholder="$t('agents.placeholder.registry_name')" :aria-label="$t('common.label.name')" />
        </UFormField>

        <UFormField :label="$t('common.label.model')" name="model" :error="errorAt('model')">
          <UInput v-model="form.model" class="w-full font-mono" :aria-label="$t('common.label.model')" />
        </UFormField>

        <UFormField :label="$t('agents.label.card_service')" name="cardService" :error="errorAt('cardService')">
          <UInput v-model="form.cardService" class="w-full font-mono" :aria-label="$t('agents.label.card_service')" />
        </UFormField>

        <UFormField name="roleFiles" :error="errorAt('roleFiles')">
          <USwitch v-model="form.roleFiles" :label="$t('agents.label.role_files')" :disabled="form.cardService.trim() === ''" />
        </UFormField>

        <p v-if="errorAt('form') !== undefined" role="alert" class="break-words text-sm text-error">{{ errorAt("form") }}</p>
      </form>

      <template #footer="{ close }">
        <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="busy" @click="close()" />
        <UButton type="submit" form="registry-form" :label="adding ? $t('common.action.add') : $t('common.action.save')" :loading="busy" :disabled="busy || !formDirty" />
      </template>
    </SettingsDialog>
  </section>
</template>

<script setup lang="ts">
import { tableHeaders } from "bmo-ui/app/domain/column-widths";
import { failureText } from "bmo-ui/app/domain/errors";

import { settingsAnchor } from "~/domain/agent-settings";
import { useConfirm } from "~/domain/confirm";
import { useReadFailure } from "~/domain/events";
import { emptyModelForm, healthMark, healthText, modelChange, modelCreate, modelForm, modelRefusalPlace, registrationName, usedByText } from "~/domain/registry";
import { CELL_TEXT } from "~/domain/settings-cells";

import type { ModelPage, ModelView } from "#shared/agency";
import type { DropdownMenuItem } from "@nuxt/ui";
import type { ModelForm } from "~/domain/registry";
import type { SettingsColumn } from "~/domain/settings-columns";

const props = withDefaults(defineProps<{ query?: string }>(), { query: "" });
const { t } = useI18n();
const askFirst = useConfirm();

// The page's search reads the same answer under the same key.
const { data: models, error, refresh, status } = useFetch<ModelPage>("/api/models", { key: "models", lazy: true, server: false });
const readFailure = useReadFailure({ failed: () => !!error.value && models.value === undefined, reading: () => status.value === "pending", reread: () => void refresh() });

interface RegistryRow {
  model: ModelView;
  name: string;
  usedBy: string[];
  health: { icon: string; tone: string; text: string } | null;
}

const columns = computed<SettingsColumn<RegistryRow>[]>(() => [
  { id: "name", header: t("common.label.name") },
  { id: "model", header: t("common.label.model") },
  { id: "usedBy", header: t("agents.label.used_by"), ceiling: 288 },
  { id: "cardService", header: t("agents.label.card_service") },
  { id: "actions", header: "" }
]);

const rows = computed<RegistryRow[]>(() => (models.value?.items ?? []).map((one) => {
  const mark = healthMark(one.healthy);

  return {
    model: one,
    name: registrationName(one.key),
    usedBy: (one.usedBy ?? []).map((used) => usedByText(t, used)),
    health: mark === null ? null : { ...mark, text: healthText(t, one.healthy, one.lastAnsweredAt ?? null) }
  };
}));

const busy = ref(false);
const editing = ref(false);
const adding = ref(false);
const form = ref<ModelForm>(emptyModelForm());
// The box as it opened; its Save button is on only while it differs (docs/web.md, 「Forms」).
const formOpened = ref(JSON.stringify(form.value));
const formDirty = computed(() => JSON.stringify(form.value) !== formOpened.value);
// The registration an edit changes, whose name is fixed once made.
const editedName = ref("");
// The refusal the bot gave the last save, and where in the box it stands.
const removeFailed = ref("");
const refusal = ref<{ place: string; text: string } | null>(null);

function errorAt(place: string): string | undefined {
  return refusal.value?.place === place ? refusal.value.text : undefined;
}

// A registration anything names is not removed, which its menu item says by naming what does.
function menuOf(row: RegistryRow): DropdownMenuItem[] {
  const named = row.usedBy.length > 0;

  return [
    { label: t("common.action.edit"), icon: "i-material-symbols-edit-outline", onSelect: () => openEdit(row.model) },
    {
      label: t("common.action.delete"),
      icon: "i-material-symbols-delete-outline",
      color: "error" as const,
      disabled: named,
      ...(named ? { description: t("agents.status.registration_in_use", { names: row.usedBy.join(", ") }) } : {}),
      onSelect: () => void remove(row.model)
    }
  ];
}

function openAdd(): void {
  adding.value = true;
  editedName.value = "";
  form.value = emptyModelForm();
  formOpened.value = JSON.stringify(form.value);
  refusal.value = null;
  editing.value = true;
}

function openEdit(model: ModelView): void {
  adding.value = false;
  editedName.value = registrationName(model.key);
  form.value = modelForm(model);
  formOpened.value = JSON.stringify(form.value);
  refusal.value = null;
  editing.value = true;
}

function refusalOf(error: unknown): { field: string | null; text: string } {
  const data = (error as { data?: { data?: { field?: unknown } } } | null)?.data?.data;

  return { field: typeof data?.field === "string" ? data.field : null, text: failureText(error, t("common.error.save_failed")) };
}

async function save(): Promise<void> {
  busy.value = true;
  refusal.value = null;

  try {
    if (adding.value) {
      await $fetch<ModelView>("/api/models", { method: "POST", body: modelCreate(form.value) });
    } else {
      await $fetch<ModelView>(`/api/models/${encodeURIComponent(editedName.value)}`, { method: "PATCH", body: modelChange(form.value) });
    }

    await refresh();
    editing.value = false;
  } catch (error) {
    const { field, text } = refusalOf(error);

    refusal.value = { place: modelRefusalPlace(field), text };
  } finally {
    busy.value = false;
  }
}

// A removal is asked first in a dialog; what the agency refuses it for stands under the table.
async function remove(model: ModelView): Promise<void> {
  const name = registrationName(model.key);
  const taken = await askFirst({
    title: t("agents.message.registry_delete_confirm"),
    item: name,
    confirm: t("common.action.delete")
  });

  if (!taken) return;

  removeFailed.value = "";

  try {
    await $fetch(`/api/models/${encodeURIComponent(name)}`, { method: "DELETE" });
    await refresh();
  } catch (error) {
    removeFailed.value = failureText(error, t("common.error.save_failed"));
  }
}

defineExpose({ openAdd, refresh });
</script>
