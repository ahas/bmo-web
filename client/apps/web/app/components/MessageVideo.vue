<template>
  <!-- A video a message carried, as the shared player's still (docs/web.md, the room screen's attachments section):
       its first frame with the play mark and the length over it, running to the bubble's edges with no corners or
       edge of its own, so the bubble's corners cut it. Where Telegram said what shape it is, it stands in that shape
       from the first frame, no taller than 20rem and no wider than the bubble. A press opens the full player over the
       screen, which plays one at a time with the room's sounds. The still asks a bubble fitted to it for its
       picture's width at the full 20rem height, and a bubble holding a picture is never wider than 20rem, so it asks
       for no more. -->
  <VideoPlayer data-message-video class="max-w-80" size="still" :src="url" :title="props.attachment.name" :shape="props.attachment.shape ?? null" />
</template>

<script setup lang="ts">
import { mediaUrl } from "../domain/player";
import type { MessageAttachment } from "#shared/types";

const props = defineProps<{ attachment: MessageAttachment; chatId: number; messageId: number }>();

const url = computed(() => `${mediaUrl(props.attachment.kind, props.chatId, props.messageId)}?item=${props.attachment.id}`);
</script>
