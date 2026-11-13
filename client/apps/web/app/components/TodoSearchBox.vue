<template>
  <!-- Looking for one row among all of them. It reaches the archive rather than the rows on the screen, so the queue
       and the requests waiting on him are searched along with every finished item, and it matches what a row shows
       as well as what the item holds. -->
  <div class="border-b border-default px-3 py-2">
    <UInput
      v-model="text"
      size="sm"
      class="w-full"
      icon="i-material-symbols-search"
      :placeholder="$t('todo.placeholder.search')"
      :aria-label="$t('todo.aria.search')"
      :maxlength="TODO_SEARCH_LIMIT"
      :loading="reading && text.trim() !== ''"
    >
      <template v-if="text !== ''" #trailing>
        <UTooltip :text="$t('todo.action.clear_search')">
          <UButton
            icon="i-material-symbols-close"
            color="neutral"
            variant="ghost"
            size="sm"
            :aria-label="$t('todo.action.clear_search')"
            @click="text = ''"
          />
        </UTooltip>
      </template>
    </UInput>

    <p v-if="tally !== null" class="mt-1 px-1 text-sm text-muted">{{ tally }}</p>
  </div>
</template>

<script setup lang="ts">
// The TODO panel's search box. What is typed stands here alone and goes to the panel as the phrase, so a keystroke
// draws the box and nothing of the list (docs/web.md, the TODO panel's section).
import { TODO_SEARCH_LIMIT } from "#shared/config";

defineProps<{
  // Whether the board is being read, which the box says while there is a phrase.
  reading: boolean;
  // How many rows the search and the conditions found, once the answer stands; none while nothing narrows the list.
  tally: string | null;
}>();

const emit = defineEmits<{
  search: [text: string];
}>();

const text = ref("");

watch(text, (phrase) => emit("search", phrase));
</script>
