<template>
  <!-- The secret store (docs/web.md, 「Settings」, the secret store section): the names the server's store holds,
       each with its size and its time and never its value, and the form that hands it a value under a name. The
       value is typed into a password box that keeps nothing, goes to the console's route in the body and nowhere
       else, and is emptied as soon as the answer comes. -->
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
      <UButton color="neutral" variant="subtle" icon="i-material-symbols-refresh" :label="$t('common.action.refresh')" @click="read" />
    </div>

    <template v-else>
      <SettingsGroup :title="$t('secrets.label.kept')">
        <SettingsRow v-if="secrets.length === 0" :label="$t('secrets.label.none')" />
        <SettingsRow
          v-for="secret in secrets"
          :key="secret.name"
          :label="secret.name"
          :description="$t('secrets.label.row', { bytes: countText(secret.bytes), time: formatStamp(secret.changedAt) })"
          :data-secret="secret.name"
        >
          <UButton color="neutral" variant="ghost" size="xs" :label="$t('secrets.action.replace')" :disabled="busy" @click="openForm(secret.name)" />
          <UButton color="error" variant="ghost" size="xs" :label="$t('common.action.delete')" :disabled="busy" @click="remove(secret.name)" />
        </SettingsRow>
      </SettingsGroup>

      <div class="flex justify-end">
        <UButton icon="i-material-symbols-add" :label="$t('secrets.action.add')" data-secret-add @click="openForm(null)" />
      </div>

      <p v-if="failure !== ''" role="alert" class="text-sm text-error">{{ failure }}</p>
    </template>

    <SettingsDialog v-model:open="editing" :title="replacing ? $t('secrets.title.replace') : $t('secrets.title.add')" :dirty="dirty">
      <UForm id="secret-form" :state="form" class="flex flex-col gap-4" autocomplete="off" @submit="submit">
        <UFormField :label="$t('secrets.label.name')" name="name" required :hint="$t('secrets.label.name_hint')" :error="nameError">
          <UInput v-model="form.name" class="w-full" autocomplete="off" autocapitalize="off" spellcheck="false" data-secret-name />
        </UFormField>

        <USwitch
          v-if="standing"
          v-model="form.replace"
          :label="$t('secrets.label.replace')"
          :description="$t('secrets.label.replace_note', { name: form.name })"
          data-secret-replace
        />

        <UFormField :label="$t('secrets.label.value')" name="value" required>
          <UInput v-model="form.value" class="w-full" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" data-secret-value />
        </UFormField>

        <UAlert v-if="formFailure !== ''" color="error" variant="subtle" :description="formFailure" />
      </UForm>

      <template #footer="{ close }">
        <UButton color="neutral" variant="ghost" :label="$t('common.action.cancel')" @click="close()" />
        <UButton type="submit" form="secret-form" :label="$t('common.action.save')" :loading="busy" :disabled="busy || !ready" />
      </template>
    </SettingsDialog>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { formatStamp } from "bmo-ui/app/domain/time";

import { useConfirm } from "~/domain/confirm";
import { countText } from "~/domain/numbers";
import { SECRET_NAME_MAX, secretNameIsPlain } from "#shared/secrets";

import type { KeptSecret, SecretList } from "#shared/types";

const { t } = useI18n();
const confirm = useConfirm();

const secrets = ref<KeptSecret[] | null>(null);
const failure = ref("");
const busy = ref(false);

async function read(): Promise<void> {
  failure.value = "";

  try {
    secrets.value = (await $fetch<SecretList>("/api/secrets")).secrets;
  } catch (error) {
    failure.value = failureText(error, t("secrets.error.read_failed"));
  }
}

// The form: a name, whether to replace the value it holds, and the value, which only this box ever holds.
const editing = ref(false);
const replacing = ref(false);
const formFailure = ref("");
const form = reactive({ name: "", value: "", replace: false });

const standing = computed(() => secrets.value?.some((secret) => secret.name === form.name) === true);
const nameError = computed(() => form.name !== "" && !secretNameIsPlain(form.name) ? t("secrets.error.bad_name", { max: SECRET_NAME_MAX }) : undefined);
// A name the list holds is written only once replacing it is chosen.
const ready = computed(() => secretNameIsPlain(form.name) && form.value !== "" && (!standing.value || form.replace));
const dirty = computed(() => form.value !== "" || (!replacing.value && form.name !== ""));

function openForm(name: string | null): void {
  replacing.value = name !== null;
  Object.assign(form, { name: name ?? "", value: "", replace: name !== null });
  formFailure.value = "";
  editing.value = true;
}

// The value leaves the page as the dialog does, whichever way it closes.
watch(editing, (open) => {
  if (!open) form.value = "";
});

async function submit(): Promise<void> {
  if (!ready.value) return;

  busy.value = true;
  formFailure.value = "";

  const asked = { name: form.name, value: form.value, replace: standing.value && form.replace };

  try {
    const kept = await $fetch<KeptSecret>("/api/secrets", { method: "POST", body: asked });

    secrets.value = [...(secrets.value ?? []).filter((secret) => secret.name !== kept.name), kept].sort((one, other) => one.name < other.name ? -1 : one.name > other.name ? 1 : 0);
    form.value = "";
    editing.value = false;
  } catch (error) {
    form.value = "";
    formFailure.value = failureText(error, t("secrets.error.save_failed"));
  } finally {
    busy.value = false;
  }
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

onMounted(() => void read());
</script>
