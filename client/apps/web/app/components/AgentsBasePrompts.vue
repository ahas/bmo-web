<template>
  <!-- The base prompts an agent's system prompt opens with, each a whole text kept in the archive,
       and the agents that choose each (the agency's docs/base-prompts.md). -->
  <section :id="settingsAnchor('base-prompts')" class="flex flex-col gap-3" aria-labelledby="base-prompts-title">
    <h2 id="base-prompts-title" class="text-lg font-semibold text-highlighted">{{ generalSectionTitle($t, "base-prompts") }}</h2>

    <ReadFailure v-if="error && view === undefined" :failure="readFailure" :message="$t('agents.error.base_prompts_read_failed')" :reading="status === 'pending'" @retry="refresh()" />

    <AgentsRegistrySkeleton v-else-if="view === undefined" :rows="WAITING" />

    <ul v-else class="flex flex-col divide-y divide-default overflow-hidden rounded-lg border border-default" :aria-label="$t('agents.title.base_prompts')">
      <li v-for="one in view.prompts" :key="one.name" :data-base-prompt="one.name" class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 py-2 ps-4 pe-2">
        <span class="flex min-w-0 flex-col gap-1">
          <span class="flex min-w-0 items-center gap-2">
            <SearchText class="truncate text-sm font-medium text-highlighted" :text="one.label" :query="props.query" />
            <SearchText class="truncate font-mono text-sm text-muted" :text="one.name" :query="props.query" />
          </span>
          <span class="text-sm tabular-nums text-muted">{{ [charactersText($t, one), savedText(one)].filter((part) => part !== "").join(" · ") }}</span>
          <SearchText class="text-sm text-toned" :text="choosersText($t, one)" :query="props.query" />
        </span>

        <UDropdownMenu :items="menuOf(one)" :content="{ align: 'end' }">
          <UTooltip :text="$t('common.aria.menu_of', { name: one.label })">
            <UButton color="neutral" variant="ghost" size="sm" icon="i-material-symbols-more-vert" :aria-label="$t('common.aria.menu_of', { name: one.label })" />
          </UTooltip>
        </UDropdownMenu>
      </li>

      <li v-if="view.prompts.length === 0" class="px-4 py-3 text-sm text-muted">{{ $t("agents.status.no_base_prompts") }}</li>
    </ul>

    <p v-if="actionFailed !== ''" role="alert" class="break-words text-sm text-error">{{ actionFailed }}</p>

    <SettingsDialog v-model:open="editing" wide :title="adding ? $t('agents.title.base_prompt_add') : form.label || form.name" :description="adding ? undefined : form.name" :dirty="formDirty">
      <form id="base-prompt-form" class="flex flex-col gap-4" @submit.prevent="save">
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField :label="$t('common.label.name')" name="name" :error="errorAt('name')">
            <UInput v-model="form.name" class="w-full font-mono" :disabled="!adding" :placeholder="$t('agents.placeholder.registry_name')" :aria-label="$t('common.label.name')" />
          </UFormField>
          <UFormField :label="$t('agents.label.worker_label')" name="label" :error="errorAt('label')">
            <UInput v-model="form.label" class="w-full" :placeholder="form.name" :aria-label="$t('agents.label.worker_label')" />
          </UFormField>
        </div>

        <!-- The text grows with what it holds, and the modal's body scrolls, so no scroll of its own
             captures the page's. -->
        <UFormField :label="$t('agents.label.base_prompt_text')" name="text" :error="errorAt('text')" :help="valuesHelp">
          <GrowingTextarea v-model="form.text" :rows="12" class="font-mono" :ui="{ base: 'text-sm' }" :aria-label="$t('agents.label.base_prompt_text')" />
        </UFormField>

        <p v-if="errorAt('form') !== undefined" role="alert" class="break-words text-sm text-error">{{ errorAt("form") }}</p>
        <p v-if="confirming" role="status" class="text-sm text-warning">{{ resetsText }}</p>
      </form>

      <template #footer="{ close }">
        <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="busy" @click="confirming ? (confirming = false) : close()" />
        <UButton type="submit" form="base-prompt-form" :label="adding ? $t('common.action.add') : $t('common.action.save')" :loading="busy" :disabled="busy || !formDirty" />
      </template>
    </SettingsDialog>
  </section>
</template>

<script setup lang="ts">
import { settingsAnchor } from "~/domain/agent-settings";
import { GENERAL_SECTIONS, generalSectionTitle } from "~/domain/agents";
import { basePromptForm, basePromptRefusalPlace, basePromptSave, charactersText, choosersText, emptyBasePromptForm, savedText, savingResets } from "~/domain/base-prompts";
import { failureText } from "bmo-ui/app/domain/errors";
import { useReadFailure } from "~/domain/events";
import { useConfirm } from "~/domain/confirm";

import type { BasePromptView, BasePromptsView } from "#shared/agency";
import type { DropdownMenuItem } from "@nuxt/ui";
import type { BasePromptForm } from "~/domain/base-prompts";

const props = withDefaults(defineProps<{ query?: string }>(), { query: "" });
const { t } = useI18n();
const askFirst = useConfirm();
const WAITING = GENERAL_SECTIONS.find((one) => one.id === "base-prompts")?.waiting ?? 1;

const { data: view, error, refresh, status } = useFetch<BasePromptsView>("/api/base-prompts", { key: "base-prompts", lazy: true, server: false });
const readFailure = useReadFailure({ failed: () => !!error.value && view.value === undefined, reading: () => status.value === "pending", reread: () => void refresh() });

const busy = ref(false);
const editing = ref(false);
const adding = ref(false);
// A save that starts agents' sessions afresh asks first, in the modal itself.
const confirming = ref(false);
const form = ref<BasePromptForm>(emptyBasePromptForm());
// The form as it opened; its Save button is on only while it differs (docs/web.md, 「Forms」).
const formOpened = ref(JSON.stringify(form.value));
const formDirty = computed(() => JSON.stringify(form.value) !== formOpened.value);
const editedFrom = ref<BasePromptView | null>(null);
const refusal = ref<{ place: string; text: string } | null>(null);
const actionFailed = ref("");

const valuesHelp = computed(() => `${t("agents.label.base_prompt_values")} ${(view.value?.values ?? []).map((one) => `{{${one}}}`).join(" ")}`);
const resetsText = computed(() => t("agents.message.base_prompt_resets", { agents: (editedFrom.value?.choosers ?? []).map((one) => one.label).join(", ") }));

function errorAt(place: string): string | undefined {
  return refusal.value?.place === place ? refusal.value.text : undefined;
}

function refusalOf(error: unknown): { field: string | null; text: string } {
  const data = (error as { data?: { data?: { field?: unknown } } } | null)?.data?.data;

  return { field: typeof data?.field === "string" ? data.field : null, text: failureText(error, t("common.error.save_failed")) };
}

function menuOf(prompt: BasePromptView): DropdownMenuItem[] {
  return [
    { label: t("common.action.edit"), icon: "i-material-symbols-edit-outline", onSelect: () => openEdit(prompt) },
    { label: t("common.action.delete"), icon: "i-material-symbols-delete-outline", color: "error" as const, onSelect: () => void remove(prompt) }
  ];
}

function openAdd(): void {
  adding.value = true;
  editedFrom.value = null;
  form.value = emptyBasePromptForm();
  formOpened.value = JSON.stringify(form.value);
  refusal.value = null;
  confirming.value = false;
  editing.value = true;
}

function openEdit(prompt: BasePromptView): void {
  adding.value = false;
  editedFrom.value = prompt;
  form.value = basePromptForm(prompt);
  formOpened.value = JSON.stringify(form.value);
  refusal.value = null;
  confirming.value = false;
  editing.value = true;
}

async function save(): Promise<void> {
  if (!confirming.value && savingResets(form.value, editedFrom.value)) {
    confirming.value = true;
    return;
  }

  busy.value = true;
  refusal.value = null;

  try {
    view.value = await $fetch<BasePromptsView>("/api/base-prompts", { method: "POST", body: basePromptSave(form.value, editedFrom.value) });
    editing.value = false;
  } catch (error) {
    const { field, text } = refusalOf(error);

    refusal.value = { place: basePromptRefusalPlace(field), text };
  } finally {
    busy.value = false;
    confirming.value = false;
  }
}

// A removal is asked first in a dialog; one the bot refuses — an agent still choosing the prompt —
// says why under the list.
async function remove(prompt: BasePromptView): Promise<void> {
  const taken = await askFirst({ title: t("agents.message.base_prompt_delete_confirm"), item: prompt.label, confirm: t("common.action.delete") });

  if (!taken) return;

  actionFailed.value = "";

  try {
    view.value = await $fetch<BasePromptsView>("/api/base-prompts", { method: "POST", body: { action: "remove", name: prompt.name } });
  } catch (error) {
    actionFailed.value = failureText(error, t("common.error.save_failed"));
  }
}

defineExpose({ openAdd, refresh });
</script>
