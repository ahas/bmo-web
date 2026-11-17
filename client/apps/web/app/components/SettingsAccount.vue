<template>
  <!-- The account section (docs/web.md, 「Settings」): the account's login and the way to its form, the login and
       the password, which is a dialog of its own with its own save; the profile, the person's name, job title and
       contact details in a dialog of their own; the switch to show one's presence (「Presence and typing」); and one's own
       picture, the sender's linked to the account, set in the console (「Profile photos」). -->
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
          <span v-else-if="profileLine !== ''" class="text-sm text-muted">{{ profileLine }}</span>
        </template>
        <UButton v-if="profileFailed !== ''" color="neutral" variant="outline" :label="$t('account.action.retry')" @click="void readProfile()" />
        <UButton v-else color="neutral" variant="outline" :label="$t('account.action.change')" :disabled="profile === null" @click="openProfile()" />
      </SettingsRow>
    </SettingsGroup>

    <SettingsGroup v-if="account !== undefined">
      <SettingsRow data-presence-row :label="$t('account.label.presence_shown')">
        <template #description>
          <span v-if="presenceFailed !== ''" class="text-sm text-error">{{ presenceFailed }}</span>
          <span v-else class="text-sm text-muted">{{ $t("account.label.presence_shown_description") }}</span>
        </template>
        <SkeletonStatus v-if="presenceShown === null && presenceBusy" :label="$t('account.status.presence_loading')">
          <SkeletonBar class="block h-5 w-9 rounded-full" />
        </SkeletonStatus>
        <UButton v-else-if="presenceShown === null" color="neutral" variant="outline" :label="$t('account.action.retry')" @click="void readPresence()" />
        <USwitch
          v-else
          :model-value="presenceShown ?? true"
          :loading="presenceBusy"
          :disabled="presenceBusy"
          :aria-label="$t('account.label.presence_shown')"
          @update:model-value="(on: boolean) => void setPresence(on)"
        />
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

    <ProfileDialog v-if="account !== undefined" v-model:open="editingProfile" :user="account" :profile="profile" @saved="profileSaved" />
  </div>
</template>

<script setup lang="ts">
import { avatarFor, useAvatars } from "~/domain/avatars";
import { ownSenderOf } from "~/domain/picture-setting";

import type { AccountUser, OwnerChat, UserProfile } from "#shared/types";
import { failureText } from "bmo-ui/app/domain/errors";

const { t } = useI18n();
const { user, fetch: refreshSession } = useUserSession();

const { data: owner } = useFetch<OwnerChat>("/api/owner", { key: "owner", default: () => ({ chatId: null, senderId: null, senders: [], administrator: false, owner: false }) });
const ownSender = computed<number | null>(() => ownSenderOf(owner.value));
const avatars = useAvatars();
const ownPicture = computed(() => avatarFor(avatars.value, "person", ownSender.value, (user.value?.fullName || user.value?.name) ?? ""));

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

// The account's profile (docs/accounts.md, 「Users and senders」): the person's name, job title and contact details
// its holder or an administrator keeps. A console login before the model names no user, and keeps none.
const account = computed(() => user.value?.id);
const profile = ref<UserProfile | null>(null);
const profileReading = ref(false);
const profileFailed = ref("");
const editingProfile = ref(false);
// The row's line: the person's name and the job title, those the account keeps.
const profileLine = computed(() => (profile.value === null ? "" : [profile.value.fullName, profile.value.jobTitle].filter((part) => part !== "").join(" · ")));

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

  done.value = false;
  editingProfile.value = true;
}

// A profile saved stands as the service answered it, and the user menu reads the person's name from the session, which
// the save wrote again.
async function profileSaved(saved: UserProfile): Promise<void> {
  profile.value = saved;
  await refreshSession();
  done.value = true;
}

// Whether the account shows its presence (docs/web.md, 「Presence and typing」), read with the profile and set as it is
// switched; null until it is read.
const presenceShown = ref<boolean | null>(null);
const presenceBusy = ref(false);
const presenceFailed = ref("");

async function readPresence(): Promise<void> {
  if (account.value === undefined) return;

  presenceBusy.value = true;
  presenceFailed.value = "";

  try {
    presenceShown.value = (await $fetch<{ shown: boolean }>("/api/account/presence")).shown;
  } catch (error) {
    presenceShown.value = null;
    presenceFailed.value = failureText(error, t("account.error.presence_read_failed"));
  } finally {
    presenceBusy.value = false;
  }
}

async function setPresence(shown: boolean): Promise<void> {
  presenceBusy.value = true;
  presenceFailed.value = "";

  try {
    presenceShown.value = (await $fetch<{ shown: boolean }>("/api/account/presence", { method: "PUT", body: { shown } })).shown;
  } catch (error) {
    presenceFailed.value = failureText(error, t("account.error.presence_failed"));
  } finally {
    presenceBusy.value = false;
  }
}

// The session's user may land after this section is drawn, so the reads wait for the account they are made for.
watch(account, () => {
  void readProfile();
  void readPresence();
}, { immediate: true });

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
