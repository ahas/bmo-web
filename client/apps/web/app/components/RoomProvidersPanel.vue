<template>
  <!-- A room's chat providers, the room information's providers tab, for the administrator alone (docs/web.md, the room
       screen's chat providers): every provider the receiver names with a switch, the whole list written at each turn
       of one. The rule the list stands under is the receiver's and is said here in the pack's words; nothing here
       tells one provider from another. -->
  <div class="flex min-w-0 flex-col gap-4">
    <!-- The room's mode first, above its providers (docs/web.md, the room screen's chat providers): on for avatar,
         off for record-only; a room never added has none, and its switch stands off and disabled. -->
    <ContentSkeleton v-if="mode === undefined && modeFailed === ''" :rows="1" listClass="flex flex-col gap-2" :label="$t('room.status.providers_loading')">
      <div class="flex min-h-9 items-center justify-between gap-3">
        <SkeletonBar class="h-4 w-32" />
        <SkeletonBar class="h-5 w-9 rounded-full" />
      </div>
    </ContentSkeleton>
    <template v-else-if="mode !== undefined">
      <SettingsGroup data-room-mode :aria-busy="modeSaving">
        <SettingsRow :label="$t('room.label.mode_avatar')" :description="$t(mode === null ? 'room.message.mode_unadded' : 'room.message.mode_rule')">
          <USwitch
            :model-value="mode === 'avatar'"
            :aria-label="$t('room.label.mode_avatar')"
            :disabled="modeSaving || mode === null"
            @update:model-value="(on: boolean) => void setMode(on ? 'avatar' : 'record-only')"
          />
        </SettingsRow>
      </SettingsGroup>
      <p v-if="modeSaving" role="status" class="sr-only">{{ $t("room.status.mode_saving") }}</p>
    </template>
    <p v-if="modeFailed !== ''" role="alert" class="break-words text-sm text-error">{{ modeFailed }}</p>

    <p class="text-sm text-toned">{{ $t("room.message.providers_rule") }}</p>

    <ContentSkeleton v-if="view === null && failed === ''" :rows="2" listClass="flex flex-col gap-2" :label="$t('room.status.providers_loading')">
      <div class="flex min-h-9 items-center justify-between gap-3">
        <SkeletonBar class="h-4 w-32" />
        <SkeletonBar class="h-5 w-9 rounded-full" />
      </div>
    </ContentSkeleton>

    <template v-else-if="view !== null">
      <SettingsGroup :aria-busy="saving">
        <SettingsRow v-for="provider in view.providers" :key="provider.key" :label="provider.label">
          <USwitch
            :model-value="view.on.includes(provider.key)"
            :aria-label="provider.label"
            :disabled="saving || (view.on.length === 1 && view.on.includes(provider.key))"
            @update:model-value="(on: boolean) => void turn(provider.key, on)"
          />
        </SettingsRow>
      </SettingsGroup>
      <p v-if="!view.chosen" class="text-sm text-muted">{{ $t("room.message.providers_unset") }}</p>
      <p v-if="saving" role="status" class="sr-only">{{ $t("room.status.providers_saving") }}</p>
    </template>

    <p v-if="failed !== ''" role="alert" class="break-words text-sm text-error">{{ failed }}</p>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { providersTurned } from "~/domain/room-providers";

import type { RoomMode, RoomModeView, RoomProvidersView } from "#shared/types";

interface Props {
  chatId: number;
}

const props = defineProps<Props>();

const { t } = useI18n();

// What the receiver last answered: null until read.
const view = ref<RoomProvidersView | null>(null);
const saving = ref(false);
const failed = ref("");

// The room's mode as the receiver last answered it: undefined until read, null for a room never added.
const mode = ref<RoomMode | null | undefined>(undefined);
const modeSaving = ref(false);
const modeFailed = ref("");

async function readMode(): Promise<void> {
  try {
    mode.value = (await $fetch<RoomModeView>(`/api/rooms/${props.chatId}/mode`)).mode;
  } catch (error) {
    modeFailed.value = failureText(error, t("room.error.mode_read_failed"));
  }
}

// The switch turned: the mode written at once, and the switch set to what the receiver answers.
async function setMode(next: RoomMode): Promise<void> {
  modeSaving.value = true;
  modeFailed.value = "";

  try {
    mode.value = (await $fetch<RoomModeView>(`/api/rooms/${props.chatId}/mode`, { method: "PUT", body: { mode: next } })).mode;
  } catch (error) {
    modeFailed.value = failureText(error, t("room.error.mode_save_failed"));
  } finally {
    modeSaving.value = false;
  }
}

async function read(): Promise<void> {
  try {
    view.value = await $fetch<RoomProvidersView>(`/api/rooms/${props.chatId}/providers`);
  } catch (error) {
    failed.value = failureText(error, t("room.error.providers_read_failed"));
  }
}

// Read afresh each time the room information opens, so the switches stand as the receiver holds the room now.
onMounted(() => {
  void read();
  void readMode();
});

// One switch turned: the whole list written as it now stands, and the switches set to what the receiver answers.
async function turn(key: string, on: boolean): Promise<void> {
  if (view.value === null) return;

  saving.value = true;
  failed.value = "";

  try {
    view.value = await $fetch<RoomProvidersView>(`/api/rooms/${props.chatId}/providers`, {
      method: "PUT",
      body: { providers: providersTurned(view.value.on, key, on) }
    });
  } catch (error) {
    failed.value = failureText(error, t("room.error.providers_save_failed"));
  } finally {
    saving.value = false;
  }
}
</script>
