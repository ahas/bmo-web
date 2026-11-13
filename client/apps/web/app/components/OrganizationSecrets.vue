<template>
  <!-- The secret store (docs/web.md, 「Organisation settings」, the secret store tab): the names the server's store
       holds, each with its size and its time and never its value, the kinds a secret is asked in, and the secret
       form, the same the composer's clip and an agent's request open. A secret is added from the tab row's
       button, which the tab names and opens; a kind from the mark beside the kinds' heading. -->
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

      <SettingsGroup :title="$t('secrets.label.kinds')">
        <template #aside>
          <UTooltip :text="$t('secrets.action.kind_add')">
            <UButton size="sm" color="neutral" variant="ghost" icon="i-material-symbols-add" :aria-label="$t('secrets.action.kind_add')" data-secret-kind-add @click="openKind(null)" />
          </UTooltip>
        </template>

        <SettingsRow v-if="(kinds ?? []).length === 0" :label="$t('secrets.label.kinds_none')" />
        <SettingsRow
          v-for="kind in kinds ?? []"
          :key="kind.key"
          :label="kind.name"
          :description="kindRow(kind)"
          :data-secret-kind-row="kind.key"
        >
          <UButton color="neutral" variant="ghost" size="xs" :label="$t('common.action.edit')" :disabled="busy" @click="openKind(kind)" />
          <UButton color="error" variant="ghost" size="xs" :label="$t('common.action.delete')" :disabled="busy" @click="removeKind(kind)" />
        </SettingsRow>
      </SettingsGroup>

      <p v-if="failure !== ''" role="alert" class="text-sm text-error">{{ failure }}</p>
    </template>

    <SecretForm v-model:open="editing" :ask="ask" :kinds="kinds ?? []" :secrets="secrets ?? []" @saved="onSaved" @kind-added="onKindAdded" />
    <SecretKindForm v-model:open="kindEditing" :kind="kindAsked" @saved="onKindSaved" />
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

function kindRow(kind: SecretKind): string {
  const keys = kind.fields.map((field) => field.key).join(", ");

  return kind.description === "" ? keys : t("secrets.label.kind_row", { description: kind.description, keys });
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

// The kind's form, on a kind to change or on a new one.
const kindEditing = ref(false);
const kindAsked = ref<SecretKind | null>(null);

function openKind(kind: SecretKind | null): void {
  kindAsked.value = kind;
  kindEditing.value = true;
}

function onKindSaved(kind: SecretKind): void {
  const standing = (kinds.value ?? []).some((one) => one.key === kind.key);

  kinds.value = standing ? (kinds.value ?? []).map((one) => (one.key === kind.key ? kind : one)) : [...(kinds.value ?? []), kind];
}

async function removeKind(kind: SecretKind): Promise<void> {
  const taken = await confirm({
    title: t("secrets.message.kind_delete_confirm"),
    item: kind.name,
    effect: t("secrets.message.kind_delete_effect"),
    confirm: t("common.action.delete")
  });

  if (!taken) return;

  busy.value = true;
  failure.value = "";

  try {
    await $fetch(`/api/secret-kinds/${encodeURIComponent(kind.key)}`, { method: "DELETE" });
    kinds.value = (kinds.value ?? []).filter((one) => one.key !== kind.key);
  } catch (error) {
    failure.value = failureText(error, t("secrets.error.kind_delete_failed"));
  } finally {
    busy.value = false;
  }
}

onMounted(() => void load());

// The tab's create: a secret, by the secret form, standing off until the store's names are read.
defineExpose({ addLabel: computed(() => t("secrets.action.add")), addDisabled: computed(() => secrets.value === null), openAdd: () => openForm(null) });
</script>
