<template>
  <!-- A room's chat providers, for the administrator alone (docs/web.md, the room screen's chat providers): every
       provider the receiver names with a switch, the whole list written at each turn of one. The rule the list
       stands under is the receiver's and is said here in the pack's words; nothing here tells one provider from
       another. -->
  <SettingsDialog v-model:open="open" :title="$t('room.title.providers')" :description="props.title">
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

    <template #footer="{ close }">
      <UButton :label="$t('common.action.close')" color="neutral" variant="ghost" @click="close()" />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { providersTurned } from "~/domain/room-providers";

import type { RoomProvidersView } from "#shared/types";

interface Props {
  chatId: number;
  // The room's name as its screen shows it.
  title: string;
}

const props = defineProps<Props>();
const open = defineModel<boolean>("open", { required: true });

const { t } = useI18n();

// What the receiver last answered: null until read.
const view = ref<RoomProvidersView | null>(null);
const saving = ref(false);
const failed = ref("");

async function read(): Promise<void> {
  try {
    view.value = await $fetch<RoomProvidersView>(`/api/rooms/${props.chatId}/providers`);
  } catch (error) {
    failed.value = failureText(error, t("room.error.providers_read_failed"));
  }
}

// Read afresh each time it opens, so the switches stand as the receiver holds the room now.
watch(open, (now) => {
  if (!now) return;

  view.value = null;
  failed.value = "";
  void read();
}, { immediate: true });

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
