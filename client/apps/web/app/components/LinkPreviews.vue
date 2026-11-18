<template>
  <!-- The pages a message's addresses lead to, a card each under the words (docs/web.md, the link previews rule): the
       site, the title and what the page says of itself, and the page's picture as a square at the trailing edge.
       A card is a link out of this console and opens in a tab of its own. It stands inside the bubble as a reply's
       quote does, told apart by a step of ground and its leading rule, with no border. Its width and height are
       fixed before the page is read, so nothing moves when it fills: it asks the bubble for its least width, and
       stands as wide as the bubble, whether the bubble's words made it wider or its room keeps it narrower; the
       title and the description share three lines, the description taking what the title leaves. The cards are
       asked for only once the message comes near the screen, and an address whose page said nothing stands as its
       site and address alone. -->
  <ul ref="list" class="mt-2 flex min-w-0 flex-col gap-2">
    <!-- Each card is a flex item of its row: its own width is what it asks the bubble for — its words, contained,
         ask for nothing — and it grows to the room the bubble gives and shrinks to a narrower one. -->
    <li v-for="card in cards" :key="card.url" class="flex">
      <a
        :href="card.url"
        target="_blank"
        rel="noopener noreferrer"
        data-link-preview
        class="group flex h-26 w-80 max-w-full min-w-0 grow overflow-hidden [contain:inline-size] rounded-lg border-s-2 border-primary bg-default/60 transition-colors hover:bg-default active:bg-accented"
        @click.stop
      >
        <span class="flex min-w-0 flex-1 flex-col gap-2 px-3 py-2">
          <span data-link-site class="truncate text-sm text-muted">{{ card.siteName ?? card.host }}</span>
          <SkeletonStatus v-if="reading" as="span" class="flex flex-col" :label="$t('common.status.link_preview_loading')">
            <SkeletonLine width="w-3/4" />
            <SkeletonLine />
            <SkeletonLine width="w-1/2" />
          </SkeletonStatus>
          <span v-else-if="card.title !== null" class="line-clamp-3 text-sm break-words">
            <span data-link-title class="font-medium text-highlighted group-hover:underline">{{ card.title }}</span>
            <template v-if="card.description !== null">
              <!-- The space keeps the two apart where the words are read as one line, as the tooltip of a clamped
                   box reads them. -->
              {{ " " }}<br>
              <span data-link-description class="text-toned">{{ card.description }}</span>
            </template>
          </span>
          <span v-else class="line-clamp-3 text-sm break-all text-toned group-hover:underline">{{ card.url }}</span>
        </span>
        <img
          v-if="card.image && !broken.has(card.index)"
          data-link-picture
          :src="imagePath(card.index)"
          alt=""
          loading="lazy"
          class="me-3 size-20 shrink-0 self-center rounded-md object-cover"
          @error="broken = new Set([...broken, card.index])"
        >
        <span class="sr-only">{{ $t("common.aria.opens_new_tab") }}</span>
      </a>
    </li>
  </ul>
</template>

<script setup lang="ts">
import { messageLinks } from "#shared/links";
import { appUrl } from "~/domain/urls";

import type { ExactMessageId, LinkPreview } from "#shared/types";

interface Props {
  chatId: number;
  messageId: ExactMessageId;
  text: string;
}

const props = defineProps<Props>();

const previews = ref<LinkPreview[] | null>(null);
const reading = ref(false);
const broken = ref<Set<number>>(new Set());

// What stands before the server has answered: the addresses themselves, by their site.
const cards = computed<LinkPreview[]>(
  () =>
    previews.value ??
    messageLinks(props.text).map((url, index) => ({
      index,
      url,
      host: new URL(url).hostname.replace(/^www\./, ""),
      title: null,
      description: null,
      siteName: null,
      image: false
    }))
);

function imagePath(index: number): string {
  return appUrl(`/api/rooms/${props.chatId}/links/${props.messageId}/${index}/image`);
}

async function read(): Promise<void> {
  reading.value = true;

  try {
    previews.value = await $fetch<LinkPreview[]>(`/api/rooms/${props.chatId}/links/${props.messageId}`);
  } catch {
    // An address whose page could not be read keeps its plain card.
  } finally {
    reading.value = false;
  }
}

const list = useTemplateRef<HTMLElement>("list");
let watcher: IntersectionObserver | null = null;

onMounted(() => {
  if (list.value === null) {
    return;
  }

  watcher = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        watcher?.disconnect();
        watcher = null;
        void read();
      }
    },
    { rootMargin: "400px" }
  );
  watcher.observe(list.value);
});

onBeforeUnmount(() => watcher?.disconnect());
</script>
