<template>
  <!-- A message written in markdown stands as its chat shows it, unless an expression sits inside it:
       an expression is placed by its offset into the text as it was written, and formatting taken
       out of the text would move every offset after it. A web address in the words opens in a new
       tab, as it does in the markdown. -->
  <MarkdownText v-if="props.markdown && parts.every((part) => !part.attachment)" :text="text" kind="message" />
  <p v-else class="whitespace-pre-wrap"><template v-for="(part, index) in parts" :key="index"><TelegramAsset v-if="part.attachment" :attachment="part.attachment" :chat-id="chatId" :message-id="messageId" :fallback="part.text" inline /><template v-else><template v-for="(piece, at) in linkParts(part.text)" :key="at"><a v-if="piece.href !== null" :href="piece.href" target="_blank" rel="noopener noreferrer" class="break-all text-primary underline underline-offset-2 hover:text-primary/80">{{ piece.text }}</a><template v-else>{{ piece.text }}</template></template></template></template></p>
</template>
<script setup lang="ts">
import { linkParts } from "#shared/links";

import { expressionParts } from "../domain/expressions";
import type { TelegramExpression } from "#shared/types";
const props = defineProps<{ text: string; expressions?: TelegramExpression[]; markdown?: boolean; chatId: number; messageId: number }>();
const parts = computed(() => expressionParts(props.text, props.expressions ?? []));
</script>
