<template>
  <!-- A message's reactions as the messenger draws them (docs/web.md, 「What was done to a message」): each emoji once,
       with its reactors' faces while they are few and how many once they are more, named in its tooltip; the reader's
       own in the accent's wash. Pressing one puts the same reaction on the message, or takes the reader's own off. -->
  <span data-reactions class="flex min-w-0 flex-wrap items-center gap-1">
    <HintTip v-for="reaction in props.reactions" :key="reaction.emoji" :text="reaction.who.join(', ')" class="inline-flex">
      <button
        type="button"
        class="inline-flex h-6 items-center gap-1 rounded-full ps-1.5 pe-1 text-sm tabular-nums transition-colors"
        :class="reaction.mine ? 'bg-primary/15 text-primary hover:bg-primary/25' : 'bg-current/10 text-muted hover:bg-current/15'"
        :data-reaction="reaction.emoji"
        :aria-pressed="reaction.mine"
        :aria-label="$t('room.aria.reaction', { emoji: reaction.emoji, n: countText(reaction.count) })"
        @click.stop="emit('react', reaction.emoji)"
      >
        <span aria-hidden="true">{{ reaction.emoji }}</span>
        <span v-if="reaction.faces.length <= REACTION_FACES_MOST" data-reaction-faces class="flex -space-x-1.5" aria-hidden="true">
          <UAvatar v-for="(face, at) in reaction.faces" :key="at" v-bind="face" size="3xs" class="ring-1 ring-default" />
        </span>
        <span v-else class="pe-0.5" aria-hidden="true">{{ countText(reaction.count) }}</span>
      </button>
    </HintTip>
  </span>
</template>

<script setup lang="ts">
import { countText } from "~/domain/numbers";
import { REACTION_FACES_MOST } from "~/domain/room";

import type { ReactionView } from "~/domain/room";

const props = defineProps<{ reactions: ReactionView[] }>();
const emit = defineEmits<{ (e: "react", emoji: string): void }>();
</script>
