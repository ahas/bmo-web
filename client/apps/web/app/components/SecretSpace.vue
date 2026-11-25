<template>
  <!-- One space of the secret store (docs/web.md, 「System and organisation」, the secrets tab): the reader's own — the platform's for
       an administrator — or an organisation unit's. Its names, each with its size and its time and never its value,
       each replaced through the secret form or deleted, asked first; the tab row's add opens the form on no name. A
       space the account service does not let the reader hold says so in one line. -->
  <div class="flex flex-col gap-4" :data-secret-space="props.unit ?? 'own'">
    <p class="whitespace-pre-line text-sm text-muted" data-secret-space-note>{{ props.note }}</p>

    <p v-if="forbidden" class="text-sm text-muted" data-secret-space-forbidden>{{ $t("secrets.label.unit_forbidden") }}</p>

    <ContentSkeleton v-else-if="list === null && failure === ''" :rows="2" list-class="flex flex-col divide-y divide-default" :label="$t('secrets.status.loading')">
      <div class="flex items-center gap-4 py-3">
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <SkeletonLine width="w-1/3" />
          <SkeletonLine width="w-1/2" />
        </div>
        <SkeletonBar class="h-6 w-20 shrink-0 rounded-md" />
      </div>
    </ContentSkeleton>

    <FailedRead v-else-if="list === null" class="py-3" :message="failure" :reading="reading" @retry="load" />

    <template v-else>
      <SettingsGroup :title="$t('secrets.label.kept')">
        <SettingsRow v-if="list.length === 0" :label="$t('secrets.label.none')" data-secrets-none />
        <SettingsRow
          v-for="secret in sorted"
          :key="secret.name"
          :label="secret.name"
          :description="$t('secrets.label.row', { bytes: countText(secret.bytes), time: formatStamp(Math.floor(secret.changedAt / 1000)) })"
          :data-secret="secret.name"
        >
          <UButton color="neutral" variant="ghost" size="sm" :label="$t('secrets.action.replace')" :disabled="busy" data-secret-replace @click="openForm(secret.name)" />
          <UButton color="error" variant="ghost" size="sm" :label="$t('common.action.delete')" :disabled="busy" data-secret-delete @click="remove(secret.name)" />
        </SettingsRow>
      </SettingsGroup>

      <p v-if="failure !== ''" role="alert" class="break-words text-sm text-error">{{ failure }}</p>
    </template>

    <SecretForm v-model:open="editing" :ask="ask" :kinds="kinds ?? []" :secrets="list ?? []" :target="base" @saved="onSaved" @kind-added="onKindAdded" />
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { formatStamp } from "bmo-ui/app/domain/time";

import { useConfirm } from "~/domain/confirm";
import { countText } from "~/domain/numbers";
import { emptyAsk, useSecretLists } from "~/domain/secret-form";

import type { SecretAsk } from "~/domain/secret-form";
import type { SecretKind, SecretKindList } from "#shared/secret-kinds";
import type { KeptSecret, SecretList } from "#shared/types";

interface Props {
  // The unit whose space is shown, or null for the reader's own.
  unit: number | null;
  // The line saying whose space it is.
  note: string;
}

const props = defineProps<Props>();

const { t } = useI18n();
const confirm = useConfirm();

// The reader's own list is the one the whole console shares, so a request's card and the composer see a save made
// here; a unit's is this view's alone.
const own = useSecretLists();
const unitList = ref<KeptSecret[] | null>(null);
const unitKinds = ref<SecretKind[] | null>(null);
const list = computed<KeptSecret[] | null>({
  get: () => (props.unit === null ? own.secrets.value : unitList.value),
  set: (value) => {
    if (props.unit === null) own.secrets.value = value;
    else unitList.value = value;
  }
});
const kinds = computed<SecretKind[] | null>({
  get: () => (props.unit === null ? own.kinds.value : unitKinds.value),
  set: (value) => {
    if (props.unit === null) own.kinds.value = value;
    else unitKinds.value = value;
  }
});
const base = computed(() => (props.unit === null ? "/api/secrets" : `/api/organization/units/${props.unit}/secrets`));

const failure = ref("");
const reading = ref(false);
const busy = ref(false);
const forbidden = ref(false);

const sorted = computed(() => [...(list.value ?? [])].sort((one, other) => (one.name < other.name ? -1 : one.name > other.name ? 1 : 0)));

async function load(): Promise<void> {
  reading.value = true;
  failure.value = "";
  forbidden.value = false;

  try {
    if (props.unit === null) {
      await own.read();
    } else {
      const [kindList, secretList] = await Promise.all([$fetch<SecretKindList>("/api/secret-kinds"), $fetch<SecretList>(base.value)]);

      unitKinds.value = kindList.kinds;
      unitList.value = secretList.secrets;
    }
  } catch (error) {
    if ((error as { statusCode?: number } | null)?.statusCode === 403) forbidden.value = true;
    else failure.value = failureText(error, t("secrets.error.read_failed"));
  } finally {
    reading.value = false;
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
  list.value = [...(list.value ?? []).filter((secret) => secret.name !== kept.name), kept];
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
    await $fetch(`${base.value}/${encodeURIComponent(name)}`, { method: "DELETE" });
    list.value = (list.value ?? []).filter((secret) => secret.name !== name);
  } catch (error) {
    failure.value = failureText(error, t("secrets.error.delete_failed"));
  } finally {
    busy.value = false;
  }
}

// Read once the page stands in the browser, and again for another unit.
onMounted(() => watch(() => props.unit, () => void load(), { immediate: true }));

// The tab row's add: a new secret, while the space is read and the reader holds it.
defineExpose({
  addLabel: computed(() => t("secrets.action.add")),
  addDisabled: computed(() => busy.value || forbidden.value || list.value === null),
  openAdd: () => openForm(null)
});
</script>
