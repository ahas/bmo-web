<template>
  <!-- The start guide opened again (docs/web.md, 「Settings」, the account section): one row while the reader has a flow of the start guide,
       opening it at the step kept, or from its start where it was finished; the dialog is left behind as it opens. -->
  <SettingsGroup v-if="guide !== null && guide.flow !== null">
    <SettingsRow :label="$t('guide.label.again')" data-guide-again>
      <UButton color="neutral" variant="outline" trailing-icon="i-material-symbols-arrow-forward" :label="$t('common.action.open')" :loading="opening" @click="void open()" />
    </SettingsRow>
  </SettingsGroup>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { useIsland } from "bmo-ui/app/domain/island";

import { GUIDE_PATH } from "~/domain/guide";
import { useSettings } from "~/domain/settings-dialog";

import type { GuideView } from "#shared/guide";

const { t } = useI18n();
const island = useIsland(t);
const settings = useSettings();
const guide = ref<GuideView | null>(null);
const opening = ref(false);

// A guide finished is begun again from its start; one under way opens where it stands.
async function open(): Promise<void> {
  opening.value = true;
  try {
    if (guide.value?.finished === true) await $fetch("/api/me/guide", { method: "PUT", body: { restart: true } });
    settings.value = { ...settings.value, open: false, entered: false };
    await navigateTo(GUIDE_PATH);
  } catch (error) {
    island.say({ title: failureText(error, t("guide.error.failed")), tone: "error" });
  } finally {
    opening.value = false;
  }
}

onMounted(async () => {
  guide.value = await $fetch<GuideView>("/api/me/guide").catch(() => null);
});
</script>
