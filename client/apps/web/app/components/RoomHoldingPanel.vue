<template>
  <!-- One kind of what the room's messages carried, newest first, the room information's tab for it (docs/web.md, the
       room screen's room information): the pictures and videos as squares, every other kind as lines. Each opens as it
       opens in the conversation, and a line carries the way to the message it came in. The next page is read as the
       reader nears the end. -->
  <div class="flex min-w-0 flex-col gap-2" :data-room-holding="props.holding">
    <ContentSkeleton v-if="!loaded && pending" :rows="props.holding === 'media' ? 1 : 2" :list-class="props.holding === 'media' ? GRID : LIST" :label="$t(words.loading)">
      <template v-if="props.holding === 'media'">
        <USkeleton v-for="tile in 3" :key="tile" class="aspect-square w-full rounded-lg" />
      </template>
      <div v-else :class="ROW">
        <USkeleton class="size-8 shrink-0 rounded-md" />
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <SkeletonBar class="h-4 w-40" />
          <SkeletonBar class="h-4 w-28" />
        </div>
      </div>
    </ContentSkeleton>

    <ReadFailure :failure="failure" :message="failed ? $t(words.failed) : ''" :reading="pending" @retry="read()" />

    <p v-if="loaded && rows.length === 0 && !more" class="text-sm text-dimmed" data-room-holding-none>{{ $t(words.none) }}</p>

    <MovingList v-else-if="props.holding === 'media'" tag="div" :class="GRID" data-room-holding-rows>
      <!-- Each square is cut by its own corners; a video's and an animation's stand on black where their shape leaves
           room, as in a bubble. -->
      <div v-for="row in rows" :key="row.key" class="relative aspect-square min-w-0 overflow-hidden rounded-lg" :class="row.kind === 'picture' ? 'bg-elevated' : 'bg-black'" :data-held="row.kind">
        <MessageImage
          v-if="row.kind === 'picture'"
          :src="imageUrl(props.chatId, row.messageId)"
          :message-id="row.messageId"
          tile
          flush
          :known="row.shape"
          :title="sentLine(row)"
        />
        <div v-else-if="row.kind === 'video'" class="flex size-full items-center justify-center [&_[data-message-video]]:max-h-full">
          <MessageVideo :attachment="row.attachment" :chat-id="props.chatId" :message-id="row.messageId" />
        </div>
        <div v-else-if="row.kind === 'animation'" class="flex size-full items-center justify-center">
          <MessageAnimation :attachment="row.attachment" :chat-id="props.chatId" :message-id="row.messageId" />
        </div>
      </div>
    </MovingList>

    <MovingList v-else :class="LIST" data-room-holding-rows>
      <li v-for="row in rows" :key="row.key" class="flex min-w-0 items-start gap-1" :data-held="row.kind">
        <a
          v-if="row.kind === 'link'"
          :href="row.url"
          target="_blank"
          rel="noopener noreferrer"
          :class="[ROW, 'min-w-0 flex-1 transition-colors hover:bg-elevated active:bg-accented focus-inset']"
        >
          <UIcon name="i-material-symbols-link" class="size-8 shrink-0 text-dimmed" />
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="text-sm break-all text-highlighted">{{ row.url }}</span>
            <SentLine :first="row.site" :sender="row.senderName" :sent-at="row.sentAt" />
          </span>
        </a>

        <div v-else-if="row.kind === 'file'" :class="[ROW, 'min-w-0 flex-1']" :data-unreceivable="row.attachment.available ? undefined : ''">
          <UIcon name="i-material-symbols-draft-outline" class="size-8 shrink-0 text-dimmed" />
          <div class="flex min-w-0 flex-1 flex-col" :class="row.attachment.available ? '' : 'text-muted'">
            <span class="text-sm break-all text-highlighted">{{ row.attachment.name }}</span>
            <SentLine :first="row.attachment.bytes === null ? null : fileSizeText(row.attachment.bytes)" :sender="row.senderName" :sent-at="row.sentAt" />
          </div>
          <IconButton
            v-if="row.attachment.available"
            icon="i-material-symbols-download"
            :label="$t('common.aria.download_named', { name: row.attachment.name })"
            :to="`${fileUrl(row)}&as=download`"
            external
            download
          />
          <span v-else class="shrink-0 text-sm text-muted">{{ $t("room.label.unreceivable") }}</span>
        </div>

        <div v-else-if="row.kind === 'sound'" :class="[ROW, 'min-w-0 flex-1 flex-col gap-1']">
          <div class="flex w-full min-w-0 items-center gap-2">
            <AudioPlayer
              v-if="row.attachment.available"
              class="min-w-0 flex-1"
              :src="fileUrl(row)"
              :download="`${fileUrl(row)}&as=download`"
              :name="row.attachment.name"
              :size="row.attachment.bytes === null ? null : fileSizeText(row.attachment.bytes)"
            />
            <span v-else class="min-w-0 flex-1 text-sm break-all text-muted">{{ row.attachment.name }} · {{ $t("room.label.unreceivable") }}</span>
            <span v-if="row.seconds !== null" class="shrink-0 text-sm tabular-nums text-dimmed">{{ playClock(row.seconds) }}</span>
          </div>
          <p v-if="row.transcript !== null" class="min-w-0 text-sm break-words whitespace-pre-wrap text-toned">{{ row.transcript }}</p>
          <SentLine class="w-full" :first="null" :sender="row.senderName" :sent-at="row.sentAt" />
        </div>

        <IconButton
          icon="i-material-symbols-chat-outline"
          class="mt-2"
          :label="$t('room.action.show_in_message')"
          data-held-show
          @click="emit('show', row.messageId)"
        />
      </li>
    </MovingList>

    <!-- What the reader nears as the list ends: the next page is read once it comes into view. -->
    <div v-if="more" ref="end" class="flex min-h-8 items-center justify-center" data-room-holding-more>
      <UIcon v-if="pending" name="i-material-symbols-progress-activity" class="size-5 animate-spin text-dimmed motion-reduce:animate-none" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { playClock } from "bmo-ui/app/domain/player";
import { formatStamp } from "bmo-ui/app/domain/time";

import { fileSizeText } from "#shared/file-sizes";
import { useReadFailure } from "~/domain/events";
import { mediaUrl } from "~/domain/player";
import { useRoomHolding } from "~/domain/room-holding";
import { imageUrl } from "~/domain/urls";

import type { HeldRow } from "~/domain/room-holding";
import type { ExactMessageId, RoomHolding } from "#shared/types";

interface Props {
  chatId: number;
  holding: RoomHolding;
}

// The words a kind of tab says while it reads, when it holds nothing and when its read is refused.
interface HoldingWords {
  loading: string;
  none: string;
  failed: string;
}

const WORDS: Record<RoomHolding, HoldingWords> = {
  media: { loading: "room_info.status.media_loading", none: "room_info.label.media_none", failed: "room_info.error.media_failed" },
  file: { loading: "room_info.status.files_loading", none: "room_info.label.files_none", failed: "room_info.error.files_failed" },
  link: { loading: "room_info.status.links_loading", none: "room_info.label.links_none", failed: "room_info.error.links_failed" },
  music: { loading: "room_info.status.music_loading", none: "room_info.label.music_none", failed: "room_info.error.music_failed" },
  voice: { loading: "room_info.status.voice_loading", none: "room_info.label.voice_none", failed: "room_info.error.voice_failed" }
};

// Three squares to a row for the pictures and videos on a narrow screen and four on a wide one; a line of each for the rest, each holding its mark and its button to
// its top, 8px in.
const GRID = "grid grid-cols-3 gap-1 sm:grid-cols-4";
const LIST = "flex flex-col gap-1";
const ROW = "flex min-h-12 min-w-0 items-start gap-3 rounded-md px-2 py-2";

const props = defineProps<Props>();
const emit = defineEmits<{ show: [messageId: ExactMessageId] }>();

const { t } = useI18n();
const words = WORDS[props.holding];
const { rows, loaded, pending, failed, more, read, readMore } = useRoomHolding(props.chatId, props.holding);

function sentLine(row: HeldRow): string {
  return t("room_info.label.sent_by", { name: row.senderName, time: formatStamp(row.sentAt) });
}

function fileUrl(row: HeldRow & { attachment: { id: number; kind: string } }): string {
  return `${mediaUrl(row.attachment.kind, props.chatId, row.messageId)}?item=${row.attachment.id}`;
}

const failure = useReadFailure({
  failed: () => failed.value,
  reading: () => pending.value,
  reread: () => void read()
});

// The next page is read once the end of the list comes into view, inside whatever scrolls the tab.
const end = useTemplateRef<HTMLElement>("end");
let watcher: IntersectionObserver | null = null;

watch(end, (element) => {
  watcher?.disconnect();
  watcher = null;
  if (element === null) return;

  watcher = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) readMore();
  }, { rootMargin: "0px 0px 200px 0px" });
  watcher.observe(element);
});

// A page that leaves the end still in view asks for the next at once: observing again reports where the end stands now.
watch(pending, (reading) => {
  if (reading || watcher === null || end.value === null) return;

  watcher.unobserve(end.value);
  watcher.observe(end.value);
});

onBeforeUnmount(() => watcher?.disconnect());
onMounted(() => void read());
</script>
