<template>
  <!-- The start guide's first chat (docs/web.md, 「The start guide」): the reader's own BMO's room, one message suggested in
       a field they may change; the page's footer says it there or opens the room. Where no room stands it says so. -->
  <div class="flex flex-col gap-4" data-guide-talk>
    <ContentSkeleton v-if="room === undefined" :rows="2" :label="$t('guide.status.loading')">
      <SkeletonLine width="w-2/3" />
    </ContentSkeleton>
    <UAlert v-else-if="room === null" color="neutral" variant="subtle" :description="$t('guide.message.no_room')" data-guide-no-room />
    <UFormField v-else :label="$t('guide.label.words')" name="words">
      <GrowingTextarea v-model="words" class="w-full" :rows="2" :maxlength="MAX_SAY_TEXT_LENGTH" data-guide-words />
    </UFormField>
    <p v-if="failure !== ''" role="alert" class="break-words text-sm text-error" data-guide-failure>{{ failure }}</p>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import { MAX_SAY_TEXT_LENGTH } from "#shared/config";

// The room the reader's own BMO answers them in: undefined while it is read, null where none stands.
const room = defineModel<number | null | undefined>("room", { required: true });

const { t } = useI18n();
const words = ref(t("guide.message.first_words"));
const failure = ref("");

/** Whether there are words to say. */
const sayable = computed(() => room.value !== null && room.value !== undefined && words.value.trim() !== "");

/** The words said in the room as its input box says them; true where they went. */
async function say(): Promise<boolean> {
  if (!sayable.value) return false;

  failure.value = "";
  try {
    await $fetch(`/api/rooms/${room.value}/say`, { method: "POST", body: { text: words.value.trim() } });

    return true;
  } catch (error) {
    failure.value = failureText(error, t("guide.error.failed"));

    return false;
  }
}

defineExpose({ say, sayable });

onMounted(async () => {
  room.value = await $fetch<{ room: number | null }>("/api/me/guide/room").then(
    (answer) => answer.room,
    () => null
  );
});
</script>
