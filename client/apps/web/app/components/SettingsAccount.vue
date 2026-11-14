<template>
  <!-- The account section (docs/web.md, 「Settings」): the account's name and the way to its form, the name and the
       password, which is a dialog of its own with its own save; the profile, its job title and contact details in
       a dialog of their own; and one's own picture, the sender's linked to the account, set in the console
       (「Profile photos」). -->
  <div class="flex flex-col gap-6">
    <SettingsGroup>
      <SettingsRow :label="$t('account.title.login')" :description="user?.name">
        <UButton color="neutral" variant="outline" :label="$t('account.action.change')" @click="editing = true" />
      </SettingsRow>
    </SettingsGroup>

    <SettingsGroup v-if="account !== undefined">
      <SettingsRow data-profile-row :label="$t('account.label.profile')">
        <template #description>
          <SkeletonStatus v-if="profileReading" :label="$t('account.status.profile_loading')">
            <SkeletonBar class="block h-4 w-32" />
          </SkeletonStatus>
          <span v-else-if="profileFailed !== ''" class="text-sm text-error">{{ profileFailed }}</span>
          <span v-else-if="profile !== null && profile.jobTitle !== ''" class="text-sm text-muted">{{ profile.jobTitle }}</span>
        </template>
        <UButton v-if="profileFailed !== ''" color="neutral" variant="outline" :label="$t('account.action.retry')" @click="void readProfile()" />
        <UButton v-else color="neutral" variant="outline" :label="$t('account.action.change')" :disabled="profile === null" @click="openProfile()" />
      </SettingsRow>
    </SettingsGroup>

    <div v-if="ownSender !== null" class="flex flex-col gap-2">
      <h3 class="text-sm font-medium text-highlighted">{{ $t("picture.label.own") }}</h3>
      <PictureSetting kind="person" :subject="ownSender" :avatar="ownPicture" />
    </div>

    <UAlert v-if="done" color="success" variant="subtle" :description="$t('account.message.saved')" />

    <SettingsDialog v-model:open="editing" :title="$t('account.title.login')" :dirty="dirty">
      <UForm id="account-form" :state="form" class="flex flex-col gap-4" @submit="submit">
        <UFormField :label="$t('account.label.current_password')" name="currentPassword" required>
          <UInput v-model="form.currentPassword" class="w-full" type="password" autocomplete="current-password" />
        </UFormField>

        <UFormField :label="$t('account.label.user_id')" name="name">
          <UInput v-model="form.name" class="w-full" autocomplete="username" />
        </UFormField>

        <UFormField :label="$t('account.label.new_password')" name="password" :hint="$t('common.label.optional')">
          <UInput v-model="form.password" class="w-full" type="password" autocomplete="new-password" />
        </UFormField>

        <UAlert v-if="failure" color="error" variant="subtle" :description="failure" />
      </UForm>

      <template #footer="{ close }">
        <UButton color="neutral" variant="ghost" :label="$t('common.action.cancel')" @click="close()" />
        <UButton type="submit" form="account-form" :label="$t('common.action.save')" :loading="pending" :disabled="pending || !dirty" />
      </template>
    </SettingsDialog>

    <SettingsDialog v-model:open="editingProfile" :title="$t('account.title.profile')" :dirty="profileDirty">
      <UForm id="profile-form" :state="profileForm" class="flex flex-col gap-4" @submit="saveProfile">
        <UFormField :label="$t('account.label.job_title')" name="jobTitle">
          <UInput v-model="profileForm.jobTitle" class="w-full" autocomplete="organization-title" />
        </UFormField>

        <UFormField :label="$t('account.label.landline')" name="landline">
          <UInput v-model="profileForm.landline" class="w-full" type="tel" autocomplete="tel" />
        </UFormField>

        <UFormField :label="$t('account.label.mobile')" name="mobile">
          <UInput v-model="profileForm.mobile" class="w-full" type="tel" autocomplete="tel" />
        </UFormField>

        <UFormField :label="$t('account.label.email')" name="email">
          <UInput v-model="profileForm.email" class="w-full" inputmode="email" autocomplete="email" />
        </UFormField>

        <UAlert v-if="profileFailure" color="error" variant="subtle" :description="profileFailure" />
      </UForm>

      <template #footer="{ close }">
        <UButton color="neutral" variant="ghost" :label="$t('common.action.cancel')" @click="close()" />
        <UButton type="submit" form="profile-form" :label="$t('common.action.save')" :loading="profilePending" :disabled="profilePending || !profileDirty" />
      </template>
    </SettingsDialog>
  </div>
</template>

<script setup lang="ts">
import { avatarFor, useAvatars } from "~/domain/avatars";
import { ownSenderOf } from "~/domain/picture-setting";

import type { AccountUser, OwnerChat, UserProfile } from "#shared/types";
import { failureText } from "bmo-ui/app/domain/errors";

const { t } = useI18n();
const { user, fetch: refreshSession } = useUserSession();

const { data: owner } = useFetch<OwnerChat>("/api/owner", { key: "owner", default: () => ({ chatId: null, senderId: null, senders: [], administrator: false }) });
const ownSender = computed<number | null>(() => ownSenderOf(owner.value));
const avatars = useAvatars();
const ownPicture = computed(() => avatarFor(avatars.value, "person", ownSender.value, user.value?.name ?? ""));

const editing = ref(false);
const failure = ref<string | null>(null);
const done = ref(false);
const pending = ref(false);

const form = reactive({ currentPassword: "", name: user.value?.name ?? "", password: "" });

// The form opens on the account as it stands.
watch(editing, (open) => {
  if (open) {
    Object.assign(form, { currentPassword: "", name: user.value?.name ?? "", password: "" });
    failure.value = null;
    done.value = false;
  }
});

// The current password only vouches for a change, so it is no change of its own; closing with one
// asks first (docs/web.md, 「Forms」).
const dirty = computed(() => form.name !== (user.value?.name ?? "") || form.password !== "");

// The account's profile (docs/accounts.md, 「Users and senders」): the job title and contact details its holder or an
// administrator keeps. A console login before the model names no user, and keeps none.
const account = computed(() => user.value?.id);
const profile = ref<UserProfile | null>(null);
const profileReading = ref(false);
const profileFailed = ref("");
const editingProfile = ref(false);
const profilePending = ref(false);
const profileFailure = ref<string | null>(null);
const profileForm = reactive<UserProfile>({ jobTitle: "", landline: "", mobile: "", email: "" });
const PROFILE_FIELDS: (keyof UserProfile)[] = ["jobTitle", "landline", "mobile", "email"];

async function readProfile(): Promise<void> {
  const id = account.value;

  if (id === undefined) return;

  profileReading.value = true;
  profileFailed.value = "";

  try {
    profile.value = await $fetch<UserProfile>(`/api/users/${id}/profile`);
  } catch (error) {
    profile.value = null;
    profileFailed.value = failureText(error, t("account.error.profile_read_failed"));
  } finally {
    profileReading.value = false;
  }
}

function openProfile(): void {
  if (profile.value === null) return;

  Object.assign(profileForm, profile.value);
  profileFailure.value = null;
  done.value = false;
  editingProfile.value = true;
}

const profileDirty = computed(() => {
  const saved = profile.value;

  return saved !== null && PROFILE_FIELDS.some((field) => profileForm[field] !== saved[field]);
});

async function saveProfile(): Promise<void> {
  const id = account.value;

  if (!profileDirty.value || id === undefined) return;

  profilePending.value = true;
  profileFailure.value = null;

  try {
    const saved = await $fetch<UserProfile>(`/api/users/${id}/profile`, { method: "PUT", body: { ...profileForm } });

    profile.value = saved;
    Object.assign(profileForm, saved);
    editingProfile.value = false;
    done.value = true;
  } catch (error) {
    profileFailure.value = failureText(error, t("account.error.profile_write_failed"));
  } finally {
    profilePending.value = false;
  }
}

// The session's user may land after this section is drawn, so the read waits for the account it is made for.
watch(account, () => void readProfile(), { immediate: true });

async function submit(): Promise<void> {
  if (!dirty.value) return;

  pending.value = true;
  failure.value = null;

  try {
    const result = await $fetch<{ user: AccountUser }>("/api/account", {
      method: "POST",
      body: { currentPassword: form.currentPassword, name: form.name, password: form.password }
    });

    await refreshSession();

    form.currentPassword = "";
    form.password = "";
    form.name = result.user.name;
    editing.value = false;
    done.value = true;
  } catch (error) {
    failure.value = failureText(error, t("account.error.save_failed"));
  } finally {
    pending.value = false;
  }
}
</script>
