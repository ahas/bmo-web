<template>
  <!-- One agent's own gates: its block of the agent management screen's per-agent gates, the same
       switches saving through the same path, so an agent's gates are switched one way wherever they
       are opened. Here they are a form, saved by the one Save button at the foot (docs/web.md, 「Forms」). -->
  <SettingsDialog v-model:open="open" :title="props.meta.label" :description="props.meta.name" :dirty="form.dirty.value">
    <AgentsGates :agents="[{ meta: props.meta, agent: props.agent }]" :reread="props.reread" />

    <template #footer="{ close }">
      <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="form.saving.value" @click="close()" />
      <UButton :label="$t('common.action.save')" :loading="form.saving.value" :disabled="!form.dirty.value || form.saving.value" @click="void saveAll()" />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { useFormSave } from "bmo-ui/app/domain/form-save";

import type { AgentSummary } from "#shared/types";
import type { AgentMeta } from "~/domain/agents";

interface Props {
  meta: AgentMeta;
  // The agent's row of the catalogue, whose gates the bot listed.
  agent: AgentSummary;
  // The catalogue read again after a save, which the switches wait for.
  reread: () => Promise<void>;
}

const props = defineProps<Props>();
const { t } = useI18n();

const open = defineModel<boolean>("open", { required: true });
const form = useFormSave(t);

async function saveAll(): Promise<void> {
  if (await form.save()) open.value = false;
}
</script>
