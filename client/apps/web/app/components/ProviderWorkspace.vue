<template>
  <!-- A provider's key and workspace, under its row on the providers tab for a provider that takes a workspace (docs/web.md,
       「System and organisation」, the providers tab; the agency's docs/provider-presence.md, 「A provider's workspace」):
       the key typed once into the platform's secret store under the file the provider reads, never read back, and the
       workspace its requests are spent in — the key's default, or a workspace's id — each saved on its own. -->
  <div class="flex w-full min-w-0 flex-col gap-3 pt-2" :data-provider-workspace="props.provider.name">
    <form class="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end" data-provider-key @submit.prevent="void saveKey()">
      <UFormField :label="$t('agents.label.provider_key')" :help="$t('agents.message.provider_key_hint')" name="key" class="min-w-0 flex-1">
        <UInput v-model="key" class="w-full font-mono" type="password" autocomplete="off" spellcheck="false" :disabled="busy" data-provider-key-input />
      </UFormField>
      <UButton type="submit" color="neutral" variant="soft" :label="$t('common.action.save')" :loading="busy && saving === 'key'" :disabled="busy || key.trim() === ''" data-provider-key-save />
    </form>
    <p v-if="keySaved" role="status" class="text-sm text-success" data-provider-key-saved>{{ $t("agents.message.provider_key_saved") }}</p>

    <form class="flex min-w-0 flex-col gap-2" data-provider-workspace-form @submit.prevent="void saveWorkspace()">
      <UFormField :label="$t('agents.label.workspace')" :help="$t('agents.message.workspace_hint')" name="workspace">
        <URadioGroup v-model="choice" :items="choices" value-key="value" :disabled="busy" data-provider-workspace-choice />
      </UFormField>
      <div class="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end">
        <UFormField v-if="choice === 'id'" :label="$t('agents.label.workspace_id')" name="workspaceId" class="min-w-0 flex-1">
          <UInput v-model="id" class="w-full font-mono" autocomplete="off" spellcheck="false" placeholder="wrkspc_…" :disabled="busy" data-provider-workspace-id />
        </UFormField>
        <UButton
          type="submit"
          color="neutral"
          variant="soft"
          class="sm:ms-auto"
          :label="$t('common.action.save')"
          :loading="busy && saving === 'workspace'"
          :disabled="busy || !workspaceChanged || (choice === 'id' && id.trim() === '')"
          data-provider-workspace-save
        />
      </div>
    </form>

    <p v-if="failed !== ''" role="alert" class="break-words text-sm text-error" data-provider-workspace-failed>{{ failed }}</p>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import type { ProviderView } from "#shared/axes";

interface Props {
  provider: ProviderView;
}

const props = defineProps<Props>();

// The provider as the agency answers it once its workspace is set.
const emit = defineEmits<{ changed: [provider: ProviderView] }>();

const { t } = useI18n();

const busy = ref(false);
const saving = ref<"key" | "workspace" | "">("");
const failed = ref("");
const key = ref("");
const keySaved = ref(false);
const choice = ref<"default" | "id">(props.provider.workspace === null ? "default" : "id");
const id = ref(props.provider.workspace ?? "");

const choices = computed(() => [
  { label: t("agents.label.workspace_default"), value: "default" },
  { label: t("agents.label.workspace_id"), value: "id" }
]);

// What the form would set: null for the key's default, else the id typed.
const asked = computed(() => (choice.value === "default" ? null : id.value.trim()));
const workspaceChanged = computed(() => asked.value !== props.provider.workspace);

watch(
  () => props.provider.workspace,
  (now) => {
    choice.value = now === null ? "default" : "id";
    id.value = now ?? "";
  }
);

async function saveKey(): Promise<void> {
  const value = key.value.trim();

  if (value === "") return;
  busy.value = true;
  saving.value = "key";
  failed.value = "";
  keySaved.value = false;
  try {
    await $fetch("/api/secrets", { method: "POST", body: { name: props.provider.keyFile ?? `${props.provider.name}.key`, value, replace: true } });
    key.value = "";
    keySaved.value = true;
  } catch (error) {
    failed.value = failureText(error, t("agents.error.provider_key_failed"));
  } finally {
    busy.value = false;
    saving.value = "";
  }
}

async function saveWorkspace(): Promise<void> {
  busy.value = true;
  saving.value = "workspace";
  failed.value = "";
  try {
    emit("changed", await $fetch<ProviderView>(`/api/providers/${encodeURIComponent(props.provider.name)}`, { method: "PATCH", body: { workspace: asked.value } }));
  } catch (error) {
    failed.value = failureText(error, t("agents.error.workspace_failed"));
  } finally {
    busy.value = false;
    saving.value = "";
  }
}
</script>
