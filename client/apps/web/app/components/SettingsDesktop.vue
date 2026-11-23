<template>
  <!-- The desktop section (docs/web.md, 「Settings」, the desktop section): the desktop app's own settings, read from
       the app through its bridge each time the section opens and changed through it one at a time. Only the switches
       the app's platform offers are handed over, and only those the console has words for are drawn; under them the
       server the app connects to, changed through its own form, and the update channel, each where the app hands
       one over. A switch takes effect as it is turned and the channel as it is chosen; a change the app refuses goes
       back, with the reason under its name. -->
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
        <SettingsRow v-if="server !== null" :label="$t('desktop.label.server')" data-desktop-server>
          <template #description>
            <span class="font-mono text-sm break-all text-muted" data-desktop-server-address>{{ server }}</span>
          </template>
          <UButton
            color="neutral"
            variant="outline"
            :label="$t('desktop.action.change_server')"
            :disabled="Boolean(view.unreadable) || changing !== null"
            @click="openServer()"
          />
        </SettingsRow>
        <SettingsRow v-if="channel !== null" :label="$t('desktop.label.update_channel')" data-desktop-channel>
          <template #description>
            <span class="text-sm text-muted">{{ $t("desktop.message.update_channel") }}</span>
            <span v-if="refusals[CHANNEL]" role="alert" class="flex flex-col text-sm text-error" data-desktop-refusal>
              <span>{{ $t("desktop.error.change_failed") }}</span>
              <span class="font-mono break-all">{{ refusals[CHANNEL] }}</span>
            </span>
          </template>
          <!-- A fieldset holds the choices while the app answers or cannot change its file, as a switch is held. -->
          <fieldset :disabled="Boolean(view.unreadable) || changing !== null">
            <SettingsSegment
              :model-value="channel"
              :items="channelItems"
              :label="$t('desktop.label.update_channel')"
              @update:model-value="(value: string) => void choose(value)"
            />
          </fieldset>
        </SettingsRow>
      </template>
    </SettingsGroup>

    <SettingsDialog v-model:open="editingServer" :title="$t('desktop.title.server')" :dirty="serverChanges">
      <UForm id="desktop-server-form" :state="serverForm" class="flex flex-col gap-4" data-desktop-server-form @submit="submitServer">
        <UFormField :label="$t('desktop.label.server_address')" name="address" :help="$t('desktop.message.server_address')">
          <UInput
            v-model="serverForm.address"
            class="w-full font-mono"
            inputmode="url"
            autocomplete="url"
            autocapitalize="off"
            spellcheck="false"
            :readonly="restarting"
          />
        </UFormField>
        <p class="text-sm text-muted">{{ $t("desktop.message.server_change") }}</p>
        <p v-if="restarting" role="status" class="text-sm" data-desktop-server-restarting>{{ $t("desktop.message.server_restarting") }}</p>
        <div v-if="serverRefusal" role="alert" class="flex flex-col text-sm text-error" data-desktop-server-refusal>
          <span>{{ $t("desktop.error.change_failed") }}</span>
          <span class="font-mono break-all">{{ serverRefusal }}</span>
        </div>
      </UForm>

      <template #footer="{ close }">
        <UButton color="neutral" variant="ghost" :label="$t('common.action.cancel')" :disabled="restarting" @click="close()" />
        <UButton
          type="submit"
          form="desktop-server-form"
          :label="$t('common.action.save')"
          :loading="sendingServer || restarting"
          :disabled="sendingServer || restarting || !serverChanges.dirty.value"
        />
      </template>
    </SettingsDialog>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { useOpenedWith } from "bmo-ui/app/domain/form-save";

import {
  DESKTOP_CHANNELS,
  DESKTOP_CHANNEL_DEFAULT,
  DESKTOP_CHANNEL_WORDS,
  DESKTOP_SWITCH_WORDS,
  changeDesktopChannel,
  changeDesktopServer,
  changeDesktopSetting,
  isDesktopChannel,
  isKnownSwitch,
  readDesktopSettings
} from "~/domain/desktop-app";

import type { DesktopSettings, DesktopSwitchKey } from "~/domain/desktop-app";

// The update channel's key, beside the switches' keys, for the change in flight and a refusal.
const CHANNEL = "updateChannel";

type SettingKey = DesktopSwitchKey | typeof CHANNEL;

const { t } = useI18n();

const view = ref<DesktopSettings | null>(null);
const reading = ref(false);
const failure = ref("");
const changing = ref<SettingKey | null>(null);
const refusals = ref<Partial<Record<SettingKey, string>>>({});

// The switches the app handed over, in its order, those the console has no words for left out.
const shown = computed(() =>
  (view.value?.switches ?? []).flatMap((one) => (isKnownSwitch(one.switch) ? [{ key: one.switch, on: one.on, ...DESKTOP_SWITCH_WORDS[one.switch] }] : []))
);

// The channel the app runs on, where it hands one over that the console knows.
const channel = computed(() => {
  const chosen = view.value?.updateChannel;

  return isDesktopChannel(chosen) ? chosen : null;
});

// The server the app connects to, where it hands one over.
const server = computed(() => {
  const address = view.value?.consoleUrl;

  return typeof address === "string" && address !== "" ? address : null;
});

// The server's form: the address entered, sent whole to the app, which checks it is a BMO console before keeping it
// and then starts again on it, so a server taken holds the form still until the window goes.
const editingServer = ref(false);
const serverForm = reactive({ address: "" });
const sendingServer = ref(false);
const restarting = ref(false);
const serverRefusal = ref("");
const serverChanges = useOpenedWith(() => ({ address: serverForm.address.trim() }), { open: editingServer });

function openServer(): void {
  serverForm.address = server.value ?? "";
  serverRefusal.value = "";
  editingServer.value = true;
}

async function submitServer(): Promise<void> {
  if (sendingServer.value || restarting.value || !serverChanges.dirty.value) return;

  const before = server.value;

  sendingServer.value = true;
  serverRefusal.value = "";
  try {
    const answered = await changeDesktopServer(serverForm.address);

    view.value = answered;
    // The app answers with the server it now starts again on; the one it runs on already changes nothing.
    if (answered.consoleUrl !== before) restarting.value = true;
    else editingServer.value = false;
  } catch (error) {
    serverRefusal.value = reasonOf(error);
  } finally {
    sendingServer.value = false;
  }
}

// The channels' real values, in the app's order, the default marked as such.
const channelItems = computed(() =>
  DESKTOP_CHANNELS.map((value) => {
    const label = t(DESKTOP_CHANNEL_WORDS[value]);

    return { label: value === DESKTOP_CHANNEL_DEFAULT ? t("desktop.label.default_value", { value: label }) : label, value };
  })
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
  await change(key, () => changeDesktopSetting(key, on));
}

// The channel chosen: written by the app at once, its choices held until it answers, a refusal as a switch's.
async function choose(value: string): Promise<void> {
  if (!isDesktopChannel(value) || value === channel.value) return;

  await change(CHANNEL, () => changeDesktopChannel(value));
}

// One change at a time through the bridge, the settings as the app answers them, or the saved ones read again
// with the reason under the row's name.
async function change(key: SettingKey, through: () => Promise<DesktopSettings>): Promise<void> {
  if (changing.value !== null) return;

  changing.value = key;
  refusals.value = { ...refusals.value, [key]: undefined };
  try {
    view.value = await through();
  } catch (error) {
    refusals.value = { ...refusals.value, [key]: reasonOf(error) };
    await read();
  } finally {
    changing.value = null;
  }
}

onMounted(() => void read());
</script>
