<template>
  <!-- The desktop section (docs/web.md, 「Settings」, the desktop section): the desktop app's own settings, read from
       the app through its bridge each time the section opens and changed through it one at a time. Only the switches
       the app's platform offers are handed over, and only those the console has words for are drawn. A switch takes
       effect as it is turned; one the app refuses goes back, with the reason under its name. -->
  <div class="flex flex-col gap-3" data-desktop-settings>
    <div v-if="view?.unreadable" role="alert" class="flex flex-col gap-1 text-sm text-error" data-desktop-unreadable>
      <p>{{ $t("desktop.error.settings_unreadable") }}</p>
      <p class="font-mono break-all">{{ view.unreadable }}</p>
    </div>

    <SettingsGroup>
      <FailedRead v-if="failure !== ''" class="py-3" :message="failure" :reading="reading" @retry="void read()" />
      <ContentSkeleton v-else-if="view === null" :rows="3" listClass="flex flex-col divide-y divide-default" :label="$t('desktop.status.settings_loading')">
        <div class="flex items-center justify-between gap-4 py-3">
          <SkeletonBar class="h-4 w-40" />
          <SkeletonBar class="h-5 w-9 rounded-full" />
        </div>
      </ContentSkeleton>
      <template v-else>
        <SettingsRow v-for="one in shown" :key="one.key" :label="$t(one.label)" :data-desktop-switch="one.key">
          <template #description>
            <span v-if="one.hint !== null" class="text-sm text-muted">{{ $t(one.hint) }}</span>
            <span v-if="refusals[one.key]" role="alert" class="flex flex-col text-sm text-error" data-desktop-refusal>
              <span>{{ $t("desktop.error.change_failed") }}</span>
              <span class="font-mono break-all">{{ refusals[one.key] }}</span>
            </span>
          </template>
          <USwitch
            :model-value="one.on"
            :loading="changing === one.key"
            :disabled="Boolean(view.unreadable) || (changing !== null && changing !== one.key)"
            :aria-label="$t(one.label)"
            @update:model-value="(on: boolean) => void turn(one.key, on)"
          />
        </SettingsRow>
      </template>
    </SettingsGroup>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import { DESKTOP_SWITCH_WORDS, changeDesktopSetting, isKnownSwitch, readDesktopSettings } from "~/domain/desktop-app";

import type { DesktopSettings, DesktopSwitchKey } from "~/domain/desktop-app";

const { t } = useI18n();

const view = ref<DesktopSettings | null>(null);
const reading = ref(false);
const failure = ref("");
const changing = ref<DesktopSwitchKey | null>(null);
const refusals = ref<Partial<Record<DesktopSwitchKey, string>>>({});

// The switches the app handed over, in its order, those the console has no words for left out.
const shown = computed(() =>
  (view.value?.switches ?? []).flatMap((one) => (isKnownSwitch(one.switch) ? [{ key: one.switch, on: one.on, ...DESKTOP_SWITCH_WORDS[one.switch] }] : []))
);

// The app's reason for a refusal, as the bridge hands it: the app's own words, or the call's error.
function reasonOf(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;

  return String(error);
}

async function read(): Promise<void> {
  reading.value = true;
  try {
    view.value = await readDesktopSettings();
    failure.value = "";
  } catch (error) {
    failure.value = failureText(error, t("desktop.error.settings_failed"));
  } finally {
    reading.value = false;
  }
}

// One switch turned: written by the app at once, the switch spinning until it answers; a refusal leaves the saved
// value standing, read again, with the reason under the row's name.
async function turn(key: DesktopSwitchKey, on: boolean): Promise<void> {
  if (changing.value !== null) return;

  changing.value = key;
  refusals.value = { ...refusals.value, [key]: undefined };
  try {
    view.value = await changeDesktopSetting(key, on);
  } catch (error) {
    refusals.value = { ...refusals.value, [key]: reasonOf(error) };
    await read();
  } finally {
    changing.value = null;
  }
}

onMounted(() => void read());
</script>
