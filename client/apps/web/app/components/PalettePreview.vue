<template>
  <!-- A short conversation in one palette and one mode, drawn by the room screen's own runs and
       bubbles (docs/web.md, 「Settings」): two of the reader's own and two of the chat agent's, carrying a time and
       send check, a link, a short code block, a chip and a passing verdict mark. The box states
       the palette's colours and the mode's class on itself, so everything inside reads them as the
       page reads its own, whatever mode the page stands in; the theme's colours are the page's. It
       is a picture of the colours: nothing in it is pressed, opens a menu or sends. -->
  <div
    data-palette-preview
    :class="props.scheme"
    :style="tokens"
    class="rounded-lg bg-default px-4 py-3 text-default ring ring-default"
    inert
  >
    <div class="flex flex-col">
      <RoomSenderRun v-for="run in runs" :key="run.key" :side="run.side" :sender-name="run.senderName" :avatar="run.avatar" :selecting="false">
        <RoomMessage
          v-for="(item, at) in run.rows"
          :key="item.key"
          :item="item"
          :place="runPlace(at === 0, at === run.rows.length - 1)"
          :chat-id="0"
          :selecting="false"
          :selected="false"
          :flashed="false"
          :roving="false"
        />
      </RoomSenderRun>
    </div>
  </div>
</template>

<script setup lang="ts">
import { paletteTokens } from "bmo-ui/shared/palettes";

import { archivedRows, runPlace, senderRuns } from "~/domain/room";
import { provideBoxScheme } from "bmo-ui/app/domain/scheme";

import type { ArchivedMessage, Judgement } from "#shared/types";
import type { Palette } from "bmo-ui/shared/palettes";
import type { Scheme } from "bmo-ui/shared/themes";

interface Props {
  palette: Palette;
  scheme: Scheme;
  // The reader's own name, which their bubbles carry.
  readerName: string;
}

const props = defineProps<Props>();
const { t } = useI18n();

provideBoxScheme(toRef(() => props.scheme));

const tokens = computed(() => paletteTokens(props.palette));

// The reader and the chat agent, by numbers of the preview's own; the reader's are the ones on the right.
const READER = 1;
const AGENT = 2;
// One minute apart, so each message is a run of its own and every bubble wears its tail.
const START = Math.floor(Date.UTC(2026, 0, 1, 10, 2) / 1000);

const messages = computed<ArchivedMessage[]>(() => {
  const said = (messageId: number, senderId: number, text: string): ArchivedMessage => ({
    chatId: 0,
    messageId,
    exactId: String(messageId),
    senderId,
    senderName: senderId === READER ? props.readerName : t("common.label.speaker_bmo"),
    sentAt: START + messageId * 60,
    text,
    imagePath: null,
    replyToMessageId: null,
    agent: senderId === AGENT
  });

  return [
    said(1, READER, t("account.message.preview_ask")),
    said(2, AGENT, t("account.message.preview_answer")),
    said(3, READER, t("account.message.preview_thanks")),
    {
      ...said(4, AGENT, t("account.message.preview_code")),
      spend: { inputTokens: 1_840, outputTokens: 212, cacheReadTokens: 0, cacheWriteTokens: 0, measured: 1, unmeasured: 0, roads: [], context: null }
    }
  ];
});

// The answer's verdict: one that passed, so the mark stands in its passing colour.
const judgements = computed(() => new Map<number, Judgement[]>([[4, [{ id: 1, chatId: 0, messageId: 4, stage: "chat", verdict: "PASS", detail: null, createdAt: START + 240 }]]]));

const runs = computed(() => senderRuns(archivedRows(messages.value, judgements.value, () => "", new Map(), [READER]), "preview"));
</script>
