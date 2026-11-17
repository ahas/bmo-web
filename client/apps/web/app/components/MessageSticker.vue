<template>
  <!-- A sticker stands as the picture alone, with no bubble, in the sticker's fixed box, drawn whole inside it, so its
       row is its full height before the file has loaded: kept as the message's picture or as a file of it. A moving
       one plays over and over for as long as it stands, and stands still on its first frame where the reader asked
       for less movement; one that cannot be read stands as its words (docs/web.md, the room screen's wordless messages). -->
  <div data-sticker :class="failed ? '' : 'size-(--chat-sticker) shrink-0'">
    <TelegramAsset
      v-if="props.attachment !== null"
      class="size-full"
      :attachment="props.attachment"
      :chat-id="props.chatId"
      :message-id="props.messageId"
      :fallback="props.alt"
    />
    <img v-else-if="!failed" :src="picture" :alt="props.alt" class="size-full object-contain" loading="lazy" @error="failed = true" />
    <span v-else class="text-sm text-muted">{{ props.alt }}</span>
  </div>
</template>

<script setup lang="ts">
import { useStickerFrames } from "~/domain/sticker-play";

import { framedAddress } from "#shared/sticker-frames";

import type { ExactMessageId, MessageAttachment } from "#shared/types";

// The sticker is the message's picture at `src`, or the sticker file `attachment` where it was kept as a file.
const props = defineProps<{ src: string | null; attachment: MessageAttachment | null; chatId: number; messageId: ExactMessageId; alt: string }>();
const failed = ref(false);
const frames = useStickerFrames();
const picture = computed<string>(() => framedAddress(props.src ?? "", frames.value));

watch(
  () => props.src,
  () => {
    failed.value = false;
  }
);
</script>
