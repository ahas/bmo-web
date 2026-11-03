<template>
  <!-- A supervisor's settings (docs/web.md, 「Agent management screen」, the supervisors tab): one form with one save at its foot —
       its own settings, then for a supervisor whose turns its settings' pieces make its generation settings, reference,
       persona and system prompt, and for the one whose turns its window makes the texts its system prompt is composed
       of. The supervisors tab and the supervisor's own screen open this one dialog. A save sends the supervisor's change and
       then the rest; a refusal keeps every field as written with the reason under the one it names. -->
  <SettingsDialog v-model:open="open" wide :title="supervisor?.label ?? props.name" :description="supervisor === null || supervisor.label === props.name ? undefined : props.name" :dirty="form.dirty.value">
    <p v-if="failed" role="alert" class="text-sm text-error">{{ $t("agents.error.supervisors_read_failed") }}</p>
    <ContentSkeleton v-else-if="supervisor === null" :rows="3" :label="$t('agents.status.supervisors_loading')">
      <div class="flex flex-col gap-2">
        <SkeletonBar class="h-5 w-32" />
        <SkeletonBar class="h-8 w-full rounded-md" />
      </div>
    </ContentSkeleton>

    <div v-else class="flex flex-col gap-8">
      <SupervisorFields :supervisor="supervisor" @saved="(saved) => (supervisor = saved)" />

      <template v-if="supervisor.turnShape === 'pieces'">
        <p v-if="piecesFailed" role="alert" class="text-sm text-error">{{ $t("agents.error.supervisors_read_failed") }}</p>
        <ContentSkeleton v-else-if="pieces === null" :rows="1" :label="$t('agents.status.supervisors_loading')">
          <SkeletonBar class="h-8 w-full rounded-md" />
        </ContentSkeleton>
        <SupervisorPiecesFields v-else :view="pieces" @saved="(saved) => (pieces = saved)" />
      </template>

      <section v-else-if="supervisor.turnShape === 'window'" class="flex flex-col gap-4">
        <h3 class="text-sm font-medium text-highlighted">{{ $t("agents.title.chat_documents") }}</h3>
        <ChatDocumentsFields />
      </section>
    </div>

    <template #footer="{ close }">
      <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="form.saving.value" @click="close()" />
      <UButton :label="$t('common.action.save')" :loading="form.saving.value" :disabled="!form.dirty.value || form.saving.value" @click="void saveAll()" />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { useFormSave } from "bmo-ui/app/domain/form-save";

import type { SupervisorSettingsView, SupervisorView } from "#shared/axes";

interface Props {
  // The supervisor's name; its settings are read each time the dialog opens.
  name: string;
  // What the screen it was opened on reads again once a save went through.
  reread?: () => Promise<void>;
}

const props = withDefaults(defineProps<Props>(), { reread: async () => {} });
const open = defineModel<boolean>("open", { required: true });

const { t } = useI18n();
const form = useFormSave(t);
const supervisor = ref<SupervisorView | null>(null);
const pieces = ref<SupervisorSettingsView | null>(null);
const failed = ref(false);
const piecesFailed = ref(false);

async function saveAll(): Promise<void> {
  if (!(await form.save())) return;

  open.value = false;
  await props.reread();
}

// Read each time it opens, so it shows what the agency holds now, and nothing typed and thrown away before stands in
// it.
watch(open, async (now) => {
  if (!now) return;

  form.discard();
  failed.value = false;
  piecesFailed.value = false;
  supervisor.value = null;
  pieces.value = null;

  try {
    supervisor.value = await $fetch<SupervisorView>(`/api/supervisors/${encodeURIComponent(props.name)}`);
  } catch {
    failed.value = true;

    return;
  }

  if (supervisor.value.turnShape !== "pieces") return;

  try {
    pieces.value = await $fetch<SupervisorSettingsView>(`/api/supervisors/${encodeURIComponent(props.name)}/settings`);
  } catch {
    piecesFailed.value = true;
  }
}, { immediate: true });
</script>
