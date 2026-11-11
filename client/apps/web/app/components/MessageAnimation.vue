<template>
  <!-- An animation as the messenger shows one (docs/web.md, the room screen's animations): it plays as soon as it
       stands, over and over, without sound and without a player, at its own shape within the bubble's widest. -->
  <video
    data-animation
    :src="url"
    class="block max-h-80 w-auto max-w-80 rounded-md"
    autoplay
    loop
    muted
    playsinline
    disablepictureinpicture
    :aria-label="props.attachment.name"
  />
</template>

<script setup lang="ts">
import { mediaUrl } from "~/domain/player";

import type { MessageAttachment } from "#shared/types";

const props = defineProps<{ attachment: MessageAttachment; chatId: number; messageId: number }>();

const url = computed(() => `${mediaUrl("animation", props.chatId, props.messageId)}?item=${props.attachment.id}`);
</script>
