<template>
  <!-- An account's profile (docs/accounts.md, 「Users and senders」): the person's name, job title, rank, duty and
       contact details, held until its one save writes them whole. The role is set on the chart, never here. Settings' account section opens it for the reader's own account, and
       the people tab for a person the administrator looks up. -->
  <SettingsDialog v-model:open="open" :title="$t('account.title.profile')" :description="props.description" :dirty="changes">
    <UForm id="profile-form" :state="form" class="flex flex-col gap-4" @submit="save">
      <UFormField :label="$t('account.label.full_name')" name="fullName">
        <UInput v-model="form.fullName" class="w-full" autocomplete="name" />
      </UFormField>

      <UFormField :label="$t('account.label.job_title')" name="jobTitle">
        <UInput v-model="form.jobTitle" class="w-full" autocomplete="organization-title" />
      </UFormField>

      <UFormField :label="$t('account.label.rank')" name="rank">
        <UInput v-model="form.rank" class="w-full" data-profile-rank />
      </UFormField>

      <UFormField :label="$t('account.label.duty')" name="duty">
        <UTextarea v-model="form.duty" :rows="2" autoresize class="w-full" data-profile-duty />
      </UFormField>

      <UFormField :label="$t('account.label.landline')" name="landline">
        <UInput v-model="form.landline" class="w-full" type="tel" autocomplete="tel" />
      </UFormField>

      <UFormField :label="$t('account.label.mobile')" name="mobile">
        <UInput v-model="form.mobile" class="w-full" type="tel" autocomplete="tel" />
      </UFormField>

      <UFormField :label="$t('account.label.email')" name="email">
        <UInput v-model="form.email" class="w-full" inputmode="email" autocomplete="email" />
      </UFormField>

      <UAlert v-if="failure" color="error" variant="subtle" :description="failure" />
    </UForm>

    <template #footer="{ close }">
      <UButton color="neutral" variant="ghost" :label="$t('common.action.cancel')" @click="close()" />
      <UButton type="submit" form="profile-form" :label="$t('common.action.save')" :loading="pending" :disabled="pending || !changes.dirty.value" />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { useOpenedWith } from "bmo-ui/app/domain/form-save";

import type { UserProfile } from "#shared/types";

interface Props {
  // The account whose profile it is, and the profile as it stands saved.
  user: number | string;
  profile: UserProfile | null;
  // Whose profile it is, where the dialog is opened for another person.
  description?: string;
}

const props = withDefaults(defineProps<Props>(), { description: undefined });
// Said with the profile as the service answered it, once the save went through, as the dialog closes.
const emit = defineEmits<{ saved: [profile: UserProfile] }>();
const open = defineModel<boolean>("open", { default: false });

const { t } = useI18n();

const form = reactive<UserProfile>({ fullName: "", jobTitle: "", rank: "", duty: "", landline: "", mobile: "", email: "" });
const pending = ref(false);
const failure = ref<string | null>(null);

// Every opening starts from the profile as saved.
watch(
  open,
  (now) => {
    if (!now || props.profile === null) return;

    Object.assign(form, props.profile);
    failure.value = null;
  },
  { immediate: true }
);

// The form is filled once the profile it edits has been read.
const changes = useOpenedWith(() => form, { open, ready: () => props.profile !== null });

async function save(): Promise<void> {
  if (!changes.dirty.value) return;

  pending.value = true;
  failure.value = null;

  try {
    const saved = await $fetch<UserProfile>(`/api/users/${encodeURIComponent(String(props.user))}/profile`, { method: "PUT", body: { ...form } });

    Object.assign(form, saved);
    emit("saved", saved);
    open.value = false;
  } catch (error) {
    failure.value = failureText(error, t("account.error.profile_write_failed"));
  } finally {
    pending.value = false;
  }
}
</script>
