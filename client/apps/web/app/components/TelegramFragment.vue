<template>
  <!-- The fragments a message's formatting stands (docs/web.md, 「Telegram formatting」), nested as its
       entities nested. A spoiler holds its words under a blur until pressed; a quote with its rule, an
       expandable one closed to a few lines until pressed; a link opens in a new tab, and an address a run
       carries on its own opens beside it. -->
  <span v-if="props.fragment.kind === 'words'" :class="wordClasses"><template v-for="(part, at) in linked" :key="at"><a v-if="part.href !== null" :href="part.href" target="_blank" rel="noopener noreferrer" class="break-all text-primary underline underline-offset-2 hover:text-primary/80">{{ part.text }}</a><template v-else>{{ part.text }}</template></template></span>
  <TelegramAsset v-else-if="props.fragment.kind === 'emoji' && props.fragment.attachment !== undefined" :attachment="props.fragment.attachment" :chat-id="props.chatId" :message-id="props.messageId" :fallback="props.fragment.text" inline />
  <pre v-else-if="props.fragment.kind === 'pre'" class="tg-pre" :data-language="props.fragment.language ?? 'monospace'">{{ props.fragment.text }}</pre>
  <span v-else-if="props.fragment.kind === 'spoiler'" class="tg-spoiler" :class="{ 'tg-spoiler-closed': !open }" role="button" tabindex="0" :aria-pressed="open" :aria-label="open ? undefined : t('room.action.spoiler_show')" @click.stop="toggle" @keydown.enter.prevent="toggle"><span class="tg-spoiler-words" :aria-hidden="open ? undefined : 'true'"><TelegramFragment v-for="(child, at) in props.fragment.children ?? []" :key="at" :fragment="child" :chat-id="props.chatId" :message-id="props.messageId" :state="props.state" literal /></span></span>
  <a v-else-if="props.fragment.kind === 'link'" :href="props.fragment.url" target="_blank" rel="noopener noreferrer" class="break-all text-primary underline underline-offset-2 hover:text-primary/80"><TelegramFragment v-for="(child, at) in props.fragment.children ?? []" :key="at" :fragment="child" :chat-id="props.chatId" :message-id="props.messageId" :state="props.state" literal /></a>
  <blockquote v-else :class="quoteClasses" :role="props.fragment.expandable === true ? 'button' : undefined" :tabindex="props.fragment.expandable === true ? 0 : undefined" :aria-expanded="props.fragment.expandable === true ? open : undefined" :aria-label="props.fragment.expandable === true ? t(open ? 'room.action.quote_collapse' : 'room.action.quote_expand') : undefined" @click="pressQuote" @keydown.enter.prevent="pressQuote">
    <TelegramFragment v-for="(child, at) in props.fragment.children ?? []" :key="at" :fragment="child" :chat-id="props.chatId" :message-id="props.messageId" :state="props.state" />
    <UIcon v-if="props.fragment.expandable === true" :name="open ? 'i-material-symbols-expand-less-rounded' : 'i-material-symbols-expand-more-rounded'" class="tg-quote-mark size-4" aria-hidden="true" />
  </blockquote>
</template>
<script setup lang="ts">
import { linkParts } from "#shared/links";

import type { ExactMessageId } from "#shared/types";
import type { TelegramFragment } from "../domain/telegram-fragments";

const props = defineProps<{ fragment: TelegramFragment; chatId: number; messageId: ExactMessageId; state: Set<number>; literal?: boolean }>();
const { t } = useI18n();

// Whether this spoiler stands uncovered, or this expandable quote open, in the slots the message opened.
const open = computed(() => props.fragment.slot !== undefined && props.state.has(props.fragment.slot));

function toggle(): void {
  if (props.fragment.slot === undefined) return;

  if (props.state.has(props.fragment.slot)) props.state.delete(props.fragment.slot);
  else props.state.add(props.fragment.slot);
}

// A press on a quote that can fold opens it, and opens it again back to its few lines. A press on a link
// inside one is the link's own.
function pressQuote(event: MouseEvent | KeyboardEvent): void {
  if (props.fragment.expandable !== true) return;

  if (event instanceof MouseEvent && event.target instanceof Element && event.target.closest("a") !== null) return;

  toggle();
}

const wordClasses = computed(() => {
  const fragment = props.fragment;

  return [
    fragment.bold === true ? "font-semibold text-highlighted" : "",
    fragment.italic === true ? "italic" : "",
    fragment.underline === true ? "underline" : "",
    fragment.strike === true ? "line-through" : "",
    fragment.code === true ? "tg-code" : ""
  ];
});

// A words run of its own carries the addresses it stands on: inside code, a spoiler or a link the words are
// what was written, and an address is no link of its own.
const linked = computed(() => (props.literal === true || props.fragment.code === true ? [{ text: props.fragment.text, href: null }] : linkParts(props.fragment.text)));

const quoteClasses = computed(() => [
  "tg-quote",
  props.fragment.expandable === true ? "tg-quote--press" : "",
  props.fragment.expandable === true && !open.value ? "tg-quote--closed" : ""
]);
</script>
