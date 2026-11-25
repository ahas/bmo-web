<template>
  <!-- The reader's own BMO beside the room (docs/web.md, the room screen's overlay): the person's private
       conversation with their own supervisor, opened over the room without leaving it. What is said here
       stands in that private room alone, so it never reaches the room or its minutes. -->
  <USlideover v-model:open="open" :title="overlay?.label ?? $t('overlay.title.panel')" :description="props.title">
    <template #body>
      <div class="flex h-full min-h-0 flex-col gap-3">
        <ContentSkeleton v-if="loading && overlay === null" :rows="3" listClass="flex flex-col gap-2" :label="$t('overlay.status.loading')">
          <div class="flex min-h-5 items-center"><SkeletonBar class="h-4 w-48" /></div>
        </ContentSkeleton>
        <p v-else-if="failed" role="alert" class="text-sm text-error">{{ $t("overlay.error.load_failed") }}</p>
        <p v-else-if="overlay !== null && overlay.room === null" class="text-sm text-dimmed">{{ $t("overlay.label.none") }}</p>

        <template v-else-if="overlay !== null">
          <div ref="feed" class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto" data-overlay-feed>
            <p v-if="messages.length === 0" class="text-sm text-dimmed">{{ $t("overlay.label.empty") }}</p>
            <div v-for="message in messages" :key="message.messageId" class="flex min-w-0 flex-col" :class="message.agent === true ? 'items-start' : 'items-end'">
              <span class="text-xs text-muted">{{ message.senderName }}</span>
              <p class="max-w-[85%] rounded-md px-3 py-2 text-sm break-words whitespace-pre-wrap" :class="message.agent === true ? 'bg-elevated text-highlighted' : 'bg-primary/10 text-highlighted'">{{ message.text }}</p>
            </div>
          </div>

          <ULink v-if="overlay.supervisor !== null" :to="`/agents/${encodeURIComponent(overlay.supervisor)}`" class="text-sm text-muted">{{ $t("overlay.action.log") }}</ULink>
          <form class="flex min-w-0 items-end gap-2" @submit.prevent="send">
            <UTextarea v-model="text" :rows="1" autoresize :maxrows="6" class="min-w-0 flex-1" :placeholder="$t('overlay.label.input')" :aria-label="$t('overlay.label.input')" @keydown.enter.exact.prevent="send" />
            <UButton type="submit" icon="i-material-symbols-send-outline" :aria-label="$t('overlay.action.send')" :loading="sending" :disabled="text.trim() === ''" />
          </form>
          <p v-if="sendFailed !== ''" role="alert" class="text-sm text-error">{{ sendFailed }}</p>
        </template>
      </div>
    </template>
  </USlideover>
</template>

<script setup lang="ts">
import { useBotEvents } from "~/domain/events";

import type { ArchivedMessage, MessagePage, RoomOverlay } from "#shared/types";

interface Props {
  chatId: number;
  title: string;
}

const props = defineProps<Props>();

const open = defineModel<boolean>("open", { required: true });

const { t } = useI18n();

const overlay = ref<RoomOverlay | null>(null);
const loading = ref(false);
const failed = ref(false);
const messages = ref<ArchivedMessage[]>([]);
const text = ref("");
const sending = ref(false);
const sendFailed = ref("");
const feed = ref<HTMLElement | null>(null);

async function toFoot(): Promise<void> {
  await nextTick();
  feed.value?.scrollTo({ top: feed.value.scrollHeight });
}

async function readMessages(): Promise<void> {
  const room = overlay.value?.room ?? null;

  if (room === null) return;

  const page = await $fetch<MessagePage>(`/api/rooms/${room}/messages`, { query: { limit: 50 } });

  messages.value = page.messages.filter((message) => message.text.trim() !== "");
  await toFoot();
}

async function read(): Promise<void> {
  loading.value = true;
  failed.value = false;

  try {
    overlay.value = await $fetch<RoomOverlay>(`/api/rooms/${props.chatId}/overlay`);
    await readMessages();
  } catch {
    failed.value = true;
  } finally {
    loading.value = false;
  }
}

async function send(): Promise<void> {
  const room = overlay.value?.room ?? null;
  const words = text.value.trim();

  if (room === null || words === "" || sending.value) return;

  sending.value = true;
  sendFailed.value = "";

  try {
    await $fetch(`/api/rooms/${room}/say`, { method: "POST", body: { text: words, key: crypto.randomUUID() } });
    text.value = "";
    await readMessages();
  } catch (error) {
    const message = (error as { data?: { message?: string } }).data?.message;

    sendFailed.value = typeof message === "string" && message !== "" ? message : t("overlay.error.send_failed");
  } finally {
    sending.value = false;
  }
}

// What the private room says while the panel stands open is read again as it comes.
useBotEvents((event) => {
  const room = overlay.value?.room ?? null;

  if (!open.value || room === null || event.chatId !== room) return;
  if (event.type === "message" || event.type === "sent") void readMessages();
});

watch(open, (standing) => {
  if (standing) void read();
});
</script>
