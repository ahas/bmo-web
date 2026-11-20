<template>
  <!-- A room's tone layer, the room information's tone tab, for the administrator alone (docs/web.md, the room screen's
       tone layer): the layers the receiver offers by their own names and none, the choice written at once and the
       select set to what the receiver answers. -->
  <SettingsGroup data-room-tone :aria-busy="saving">
    <SettingsRow :label="$t('room_info.label.tone')" :description="$t('room_info.message.tone_rule')">
      <ContentSkeleton v-if="view === null && failed === ''" :rows="1" :label="$t('room_info.status.tone_loading')">
        <SkeletonBar class="h-8 w-36" />
      </ContentSkeleton>
      <ChoiceSelect
        v-else-if="view !== null"
        :model-value="view.tone ?? NONE"
        :items="items"
        value-key="value"
        class="w-36"
        :loading="saving"
        :disabled="saving"
        :aria-label="$t('room_info.label.tone')"
        @update:model-value="(value: string) => void choose(value)"
      />
    </SettingsRow>
  </SettingsGroup>
  <p v-if="saving" role="status" class="sr-only">{{ $t("room_info.status.tone_saving") }}</p>
  <p v-if="failed !== ''" role="alert" class="mt-4 break-words text-sm text-error">{{ failed }}</p>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import type { RoomToneView } from "#shared/types";

interface Props {
  chatId: number;
}

// The choice of no layer, which no layer's name can be: a layer's name is a file's name.
const NONE = "/";

const props = defineProps<Props>();

const { t } = useI18n();

// What the receiver last answered: null until read.
const view = ref<RoomToneView | null>(null);
const saving = ref(false);
const failed = ref("");

// Each layer by its own name, never translated, the one the room stands on among them where the deployment no
// longer offers it, and none last, marked as the receiver's default.
const items = computed(() => {
  const offered = view.value?.tones ?? [];
  const standing = view.value?.tone ?? null;
  const layers = standing === null || offered.includes(standing) ? offered : [...offered, standing];

  return [...layers.map((tone) => ({ label: tone, value: tone })), { label: t("room_info.label.tone_none"), value: NONE }];
});

// Read afresh each time the room information opens, so the select stands as the receiver holds the room now.
onMounted(async () => {
  try {
    view.value = await $fetch<RoomToneView>(`/api/rooms/${props.chatId}/tone`);
  } catch (error) {
    failed.value = failureText(error, t("room_info.error.tone_read_failed"));
  }
});

// A layer chosen: written at once, and the select set to what the receiver answers.
async function choose(value: string): Promise<void> {
  const tone = value === NONE ? null : value;

  if (view.value === null || tone === view.value.tone) return;

  saving.value = true;
  failed.value = "";

  try {
    view.value = await $fetch<RoomToneView>(`/api/rooms/${props.chatId}/tone`, { method: "PUT", body: { tone } });
  } catch (error) {
    failed.value = failureText(error, t("room_info.error.tone_save_failed"));
  } finally {
    saving.value = false;
  }
}
</script>
