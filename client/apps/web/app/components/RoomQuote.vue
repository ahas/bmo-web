<template>
  <!-- The message a bubble answers, a line at the head of the bubble: a bar on the leading edge,
       a small preview of what the answered message carried where it carried something to see, and
       beside it who said it and one line of what it said. Pressing it goes to that message; one the
       archive does not hold goes nowhere. -->
  <button
    type="button"
    data-quote
    class="mb-2 flex max-w-full min-w-0 items-center gap-2 rounded-md border-s-2 border-primary bg-default/60 py-1 ps-2 pe-3 text-start text-sm transition-colors hover:bg-default active:bg-accented disabled:cursor-default disabled:hover:bg-default/60"
    :disabled="props.quote.senderName === null"
    :aria-label="$t('room.aria.go_to_quote', { name: look.name })"
    @click.stop="emit('jump', props.quote.messageId)"
  >
    <img
      v-if="look.media?.kind === 'picture'"
      :src="imageUrl(props.chatId, props.quote.messageId)"
      alt=""
      loading="lazy"
      class="size-10 shrink-0"
      :class="look.media.sticker ? 'object-contain' : 'rounded-sm object-cover'"
    />
    <TelegramAsset
      v-else-if="look.media?.kind === 'sticker'"
      class="size-10 shrink-0 object-contain"
      :attachment="look.media.attachment"
      :chat-id="props.chatId"
      :message-id="props.quote.messageId"
      :fallback="look.words"
    />
    <!-- A video's first frame, as its player stands it. -->
    <video
      v-else-if="look.media?.kind === 'video' && look.media.attachment.available"
      :src="`${mediaUrl('video', props.chatId, props.quote.messageId)}?item=${look.media.attachment.id}#t=0.1`"
      preload="metadata"
      muted
      playsinline
      aria-hidden="true"
      class="pointer-events-none size-10 shrink-0 rounded-sm bg-black object-cover"
    />
    <UIcon
      v-else-if="look.media !== null"
      :name="mediaIcon(look.media.kind)"
      class="size-5 shrink-0 text-dimmed"
    />

    <span class="flex min-w-0 flex-col">
      <span class="truncate font-medium" :class="props.quote.senderName === null ? 'text-muted' : 'text-highlighted'">{{ look.name }}</span>
      <span v-if="look.words !== ''" class="truncate text-muted">{{ look.words }}</span>
    </span>
  </button>
</template>

<script setup lang="ts">
import { mediaUrl } from "~/domain/player";
import { quoteText } from "~/domain/room";
import { imageUrl } from "~/domain/urls";

import type { ExactMessageId, ReplyQuote } from "#shared/types";
import type { QuoteMedia } from "~/domain/room";

const props = defineProps<{ quote: ReplyQuote; chatId: number }>();

const emit = defineEmits<{ jump: [messageId: ExactMessageId] }>();

const { t } = useI18n();
const look = computed(() => quoteText(t, props.quote));

// The mark a carried thing with no picture of its own stands as.
function mediaIcon(kind: Exclude<QuoteMedia["kind"], "picture">): string {
  switch (kind) {
    case "voice":
      return "i-material-symbols-mic-outline";
    case "video":
      return "i-material-symbols-video-file-outline";
    case "sticker":
      return "i-material-symbols-add-reaction-outline";
    case "file":
      return "i-material-symbols-draft-outline";
  }
}
</script>
