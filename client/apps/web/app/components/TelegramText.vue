<template>
  <!-- A message written in markdown stands as its chat shows it, unless an expression sits inside it or the
       metadata carried formatting: an expression and every format are placed by their offset into the text as
       written, and formatting taken out of the text would move every offset after it, so such a bubble reads
       its formatting off the entities instead (docs/web.md, 「Telegram formatting」). A web address in the
       words opens in a new tab, as it does in the markdown. -->
  <MarkdownText v-if="asMarkdown" :text="text" kind="message" />
  <p v-else-if="!blocked" class="whitespace-pre-wrap"><TelegramFragment v-for="(fragment, at) in fragments" :key="at" :fragment="fragment" :chat-id="chatId" :message-id="messageId" :state="open" /></p>
  <div v-else class="tg-message whitespace-pre-wrap"><TelegramFragment v-for="(fragment, at) in fragments" :key="at" :fragment="fragment" :chat-id="chatId" :message-id="messageId" :state="open" /></div>
</template>
<script setup lang="ts">
import { telegramFragments } from "../domain/telegram-fragments";

import type { TelegramExpression, TelegramFormat } from "#shared/types";

const props = defineProps<{ text: string; expressions?: TelegramExpression[]; formats?: TelegramFormat[]; markdown?: boolean; chatId: number; messageId: number }>();

// The words as the formatting sends them: one plain run where no entity stands, fragments nested as they nest.
const fragments = computed(() => telegramFragments(props.text, props.formats ?? [], props.expressions ?? []));
// Markdown draws the bubble when no custom emoji needs the words as they were; where an entity carries
// formatting, the bubble reads it off the entities instead, over the words as written.
const asMarkdown = computed(() => props.markdown === true && (props.formats?.length ?? 0) === 0 && fragments.value.every((one) => one.kind !== "emoji"));
// A block among the fragments — a quote or a pre — stands the whole bubble as a block list rather than one line.
const blocked = computed(() => fragments.value.some((one) => one.kind === "pre" || one.kind === "quote"));
// The slots the reader has opened: spoilers uncovered and expandable quotes unfolded, by their slot in this message.
const open = reactive(new Set<number>());
</script>

<style>
/* Inline code, a pre block and a quote inside a bubble stand on surfaces stepped from the bubble's own
   ground, as every surface inside one does (docs/web.md, 「Telegram formatting」, 「The conversation's
   measures」). */
.tg-code {
  padding: 0.1em 0.35em;
  border-radius: var(--ui-radius);
  background-color: var(--ui-bg-elevated);
  font-family: var(--font-mono);
  font-size: max(0.9em, 0.875rem);
  color: var(--ui-text-highlighted);
}

.tg-pre {
  margin: 0.25em 0;
  padding: 0.4em 0.7em;
  border-radius: var(--ui-radius);
  background-color: var(--ui-bg-elevated);
  font-family: var(--font-mono);
  font-size: max(0.9em, 0.875rem);
  color: var(--ui-text-highlighted);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* A pre whose fence named a real language is code, which keeps its lines and scrolls sideways, as every
   other code block of the console does. */
.tg-pre[data-language]:not([data-language="text" i], [data-language="txt" i], [data-language="plaintext" i], [data-language="monospace" i], [data-language="md" i], [data-language="markdown" i]) {
  white-space: pre;
  overflow-wrap: normal;
  overflow-x: auto;
}

/* A quoted block under a leading rule, as the console already draws every other quote. */
.tg-quote {
  position: relative;
  margin: 0.25em 0;
  padding: 0.15em 0.5em 0.15em 0.9em;
  border-inline-start: 2px solid var(--ui-border-accented);
  color: var(--ui-text-muted);
}

/* An expandable quote stands closed to a few lines until pressed, and a press opens it whole (docs/web.md,
   「Telegram formatting」); it and its spoilers take their ground and its changes from the bubble's own
   surfaces. */
.tg-quote--press {
  cursor: pointer;
  border-radius: var(--ui-radius);
}

.tg-quote--press:hover {
  background-color: var(--ui-bg-elevated);
}

.tg-quote--press:active {
  background-color: var(--ui-bg-accented);
}

.tg-quote--closed {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  overflow: hidden;
}

/* The chevron that says a quote may fold rides in its corner, drawn in the quote's own ink. */
.tg-quote-mark {
  position: absolute;
  inset-inline-end: 4px;
  bottom: 4px;
  color: var(--ui-text-muted);
}

/* A spoiler stands on a ground of the bubble's own surface, its words blurred behind it until pressed; the press
   uncovers them and lets them be selected again. The ground stays under the uncovered words too, as the markdown
   spoiler keeps it, so the press that covers it again has a place to land and a colour of its own. */
.tg-spoiler {
  cursor: pointer;
  border-radius: var(--ui-radius);
  background-color: var(--ui-bg-elevated);
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}

.tg-spoiler-closed .tg-spoiler-words {
  padding: 0 0.25em;
  filter: blur(6px);
  user-select: none;
  pointer-events: none;
}

.tg-spoiler:hover {
  background-color: var(--ui-bg-accented);
}

.tg-spoiler:active {
  background-color: var(--ui-bg-accented);
}
</style>
