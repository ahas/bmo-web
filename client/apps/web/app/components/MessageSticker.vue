<template>
  <!-- A sticker stands as the picture alone, with no bubble, in the sticker's fixed box, drawn whole inside it, so its
       row is its full height before the file has loaded: kept as the message's picture or as a file of it, or, where
       nothing of it is kept, the emoji it was sent for, large in the box. A moving one plays over and over for as long
       as it stands, and stands still on its first frame where the reader asked for less movement; one that cannot be
       read stands as its words (docs/web.md, the room screen's wordless messages). -->
  <div data-sticker :class="failed ? '' : 'size-(--chat-sticker) shrink-0'">
    <TelegramAsset
      v-if="props.attachment !== null"
      class="size-full"
      :attachment="props.attachment"
      :chat-id="props.chatId"
      :message-id="props.messageId"
      :fallback="props.alt"
    />
    <span
      v-else-if="props.src === null && props.emoji !== null"
      data-sticker-emoji
      role="img"
      :aria-label="props.emoji"
      class="flex size-full items-center justify-center text-(length:--chat-sticker-emoji) leading-none select-none"
    >{{ props.emoji }}</span>
    <img v-else-if="!failed" :src="picture" :alt="props.alt" class="size-full object-contain" loading="lazy" @error="failed = true" />
    <span v-else class="text-sm text-muted">{{ props.alt }}</span>
  </div>
</template>

<script setup lang="ts">
import { useStickerFrames } from "~/domain/sticker-play";

import { framedAddress } from "#shared/sticker-frames";

import type { ExactMessageId, MessageAttachment } from "#shared/types";

// The sticker is the message's picture at `src`, or the sticker file `attachment` where it was kept as a file, or the
// `emoji` it was sent for where neither was kept.
const props = withDefaults(
  defineProps<{ src: string | null; attachment: MessageAttachment | null; emoji?: string | null; chatId: number; messageId: ExactMessageId; alt: string }>(),
  { emoji: null }
);
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
