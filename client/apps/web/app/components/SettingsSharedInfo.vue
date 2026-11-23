<template>
  <!-- The shared information group of the account section (docs/web.md, 「Settings」): what the reader's organisation may know of them,
       the shared memories about them in their home unit's org memory, one row each with its delete, and the form one
       add opens. A reader who stands in no unit is shown nothing. -->
  <SettingsGroup v-if="view === null || view.unit !== null" :title="$t('org_memory.label.shared_mine')" data-shared-info>
    <template #aside>
      <UButton color="neutral" variant="outline" icon="i-material-symbols-add" :label="$t('org_memory.action.add_info')" :disabled="view === null || working !== ''" data-shared-info-add @click="adding = true" />
    </template>
    <ContentSkeleton v-if="view === null && failure === ''" :rows="2" list-class="flex flex-col divide-y divide-default" :label="$t('org_memory.status.loading')">
      <div class="flex items-center gap-4 py-3">
        <SkeletonLine width="w-2/3" />
        <SkeletonBar class="h-8 w-8 shrink-0 rounded-md" />
      </div>
    </ContentSkeleton>
    <div v-else-if="view === null" class="flex flex-col items-end gap-3 py-3">
      <UAlert class="w-full" color="error" variant="subtle" :description="failure" />
      <UButton color="neutral" variant="subtle" icon="i-material-symbols-refresh" :label="$t('common.action.refresh')" :loading="reading" @click="read" />
    </div>
    <template v-else>
      <SettingsRow v-if="view.memories.length === 0" :label="$t('org_memory.label.no_shared_mine')" />
      <SettingsRow v-for="memory in view.memories" :key="memory.id" :label="memory.text" :description="formatDateClock(Math.floor(memory.writtenAt / 1000))" data-shared-info-row>
        <IconButton icon="i-material-symbols-delete-outline" color="error" :label="$t('org_memory.action.delete_info')" :loading="working === `drop:${memory.id}`" :disabled="working !== ''" data-shared-info-delete @click="drop(memory)" />
      </SettingsRow>
      <p v-if="failure !== ''" role="alert" class="break-words py-3 text-sm text-error">{{ failure }}</p>
    </template>

    <SettingsDialog v-model:open="adding" :title="$t('org_memory.action.add_info')" :dirty="changes">
      <UForm id="shared-info-form" :state="draft" class="flex flex-col gap-4" @submit="save">
        <UFormField :label="$t('org_memory.label.text')" :help="$t('org_memory.label.shared_mine_help')" name="text" required>
          <UTextarea v-model="draft.text" class="w-full" :rows="3" autoresize :maxlength="TEXT_LIMIT" data-shared-info-text />
        </UFormField>
        <UAlert v-if="saveFailure !== ''" color="error" variant="subtle" :description="saveFailure" class="whitespace-pre-line" />
      </UForm>

      <template #footer="{ close }">
        <UButton color="neutral" variant="ghost" :label="$t('common.action.cancel')" @click="close()" />
        <UButton type="submit" form="shared-info-form" :label="$t('common.action.save')" :loading="working === 'add'" :disabled="working !== '' || draft.text.trim() === ''" data-shared-info-save />
      </template>
    </SettingsDialog>
  </SettingsGroup>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { useOpenedWith } from "bmo-ui/app/domain/form-save";
import { formatDateClock } from "bmo-ui/app/domain/time";

import { useConfirm } from "~/domain/confirm";

import type { OwnMemoryView } from "#shared/org-memory";

const { t } = useI18n();
const confirm = useConfirm();

// The brain takes a memory's text up to this many characters (bmo-brain's `docs/boundary-api.md`, 「Strings」).
const TEXT_LIMIT = 64000;

const view = ref<OwnMemoryView | null>(null);
const failure = ref("");
const saveFailure = ref("");
const reading = ref(false);
// The act under way: `add`, or `drop:<memory>`.
const working = ref("");
const adding = ref(false);
const draft = reactive({ text: "" });
const changes = useOpenedWith(() => draft, { open: adding });

async function read(): Promise<void> {
  reading.value = true;
  try {
    view.value = await $fetch<OwnMemoryView>("/api/organization/memory/own");
    failure.value = "";
  } catch (error) {
    failure.value = failureText(error, t("org_memory.error.read_failed"));
  } finally {
    reading.value = false;
  }
}

onMounted(() => void read());

// Every opening starts empty.
watch(adding, (now) => {
  if (!now) return;

  draft.text = "";
  saveFailure.value = "";
});

async function save(): Promise<void> {
  const text = draft.text.trim();

  if (text === "" || working.value !== "") return;

  working.value = "add";
  saveFailure.value = "";
  try {
    await $fetch("/api/organization/memory/own", { method: "POST", body: { text } });
    await changes.take();
    adding.value = false;
    await read();
  } catch (error) {
    saveFailure.value = failureText(error, t("org_memory.error.failed"));
  } finally {
    working.value = "";
  }
}

async function drop(memory: OwnMemoryView["memories"][number]): Promise<void> {
  const taken = await confirm({ title: t("org_memory.message.delete_info"), item: memory.text, effect: t("org_memory.message.delete_info_effect"), confirm: t("common.action.delete") });

  if (!taken) return;

  working.value = `drop:${memory.id}`;
  failure.value = "";
  try {
    await $fetch(`/api/organization/memory/own/${memory.id}`, { method: "DELETE" });
    await read();
  } catch (error) {
    failure.value = failureText(error, t("org_memory.error.failed"));
  } finally {
    working.value = "";
  }
}
</script>
