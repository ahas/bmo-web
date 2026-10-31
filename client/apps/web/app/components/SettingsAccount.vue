<template>
  <!-- The account section (docs/web.md, 「Settings」): the account's name and the way to its one form, the
       name and the password, which is a dialog of its own with its own save; and one's own picture, the sender's
       linked to the account, set in the console (「Profile photos」). -->
  <div class="flex flex-col gap-6">
    <SettingsGroup>
      <SettingsRow :label="$t('account.title.login')" :description="user?.name">
        <UButton color="neutral" variant="outline" :label="$t('account.action.change')" @click="editing = true" />
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
  </div>
</template>

<script setup lang="ts">
import { avatarFor, useAvatars } from "~/domain/avatars";

import type { OwnerChat } from "#shared/types";
import { failureText } from "bmo-ui/app/domain/errors";

import type { AccountUser } from "#shared/types";

const { t } = useI18n();
const { user, fetch: refreshSession } = useUserSession();

// Whose picture is one's own: the sender the receiver files the owner under for the administrator, and the first
// sender linked to the account otherwise; none where no sender is known.
const { data: owner } = useFetch<OwnerChat>("/api/owner", { key: "owner", default: () => ({ chatId: null, senderId: null, senders: [], administrator: false }) });
const ownSender = computed<number | null>(() => owner.value.senderId !== null && owner.value.senders.includes(owner.value.senderId) ? owner.value.senderId : (owner.value.senders[0] ?? null));
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
