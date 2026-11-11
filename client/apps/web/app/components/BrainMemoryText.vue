<template>
  <!-- A memory's words as the console reads them (docs/web.md, the room screen's brain chip, and 「The original, and
       its translation in its place」): the text as the brain keeps it, read in the reader's language in its own place
       a press away. -->
  <TranslatedText :text="props.text">
    <template #default="{ text: standing }">
      <pre data-brain-read-text class="max-h-96 overflow-y-auto rounded-md bg-elevated p-3 font-sans text-sm whitespace-pre-wrap wrap-anywhere text-default">{{ standing }}</pre>
    </template>
  </TranslatedText>
</template>

<script setup lang="ts">
interface Props {
  // The memory's words as the brain keeps them.
  text: string;
}

const props = defineProps<Props>();
</script>
