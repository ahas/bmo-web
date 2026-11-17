<template>
  <!-- An animation as the messenger shows one (docs/web.md, the room screen's animations): it plays as soon as it
       stands, over and over, without sound and without a player. It runs to the edges of the bubble it stands in, or
       of its own corners where it stands alone, at its own shape within a bubble's widest; where the chat service said
       that shape, it keeps its room before the file has loaded. -->
  <video
    data-animation
    :src="url"
    class="mx-auto block max-w-full"
    :class="frame === undefined ? 'max-h-128 w-auto max-w-80' : 'h-auto w-(--picture-width)'"
    :style="frame"
    autoplay
    loop
    muted
    playsinline
    disablepictureinpicture
    :aria-label="props.attachment.name"
  />
</template>

<script setup lang="ts">
import { pictureWidth } from "~/domain/picture-shapes";
import { mediaUrl } from "~/domain/player";

import type { ExactMessageId, MessageAttachment } from "#shared/types";

const props = defineProps<{ attachment: MessageAttachment; chatId: number; messageId: ExactMessageId }>();

const url = computed(() => `${mediaUrl("animation", props.chatId, props.messageId)}?item=${props.attachment.id}`);

// The width the animation stands at and the ratio that holds its height, from the shape the chat service said it has.
const frame = computed<{ "--picture-width": string; aspectRatio: string } | undefined>(() => {
  const shape = props.attachment.shape;

  if (shape === undefined || shape.width <= 0 || shape.height <= 0) return undefined;

  return { "--picture-width": `${pictureWidth(shape)}px`, aspectRatio: `${shape.width} / ${shape.height}` };
});
</script>
