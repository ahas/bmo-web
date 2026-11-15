<template>
  <!-- The secrets the agency's provider tools read (docs/web.md, 「Administration」, the providers tab): one row
       to each setting naming a secret, its choices the reader's own secrets saved in the setting's kind and none, the
       choice saved as it is made. A refusal is said under the row's label, and the row stays as the agency holds it. -->
  <SettingsGroup :title="$t('agents.title.secret_settings')">
    <ContentSkeleton v-if="held === null && !failed" :rows="SECRET_SETTINGS.length" listClass="flex flex-col divide-y divide-default" :label="$t('agents.status.secret_settings_loading')">
      <div class="flex items-center gap-4 py-3">
        <div class="flex min-w-0 flex-1 flex-col">
          <SkeletonLine width="w-1/3" />
          <SkeletonLine width="w-1/4" />
        </div>
        <SkeletonBar class="h-8 w-48 shrink-0 rounded-md" />
      </div>
    </ContentSkeleton>

    <div v-else-if="held === null" class="flex flex-col items-end gap-3 py-3">
      <UAlert class="w-full" color="error" variant="subtle" :description="$t('agents.error.secret_settings_read_failed')" />
      <UButton color="neutral" variant="subtle" icon="i-material-symbols-refresh" :label="$t('common.action.refresh')" :loading="status === 'pending'" @click="refresh()" />
    </div>

    <template v-else>
    <SettingsRow v-for="setting in SECRET_SETTINGS" :key="setting.field" :data-secret-setting="setting.field" :label="$t(setting.label)">
      <template #description>
        <span v-if="refusals[setting.field]" class="text-sm text-error">{{ refusals[setting.field] }}</span>
        <span v-else class="text-sm text-muted">{{ $t("agents.label.secret_of_kind", { kind: kindName(setting.kind) }) }}</span>
      </template>
      <USelect
        :model-value="held.settings[setting.field] ?? NONE"
        :items="choicesOf(setting.kind, held.settings[setting.field] ?? null)"
        value-key="value"
        class="w-48"
        :loading="saving === setting.field"
        :disabled="saving !== null"
        :aria-label="$t(setting.label)"
        @update:model-value="(value: string) => void choose(setting.field, value)"
      />
    </SettingsRow>
    </template>
  </SettingsGroup>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import { SECRET_SETTINGS } from "#shared/secret-settings";

import type { SecretSettingField, SecretSettingsView } from "#shared/secret-settings";
import type { SecretKindList } from "#shared/secret-kinds";
import type { SecretList } from "#shared/types";

const { t } = useI18n();

// None stands as a value no secret's name can be: a name holds no slash.
const NONE = "/";

interface Held {
  settings: SecretSettingsView;
  secrets: SecretList["secrets"];
  kinds: SecretKindList["kinds"];
}

const { data, error, refresh, status } = useAsyncData<Held>(
  "provider-secret-settings",
  async () => {
    const [settings, secrets, kinds] = await Promise.all([
      $fetch<SecretSettingsView>("/api/secret-settings"),
      $fetch<SecretList>("/api/secrets"),
      $fetch<SecretKindList>("/api/secret-kinds")
    ]);

    return { settings, secrets: secrets.secrets, kinds: kinds.kinds };
  },
  { lazy: true, server: false }
);

const held = computed(() => data.value ?? null);
// A failed read stands until a read goes through, so asking again keeps its reason in place with its button spinning.
const failed = ref(false);

watch(error, (now) => {
  if (now) failed.value = true;
});
watch(data, (now) => {
  if (now) failed.value = false;
});
const saving = ref<SecretSettingField | null>(null);
const refusals = reactive<Partial<Record<SecretSettingField, string>>>({});

function kindName(kind: string): string {
  return held.value?.kinds.find((one) => one.key === kind)?.name ?? kind;
}

// The secrets saved in the kind by name, the one the setting holds where it is none of them, then none.
function choicesOf(kind: string, chosen: string | null): { value: string; label: string }[] {
  const names = (held.value?.secrets ?? []).filter((secret) => secret.kind === kind).map((secret) => secret.name);
  const listed = chosen === null || names.includes(chosen) ? names : [chosen, ...names];

  return [...listed.map((name) => ({ value: name, label: name })), { value: NONE, label: t("agents.label.secret_none") }];
}

// The choice saved, the rows standing as the agency then holds them; its refusal said under the row's label.
async function choose(field: SecretSettingField, value: string): Promise<void> {
  saving.value = field;
  delete refusals[field];

  try {
    const settings = await $fetch<SecretSettingsView>("/api/secret-settings", { method: "PUT", body: { field, secret: value === NONE ? null : value } });

    if (data.value) data.value = { ...data.value, settings };
  } catch (failure) {
    refusals[field] = failureText(failure, t("common.error.save_failed"));
  } finally {
    saving.value = null;
  }
}
</script>
