<template>
  <!-- A room's chat services, the room information's chat services tab, for the administrator alone (docs/web.md, the
       room screen's chat services): the providers the room stands on, each by its name and nothing to turn, since a room's chat service is
       chosen as it is added and stays. Above them stands the avatar mode's switch, only where it can apply: a room added
       on a chat service that offers the mode, or one the receiver already holds in it; anywhere else nothing of it
       shows. Nothing here tells one provider from another. -->
  <div class="flex min-w-0 flex-col gap-4">
    <ContentSkeleton v-if="loading" :rows="2" listClass="flex flex-col gap-2" :label="$t('room.status.providers_loading')">
      <div class="flex min-h-9 items-center justify-between gap-3">
        <SkeletonBar class="h-4 w-32" />
      </div>
    </ContentSkeleton>

    <template v-else>
      <template v-if="avatarShown">
        <SettingsGroup data-room-mode :aria-busy="modeSaving">
          <SettingsRow :label="$t('room.label.mode_avatar')" :description="$t(mode === 'avatar' ? 'room.message.mode_avatar_on' : 'room.message.mode_avatar_off')">
            <USwitch
              :model-value="mode === 'avatar'"
              :aria-label="$t('room.label.mode_avatar')"
              :disabled="modeSaving"
              @update:model-value="(on: boolean) => void setMode(on ? 'avatar' : 'record-only')"
            />
          </SettingsRow>
        </SettingsGroup>
        <p v-if="modeSaving" role="status" class="sr-only">{{ $t("room.status.mode_saving") }}</p>
      </template>

      <template v-if="view !== null">
        <SettingsGroup data-room-providers>
          <SettingsRow v-for="provider in view.on" :key="provider.key" :label="provider.label" />
        </SettingsGroup>
        <p class="text-sm text-toned">{{ $t("room.message.providers_rule") }}</p>
      </template>
    </template>

    <p v-if="modeFailed !== ''" role="alert" class="break-words text-sm text-error">{{ modeFailed }}</p>
    <p v-if="failed !== ''" role="alert" class="break-words text-sm text-error">{{ failed }}</p>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import type { RoomMode, RoomModeView, RoomProvidersView } from "#shared/types";

interface Props {
  chatId: number;
}

const props = defineProps<Props>();

const { t } = useI18n();

// What the receiver last answered: null until read.
const view = ref<RoomProvidersView | null>(null);
const failed = ref("");

// The room's mode as the receiver last answered it: undefined until read, null for a room never added.
const mode = ref<RoomMode | null | undefined>(undefined);
const modeSaving = ref(false);
const modeFailed = ref("");

// Both reads stand before anything is drawn, so the switch never comes in over the providers once they show.
const loading = computed(() => (view.value === null && failed.value === "") || (mode.value === undefined && modeFailed.value === ""));

// The switch applies to an added room on a chat service that offers the mode, and to one already held in it, which
// the reader may always turn back.
const avatarShown = computed(() => mode.value === "avatar" || (mode.value === "record-only" && view.value?.avatarOffered === true));

async function read(): Promise<void> {
  try {
    view.value = await $fetch<RoomProvidersView>(`/api/rooms/${props.chatId}/providers`);
  } catch (error) {
    failed.value = failureText(error, t("room.error.providers_read_failed"));
  }
}

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

// Read afresh each time the room information opens, so the tab stands as the receiver holds the room now.
onMounted(() => {
  void read();
  void readMode();
});
</script>
