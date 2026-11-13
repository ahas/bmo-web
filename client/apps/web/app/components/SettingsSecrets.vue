<template>
  <!-- The secret store section (docs/web.md, 「Settings」, the secret store section): the names the reader's own space holds, each
       with its size and its time and never its value, and the secret form, the same the composer's clip and an
       agent's request open, added from the mark beside the list's heading. The kinds the form asks in are the
       deployment's, kept on the organisation settings screen. -->
  <div class="flex flex-col gap-6">
    <p class="text-sm text-muted">{{ $t("secrets.label.note") }}</p>

    <ContentSkeleton v-if="secrets === null && failure === ''" :rows="2" listClass="flex flex-col divide-y divide-default" :label="$t('secrets.status.loading')">
      <div class="flex items-center gap-4 py-3">
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <SkeletonLine width="w-1/3" />
          <SkeletonLine width="w-1/2" />
        </div>
        <SkeletonBar class="h-6 w-20 shrink-0 rounded-md" />
      </div>
    </ContentSkeleton>

    <div v-else-if="secrets === null" class="flex flex-col items-end gap-3">
      <UAlert class="w-full" color="error" variant="subtle" :description="failure" />
      <UButton color="neutral" variant="subtle" icon="i-material-symbols-refresh" :label="$t('common.action.refresh')" @click="load" />
    </div>

    <template v-else>
      <SettingsGroup :title="$t('secrets.label.kept')">
        <template #aside>
          <UTooltip :text="$t('secrets.action.add')">
            <UButton size="sm" color="neutral" variant="ghost" icon="i-material-symbols-add" :aria-label="$t('secrets.action.add')" :disabled="busy" data-secret-add @click="openForm(null)" />
          </UTooltip>
        </template>

        <SettingsRow v-if="secrets.length === 0" :label="$t('secrets.label.none')" />
        <SettingsRow
          v-for="secret in sortedSecrets"
          :key="secret.name"
          :label="secret.name"
          :description="$t('secrets.label.row', { bytes: countText(secret.bytes), time: formatStamp(Math.floor(secret.changedAt / 1000)) })"
          :data-secret="secret.name"
        >
          <UButton color="neutral" variant="ghost" size="xs" :label="$t('secrets.action.replace')" :disabled="busy" @click="openForm(secret.name)" />
          <UButton color="error" variant="ghost" size="xs" :label="$t('common.action.delete')" :disabled="busy" @click="remove(secret.name)" />
        </SettingsRow>
      </SettingsGroup>

      <p v-if="failure !== ''" role="alert" class="text-sm text-error">{{ failure }}</p>
    </template>

    <SecretForm v-model:open="editing" :ask="ask" :kinds="kinds ?? []" :secrets="secrets ?? []" @saved="onSaved" @kind-added="onKindAdded" />
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { formatStamp } from "bmo-ui/app/domain/time";

import { useConfirm } from "~/domain/confirm";
import { countText } from "~/domain/numbers";
import { emptyAsk, useSecretLists } from "~/domain/secret-form";

import type { SecretAsk } from "~/domain/secret-form";
import type { SecretKind } from "#shared/secret-kinds";
import type { KeptSecret } from "#shared/types";

const { t } = useI18n();
const confirm = useConfirm();

const { kinds, secrets, read } = useSecretLists();
const failure = ref("");
const busy = ref(false);

const sortedSecrets = computed(() => [...(secrets.value ?? [])].sort((one, other) => (one.name < other.name ? -1 : one.name > other.name ? 1 : 0)));

async function load(): Promise<void> {
  failure.value = "";

  try {
    await read();
  } catch (error) {
    failure.value = failureText(error, t("secrets.error.read_failed"));
  }
}

// The form, on a name to replace or on none; the value only ever stands in the form's own boxes.
const editing = ref(false);
const ask = ref<SecretAsk>(emptyAsk());

function openForm(name: string | null): void {
  ask.value = { ...emptyAsk(), name: name ?? "", replace: name !== null };
  editing.value = true;
}

function onSaved(kept: KeptSecret): void {
  secrets.value = [...(secrets.value ?? []).filter((secret) => secret.name !== kept.name), kept];
}

function onKindAdded(kind: SecretKind): void {
  kinds.value = [...(kinds.value ?? []), kind];
}

async function remove(name: string): Promise<void> {
  const taken = await confirm({
    title: t("secrets.message.delete_confirm"),
    item: name,
    effect: t("secrets.message.delete_effect", { name }),
    confirm: t("common.action.delete")
  });

  if (!taken) return;

  busy.value = true;
  failure.value = "";

  try {
    await $fetch(`/api/secrets/${encodeURIComponent(name)}`, { method: "DELETE" });
    secrets.value = (secrets.value ?? []).filter((secret) => secret.name !== name);
  } catch (error) {
    failure.value = failureText(error, t("secrets.error.delete_failed"));
  } finally {
    busy.value = false;
  }
}

onMounted(() => void load());
</script>
