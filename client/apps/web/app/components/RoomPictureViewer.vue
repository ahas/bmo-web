<template>
  <!-- The room's own picture viewer. Opened on any picture of the room's feed, it walks every
       picture the room holds in the room's order, an album's pictures among them, reading further
       back or on as it nears either end of what it has read. Its head carries the way back to the
       message the picture went out in and the picture's properties. -->
  <ImageViewer
    v-model:open="open"
    :src="src"
    :title="title"
    :can-previous="canPrevious"
    :can-next="canNext"
    :return-focus="!leaving"
    @previous="previous"
    @next="next"
    @loaded="drawn = $event"
  >
    <template #actions>
      <ActionGroup :actions="actions" :properties="properties(drawn) ?? []" :properties-title="picture?.file?.name ?? null" :narrow-fold="false" />
    </template>
  </ImageViewer>
</template>

<script setup lang="ts">
import { useRoomPictures } from "~/domain/gallery";
import { useIsland } from "bmo-ui/app/domain/island";

import type { ExactMessageId } from "#shared/types";
import type { BarAction } from "bmo-ui/app/domain/tabs";
import type { Size } from "bmo-ui/app/domain/zoom";

interface Props {
  chatId: number;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  // The message a picture went out in, to be brought into view in the room.
  show: [messageId: ExactMessageId];
}>();

const { t } = useI18n();
const island = useIsland(t);

const { open, current, picture, src, title, canPrevious, canNext, neighbours, show, previous, next, properties } = useRoomPictures(t, props.chatId, (error) =>
  island.fail(error, t("room.error.pictures_failed"))
);

// The size the browser read off the picture standing, which its properties name.
const drawn = ref<Size | null>(null);
// Whether the viewer is closing to bring a message into view, where the keyboard is not handed back
// to the picture that opened it.
const leaving = ref(false);

watch(src, () => {
  drawn.value = null;
});

// The pictures either side are fetched ahead, so going to one shows it at once.
watch(neighbours, (urls) => {
  for (const url of urls) {
    new Image().src = url;
  }
});

const actions = computed<BarAction[]>(() => [
  { id: "show-in-message", label: t("room.action.show_in_message"), icon: "i-material-symbols-chat-outline", onSelect: showInMessage }
]);

function showInMessage(): void {
  if (current.value === null) {
    return;
  }

  leaving.value = true;
  open.value = false;
  emit("show", current.value);
}

function openOn(messageId: ExactMessageId, named: string): Promise<void> {
  leaving.value = false;

  return show(messageId, named);
}

defineExpose({ show: openOn });
</script>
