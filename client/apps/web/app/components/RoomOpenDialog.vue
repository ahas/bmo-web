<template>
  <!-- A group room opened in the console (docs/web.md, the room screen's section on opening a room and letting people
       in): its name, and the room stands naming the reader's own BMO, the reader its first member. A refusal — a reader
       with no BMO of their own among them — is said under the field and nothing is made. -->
  <SettingsDialog v-model:open="open" :title="$t('room.title.room_open')">
    <form id="room-open-form" class="flex flex-col gap-3" @submit.prevent="void make()">
      <UFormField :label="$t('room.label.room_open_title')" name="title" :error="failure === '' ? undefined : failure">
        <UInput v-model="title" class="w-full" :maxlength="ROOM_TITLE_LIMIT" autofocus />
      </UFormField>
    </form>

    <template #footer="{ close }">
      <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" @click="close()" />
      <UButton type="submit" form="room-open-form" :label="$t('room.action.room_open')" :disabled="title.trim() === '' || busy" :loading="busy" />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import { ROOM_TITLE_LIMIT } from "#shared/config";

import type { RoomAdded } from "#shared/types";

const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ added: [room: RoomAdded] }>();

const { t } = useI18n();

const title = ref("");
const busy = ref(false);
const failure = ref("");

async function make(): Promise<void> {
  busy.value = true;
  failure.value = "";

  try {
    const room = await $fetch<RoomAdded>("/api/rooms", { method: "POST", body: { title: title.value.trim() } });

    open.value = false;
    emit("added", room);
  } catch (error) {
    failure.value = failureText(error, t("room.error.open_failed"));
  } finally {
    busy.value = false;
  }
}

watch(open, (standing) => {
  if (!standing) return;

  title.value = "";
  failure.value = "";
});
</script>
