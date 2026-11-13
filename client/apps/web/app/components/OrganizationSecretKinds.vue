<template>
  <!-- The secret kinds (docs/web.md, 「Organisation settings」, its kinds tab): the shapes every person's secret form
       asks a value in, the deployment's, kept by the administrator. A kind is added from the screen's create button,
       which the tab names and opens; no secret is listed here. A row's two actions are icon buttons named by their
       tooltips. -->
  <div class="flex flex-col gap-4">
    <ContentSkeleton v-if="kinds === null && failure === ''" :rows="2" listClass="flex flex-col divide-y divide-default" :label="$t('secrets.status.kinds_loading')">
      <div class="flex items-center gap-4 py-3">
        <div class="flex min-w-0 flex-1 flex-col">
          <SkeletonLine width="w-1/3" />
          <SkeletonLine width="w-1/2" />
        </div>
        <SkeletonBar class="size-8 shrink-0 rounded-md" />
        <SkeletonBar class="size-8 shrink-0 rounded-md" />
      </div>
    </ContentSkeleton>

    <div v-else-if="kinds === null" class="flex flex-col items-end gap-3">
      <UAlert class="w-full" color="error" variant="subtle" :description="failure" />
      <UButton color="neutral" variant="subtle" icon="i-material-symbols-refresh" :label="$t('common.action.refresh')" :loading="reading" @click="load" />
    </div>

    <template v-else>
      <SettingsGroup>
        <SettingsRow v-if="kinds.length === 0" :label="$t('secrets.label.kinds_none')" />
        <SettingsRow
          v-for="kind in kinds"
          :key="kind.key"
          :label="kind.name"
          :description="kindRow(kind)"
          :data-secret-kind-row="kind.key"
        >
          <IconButton icon="i-material-symbols-edit-outline" :label="$t('common.action.edit')" :disabled="busy" data-secret-kind-edit @click="openKind(kind)" />
          <IconButton color="error" icon="i-material-symbols-delete-outline" :label="$t('common.action.delete')" :disabled="busy" data-secret-kind-delete @click="removeKind(kind)" />
        </SettingsRow>
      </SettingsGroup>

      <p v-if="failure !== ''" role="alert" class="text-sm text-error">{{ failure }}</p>
    </template>

    <SecretKindForm v-model:open="kindEditing" :kind="kindAsked" @saved="onKindSaved" />
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import { useConfirm } from "~/domain/confirm";
import { useSecretLists } from "~/domain/secret-form";

import type { SecretKind, SecretKindList } from "#shared/secret-kinds";

const { t } = useI18n();
const confirm = useConfirm();

// The kinds the tab's form and every secret form in the tab share; only the kinds are read here.
const { kinds } = useSecretLists();
const failure = ref("");
const busy = ref(false);
const reading = ref(false);

// A failure stands until a read goes through, so a read asked again from it spins on its button.
async function load(): Promise<void> {
  reading.value = true;

  try {
    kinds.value = (await $fetch<SecretKindList>("/api/secret-kinds")).kinds;
    failure.value = "";
  } catch (error) {
    failure.value = failureText(error, t("secrets.error.kinds_read_failed"));
  } finally {
    reading.value = false;
  }
}

function kindRow(kind: SecretKind): string {
  const keys = kind.fields.map((field) => field.key).join(", ");

  return kind.description === "" ? keys : t("secrets.label.kind_row", { description: kind.description, keys });
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

// The tab's create: a kind, by the kind's form, standing off until the kinds are read.
defineExpose({ addLabel: computed(() => t("secrets.action.kind_add")), addDisabled: computed(() => kinds.value === null), openAdd: () => openKind(null) });
</script>
