<template>
  <!-- The record's stickers, in the input box (docs/web.md, the room screen's input box): a sticker mark beside the
       clip opens the set the receiver keeps, each emoji a button, and pressing one sends it into the room as the
       reader's own message. The deployment's set is the receiver's, so the console holds no sticker list of its own
       and reads it when the set is first opened. -->
  <UPopover v-model:open="open" :content="{ side: 'top', align: 'start' }">
    <UTooltip :text="$t('room.action.sticker')">
      <UButton
        icon="i-material-symbols-sticky-note-2-outline"
        color="neutral"
        variant="ghost"
        data-stickers-button
        :aria-label="$t('room.action.sticker')"
        :disabled="props.disabled"
      />
    </UTooltip>

    <template #content>
      <div class="flex w-56 flex-col gap-2 p-2">
        <ContentSkeleton v-if="stickers === null && failed === ''" :rows="2" listClass="flex flex-col gap-1" :label="$t('room.status.stickers_loading')">
          <SkeletonBar class="h-8 w-full" />
        </ContentSkeleton>

        <template v-else-if="stickers !== null">
          <p v-if="stickers.length === 0" class="px-1 text-sm text-dimmed">{{ $t("room.status.sticker_none") }}</p>

          <div v-else class="grid grid-cols-5 gap-1">
            <UTooltip v-for="emoji in stickers" :key="emoji" :text="$t('room.aria.sticker_send', { emoji })">
              <UButton
                :label="emoji"
                color="neutral"
                variant="ghost"
                size="xl"
                class="justify-center text-2xl"
                :aria-label="$t('room.aria.sticker_send', { emoji })"
                :disabled="sending !== null"
                :loading="sending === emoji"
                @click="send(emoji)"
              />
            </UTooltip>
          </div>
        </template>

        <p v-if="failed !== ''" role="alert" class="break-words px-1 text-sm text-error">{{ failed }}</p>
      </div>
    </template>
  </UPopover>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import { readStickers, sendSticker } from "~/domain/message-acts";

interface Props {
  chatId: number;
  // Whether the room takes words and sends at all: a room whose bot is not reachable offers none.
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), { disabled: false });

const { t } = useI18n();

const open = ref(false);
const stickers = ref<string[] | null>(null);
const sending = ref<string | null>(null);
const failed = ref("");

// The set is asked for the first time it is opened, and kept while the screen stands.
watch(open, (now) => {
  if (now) void read();
});

async function read(): Promise<void> {
  if (stickers.value !== null) return;

  try {
    stickers.value = await readStickers(props.chatId);
  } catch (error) {
    failed.value = failureText(error, t("room.error.stickers_read_failed"));
  }
}

// One sticker sent: the set closes on the record's answer, and the message it became arrives through the room's own
// news like any other message.
async function send(emoji: string): Promise<void> {
  if (sending.value !== null) return;

  sending.value = emoji;
  failed.value = "";

  try {
    await sendSticker(props.chatId, emoji);
    open.value = false;
  } catch (error) {
    failed.value = failureText(error, t("room.error.sticker_failed"));
  } finally {
    sending.value = null;
  }
}
</script>
