<template>
  <!-- A sticker kept as the message's picture stands in the sticker's fixed box, drawn whole inside it, so its row is
       its full height before the picture has loaded. A moving WebP or GIF plays over and over as the browser plays a
       picture; one that cannot be read stands as its words (docs/web.md, the room screen's wordless messages). -->
  <div data-sticker :class="failed ? '' : 'size-(--chat-sticker) shrink-0'">
    <img v-if="!failed" :src="props.src" :alt="props.alt" class="size-full object-contain" loading="lazy" @error="failed = true" />
    <span v-else class="text-sm text-muted">{{ props.alt }}</span>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ src: string; alt: string }>();
const failed = ref(false);

watch(
  () => props.src,
  () => {
    failed.value = false;
  }
);
</script>
