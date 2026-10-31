<template>
  <!-- The models the registry holds (the agency's docs/api.md, 「providers, models, pin-checks, tiers and
       fallback」): each registration's own name, the model behind it, the first tier it is mapped at and
       whether its addresses answer. -->
  <section :id="settingsAnchor('registry')" class="flex flex-col gap-3" aria-labelledby="registry-title">
    <h2 id="registry-title" class="text-lg font-semibold text-highlighted">{{ generalSectionTitle($t, "registry") }}</h2>

    <ReadFailure v-if="props.failed && props.models === null" :failure="readFailure" :message="$t('agents.error.registry_read_failed')" :reading="props.reading" @retry="props.reread()" />

    <AgentsRegistrySkeleton v-else-if="props.models === null" :rows="REGISTRY_WAITING" />

    <ul v-else class="flex flex-col divide-y divide-default overflow-hidden rounded-lg border border-default" :aria-label="$t('agents.title.registry')">
      <li v-for="row in rows" :key="row.model.key" :data-registration="row.name" class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 py-2 ps-4 pe-2">
        <span class="flex min-w-0 flex-col gap-1">
          <span class="flex min-w-0 items-center gap-2">
            <SearchText class="truncate text-sm font-medium text-highlighted" :text="row.name" :query="props.query" />
            <span v-if="row.health !== null" class="flex shrink-0 items-center gap-1 text-sm text-muted">
              <UIcon :name="row.health.icon" class="size-4 shrink-0" :class="row.health.tone" aria-hidden="true" />
              {{ row.health.text }}
            </span>
          </span>
          <SearchText class="truncate font-mono text-sm text-toned" :text="row.model.model" :query="props.query" />
          <span class="text-sm text-muted">
            {{ $t("agents.label.tier") }}
            <SearchText class="font-mono" :text="row.model.tier ?? '—'" :query="props.query" />
          </span>
        </span>

        <UDropdownMenu :items="menuOf(row.model)" :content="{ align: 'end' }">
          <UTooltip :text="$t('common.aria.menu_of', { name: row.name })">
            <UButton color="neutral" variant="ghost" size="sm" icon="i-material-symbols-more-vert" :aria-label="$t('common.aria.menu_of', { name: row.name })" />
          </UTooltip>
        </UDropdownMenu>
      </li>

      <li v-if="rows.length === 0" class="px-4 py-3 text-sm text-muted">{{ $t("agents.status.no_registrations") }}</li>
    </ul>

    <p v-if="removeFailed !== ''" role="alert" class="break-words text-sm text-error">{{ removeFailed }}</p>

    <SettingsDialog v-model:open="editing" :title="adding ? $t('agents.title.registry_add') : form.name" :dirty="formDirty">
      <form id="registry-form" class="flex flex-col gap-4" @submit.prevent="save">
        <UFormField :label="$t('common.label.name')" name="name" :error="errorAt('name')">
          <UInput v-model="form.name" class="w-full font-mono" :disabled="!adding" :placeholder="$t('agents.placeholder.registry_name')" :aria-label="$t('common.label.name')" />
        </UFormField>

        <UFormField :label="$t('common.label.model')" name="model" :error="errorAt('model')">
          <UInput v-model="form.model" class="w-full font-mono" :aria-label="$t('common.label.model')" />
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
import { settingsAnchor } from "~/domain/agent-settings";
import { GENERAL_SECTIONS, generalSectionTitle } from "~/domain/agents";
import { failureText } from "bmo-ui/app/domain/errors";
import { useReadFailure } from "~/domain/events";
import { useConfirm } from "~/domain/confirm";
import { emptyModelForm, healthMark, healthText, modelChange, modelCreate, modelForm, modelRefusalPlace, registrationName } from "~/domain/registry";

import type { ModelPage, ModelView } from "#shared/agency";
import type { DropdownMenuItem } from "@nuxt/ui";
import type { ModelForm } from "~/domain/registry";

interface Props {
  // The registered models as the page last read them, or null before its first read has landed.
  models: ModelPage | null;
  failed?: boolean;
  // Whether the page is reading the models now.
  reading?: boolean;
  // Every change is asked of the bot and then read back by the page, which this waits for.
  reread: () => Promise<void>;
  query?: string;
}

const props = withDefaults(defineProps<Props>(), { failed: false, reading: false, query: "" });
const { t } = useI18n();
const readFailure = useReadFailure({ failed: () => props.failed && props.models === null, reading: () => props.reading, reread: () => void props.reread() });
const askFirst = useConfirm();
// As many waiting rows as the page's own waiting shape stood with.
const REGISTRY_WAITING = GENERAL_SECTIONS.find((one) => one.id === "registry")?.waiting ?? 1;

const rows = computed(() => (props.models?.items ?? []).map((one) => {
  const mark = healthMark(one.healthy);

  return { model: one, name: registrationName(one.key), health: mark === null ? null : { ...mark, text: healthText(t, one.healthy, one.lastAnsweredAt ?? null) } };
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

function menuOf(model: ModelView): DropdownMenuItem[] {
  return [
    { label: t("common.action.edit"), icon: "i-material-symbols-edit-outline", onSelect: () => openEdit(model) },
    { label: t("common.action.delete"), icon: "i-material-symbols-delete-outline", color: "error" as const, onSelect: () => void remove(model) }
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

    await props.reread();
    editing.value = false;
  } catch (error) {
    const { field, text } = refusalOf(error);

    refusal.value = { place: modelRefusalPlace(field), text };
  } finally {
    busy.value = false;
  }
}

// A removal is asked first in a dialog; what the bot refuses it for — a tier or a pin still naming the
// registration — stands under the list.
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
    await props.reread();
  } catch (error) {
    removeFailed.value = failureText(error, t("common.error.save_failed"));
  }
}

defineExpose({ openAdd });
</script>
