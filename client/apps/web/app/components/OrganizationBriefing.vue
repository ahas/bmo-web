<template>
  <!-- The voice briefing's one switch, the receiver's (docs/web.md, 「Organisation settings」, the voice briefing tab):
       whether anything is spoken at all, for the whole deployment. A briefing switched on plays as it arrives, so
       there is nothing else to set here; one the receiver refused springs back, and the refusal stands under the tab.
       Where the player stands and its trial voice are each viewer's own, in the settings dialog's briefing player
       section. -->
  <div class="flex flex-col gap-6">
    <ContentSkeleton v-if="switches === null && failure === ''" :rows="1" listClass="flex flex-col divide-y divide-default" :label="$t('briefing.status.settings_loading')">
      <div class="flex items-center gap-4 py-3">
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <SkeletonLine width="w-1/3" />
          <SkeletonLine width="w-1/2" />
        </div>
        <SkeletonBar class="h-5 w-9 shrink-0 rounded-full" />
      </div>
    </ContentSkeleton>

    <div v-else-if="switches === null" class="flex flex-col items-end gap-3">
      <UAlert class="w-full" color="error" variant="subtle" :description="failure" />
      <UButton color="neutral" variant="subtle" icon="i-material-symbols-refresh" :label="$t('common.action.refresh')" @click="read" />
    </div>

    <template v-else>
      <SettingsGroup>
        <SettingsRow :label="$t('briefing.label.switch_all')" :description="$t('briefing.label.switch_all_note')">
          <USwitch :model-value="switches.on" :aria-label="$t('briefing.label.switch_all')" :disabled="busy" data-briefing-switch="on" @update:model-value="(on: boolean) => set({ on })" />
        </SettingsRow>
      </SettingsGroup>
      <p v-if="failure !== ''" role="alert" class="text-sm text-error">{{ failure }}</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import type { BriefingSwitches } from "#shared/types";

const { t } = useI18n();

const switches = ref<BriefingSwitches | null>(null);
const busy = ref(false);
const failure = ref("");

async function read(): Promise<void> {
  failure.value = "";

  try {
    switches.value = await $fetch<BriefingSwitches>("/api/voice-briefing");
  } catch (error) {
    failure.value = failureText(error, t("briefing.error.settings_read_failed"));
  }
}

// The switch set; the answer is how it stands after it.
async function set(change: { on: boolean }): Promise<void> {
  const before = switches.value;

  if (before === null) return;

  busy.value = true;
  failure.value = "";
  switches.value = { ...before, ...change };

  try {
    switches.value = await $fetch<BriefingSwitches>("/api/voice-briefing", { method: "PUT", body: change });
  } catch (error) {
    switches.value = before;
    failure.value = failureText(error, t("briefing.error.settings_write_failed"));
  } finally {
    busy.value = false;
  }
}

onMounted(() => void read());
</script>
