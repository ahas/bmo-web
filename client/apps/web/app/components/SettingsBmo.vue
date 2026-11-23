<template>
  <!-- The own-BMO section (docs/web.md, 「Settings」, the own-BMO section): the profile standing for the reader's own
       BMO, each part with where it came from under it, and whether it keeps its persona; the change button opens the
       form of its text parts, the picture is set in place, and the reset empties the reader's own parts after asking,
       so the company's default stands again. Shown only to a reader who may personalise their BMO, which the account
       service decides. -->
  <div class="flex flex-col gap-6">
    <ContentSkeleton v-if="profile === null && failure === ''" :rows="3" listClass="flex flex-col divide-y divide-default" :label="$t('bmo_profile.status.loading')">
      <div class="flex items-center gap-4 py-3">
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <SkeletonLine width="w-1/4" />
          <SkeletonLine width="w-1/2" />
        </div>
      </div>
    </ContentSkeleton>

    <div v-else-if="profile === null" class="flex flex-col items-end gap-3">
      <UAlert class="w-full" color="error" variant="subtle" :description="failure" />
      <UButton color="neutral" variant="subtle" icon="i-material-symbols-refresh" :label="$t('common.action.refresh')" :loading="pending" @click="refresh()" />
    </div>

    <template v-else>
      <SettingsGroup>
        <SettingsRow :label="$t('bmo_profile.label.name')" data-bmo-part="name">
          <template #description>
            <span class="text-sm text-default">{{ nameShown(t, profile.name.value) }}</span>
            <span v-if="sourceLine(t, profile.name.from) !== null" class="text-sm text-muted">{{ sourceLine(t, profile.name.from) }}</span>
          </template>
          <UButton color="neutral" variant="outline" :label="$t('account.action.change')" data-bmo-change @click="editing = true" />
        </SettingsRow>
        <SettingsRow :label="$t('bmo_profile.label.call_names')" data-bmo-part="call-names">
          <template #description>
            <span class="text-sm text-default wrap-anywhere">{{ profile.callNames.value.length > 0 ? profile.callNames.value.join(", ") : $t("bmo_profile.label.no_call_names") }}</span>
            <span v-if="sourceLine(t, profile.callNames.from) !== null" class="text-sm text-muted">{{ sourceLine(t, profile.callNames.from) }}</span>
          </template>
        </SettingsRow>
        <SettingsRow :label="$t('bmo_profile.label.persona')" data-bmo-part="persona">
          <template #description>
            <span class="line-clamp-2 text-sm text-default whitespace-pre-wrap wrap-anywhere">{{ profile.persona.value ?? $t("common.label.none") }}</span>
            <span v-if="sourceLine(t, profile.persona.from) !== null" class="text-sm text-muted">{{ sourceLine(t, profile.persona.from) }}</span>
          </template>
        </SettingsRow>
        <PersonaChoiceRow />
      </SettingsGroup>

      <SettingsGroup :title="$t('bmo_profile.label.picture')">
        <div class="flex flex-col gap-1 py-3">
          <PictureSetting kind="own-bmo" subject="own" :avatar="picture" />
          <span v-if="sourceLine(t, profile.picture.from) !== null" class="text-sm text-muted">{{ sourceLine(t, profile.picture.from) }}</span>
        </div>
      </SettingsGroup>

      <div class="flex flex-wrap items-center justify-end gap-2">
        <p v-if="said !== ''" role="status" class="me-auto text-sm text-muted">{{ said }}</p>
        <p v-if="resetFailure !== ''" role="alert" class="me-auto break-words text-sm text-error">{{ resetFailure }}</p>
        <UButton color="neutral" variant="ghost" icon="i-material-symbols-restart-alt" :label="$t('bmo_profile.action.reset')" :loading="resetting" :disabled="!ownStands" data-bmo-reset @click="reset" />
      </div>

      <BmoProfileForm v-model:open="editing" :title="$t('settings.label.agent')" :parts="ownParts" :persona="true" :save="saveParts" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import { nameShown, sourceLine } from "~/domain/bmo-profile";
import { useConfirm } from "~/domain/confirm";

import type { OwnBmoParts, OwnBmoView } from "#shared/bmo-profile";
import type { AvatarProps } from "@nuxt/ui";

const { t } = useI18n();
const confirm = useConfirm();

const { data, error, pending, refresh } = useFetch<OwnBmoView | null>("/api/account/agent", { key: "bmo-profile", server: false, lazy: true, default: () => null });

const profile = computed(() => data.value ?? null);
const failure = computed(() => (error.value ? failureText(error.value, t("bmo_profile.error.read_failed")) : ""));
const editing = ref(false);
const resetting = ref(false);
const said = ref("");
const resetFailure = ref("");

const ownParts = computed<OwnBmoParts>(() => ({
  name: profile.value?.own.name ?? null,
  callNames: profile.value?.own.callNames ?? [],
  persona: profile.value?.own.persona ?? null
}));
// Whether anything of the reader's own stands, which the reset would empty.
const ownStands = computed(() => {
  const own = profile.value?.own;

  return own !== undefined && (own.name !== null || own.callNames.length > 0 || own.persona !== null || own.picture);
});
// The picture standing now, read again whenever the profile is, or the first letter of the name standing.
const picture = computed<AvatarProps>(() => ({
  src: profile.value?.picture.from === "deployment" ? undefined : `/api/account/agent/picture?at=${Date.now()}`,
  alt: nameShown(t, profile.value?.name.value ?? null)
}));

async function saveParts(parts: OwnBmoParts): Promise<void> {
  data.value = await $fetch<OwnBmoView>("/api/account/agent", { method: "PUT", body: parts });
  said.value = t("bmo_profile.message.saved");
}

async function reset(): Promise<void> {
  const through = await confirm({ title: t("bmo_profile.label.reset_title"), effect: t("bmo_profile.label.reset_description"), confirm: t("bmo_profile.action.reset") });

  if (!through) return;

  resetting.value = true;
  resetFailure.value = "";
  said.value = "";

  try {
    data.value = await $fetch<OwnBmoView>("/api/account/agent", { method: "DELETE" });
    said.value = t("bmo_profile.message.reset");
  } catch (refused) {
    resetFailure.value = failureText(refused, t("bmo_profile.error.failed"));
  } finally {
    resetting.value = false;
  }
}
</script>
