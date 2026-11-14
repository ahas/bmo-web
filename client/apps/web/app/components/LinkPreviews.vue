<template>
  <!-- The pages a message's addresses lead to, a card each under the words: the page's picture, the
       site, the title and what the page says of itself. A card is a link out of this console and
       opens in a tab of its own. The cards are asked for only once the message comes near the
       screen, and an address whose page said nothing stands as its site and address alone. -->
  <ul ref="list" class="mt-2 flex flex-col gap-2">
    <li v-for="card in cards" :key="card.url">
      <a
        :href="card.url"
        target="_blank"
        rel="noopener noreferrer"
        data-link-preview
        class="group flex max-w-full overflow-hidden rounded-lg border border-default bg-default transition-colors hover:bg-elevated active:bg-accented"
        @click.stop
      >
        <span class="w-1 shrink-0 bg-primary" aria-hidden="true" />
        <span class="flex min-w-0 flex-1 flex-col gap-1 px-3 py-2">
          <span class="truncate text-sm text-muted">{{ card.siteName ?? card.host }}</span>
          <span v-if="card.title !== null" class="line-clamp-2 text-sm font-medium break-words text-highlighted group-hover:underline">{{ card.title }}</span>
          <span v-if="card.description !== null" class="line-clamp-3 text-sm break-words text-toned">{{ card.description }}</span>
          <img
            v-if="card.image && !broken.has(card.index)"
            :src="imagePath(card.index)"
            alt=""
            loading="lazy"
            class="mt-1 max-h-48 w-full rounded-md border border-default object-cover"
            @error="broken = new Set([...broken, card.index])"
          >
          <span class="sr-only">{{ $t("common.aria.opens_new_tab") }}</span>
        </span>
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
  try {
    previews.value = await $fetch<LinkPreview[]>(`/api/rooms/${props.chatId}/links/${props.messageId}`);
  } catch {
    // An address whose page could not be read keeps its plain card.
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
