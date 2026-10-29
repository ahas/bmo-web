<template>
  <!-- One companion's settings on its own screen: its block of the Companions tab, saving through the
       same paths, so a companion is set one way wherever it is opened. It is one form, saved by the
       one Save button at the foot (docs/web.md, 「Forms」). -->
  <SettingsDialog v-model:open="open" :title="props.meta.label" :description="props.meta.name" :dirty="form.dirty.value">
    <div class="flex flex-col gap-8">
      <p v-if="failed" role="alert" class="text-sm text-error">{{ $t("agents.error.companions_read_failed") }}</p>
      <ContentSkeleton v-else-if="view === null" :rows="1" :label="$t('agents.status.companions_loading')">
        <SkeletonBar class="h-8 w-full rounded-md" />
      </ContentSkeleton>
      <CompanionSettingsBlock v-else bare :view="view" @saved="(saved) => (view = saved)" />
    </div>

    <template #footer="{ close }">
      <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="form.saving.value" @click="close()" />
      <UButton :label="$t('common.action.save')" :loading="form.saving.value" :disabled="!form.dirty.value || form.saving.value" @click="void saveAll()" />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { useFormSave } from "bmo-ui/app/domain/form-save";

import type { CompanionView } from "#shared/agency";
import type { AgentSummary } from "#shared/types";
import type { AgentMeta } from "~/domain/agents";

interface Props {
  meta: AgentMeta;
  agent: AgentSummary;
  reread: () => Promise<void>;
}

const props = defineProps<Props>();
const open = defineModel<boolean>("open", { required: true });

const { t } = useI18n();
const form = useFormSave(t);
const view = ref<CompanionView | null>(null);
const failed = ref(false);

async function saveAll(): Promise<void> {
  if (await form.save()) open.value = false;
}

// Read each time it opens, so it shows what the bot holds now, and nothing typed and thrown away
// before stands in it.
watch(open, async (now) => {
  if (!now) return;

  form.discard();
  failed.value = false;

  try {
    view.value = (await $fetch<CompanionView[]>("/api/companions")).find((one) => one.agent === props.meta.name) ?? null;
    failed.value = view.value === null;
  } catch {
    failed.value = true;
  }
}, { immediate: true });
</script>
