<template>
  <!-- A short text standing beside a TranslatedText that carries the one line for both (docs/web.md, 「The original,
       and its translation in its place」): its reading is asked as that text's is, and it stands in the original's
       place exactly while `follow` says that text's reading does, so showing the original there puts this back too. -->
  <slot :text="standing"><span>{{ standing }}</span></slot>
</template>

<script setup lang="ts">
import { useFollowedReading } from "~/domain/text-reading";

interface Props {
  text: string;
  // Whether the text this one follows stands as its reading now.
  follow: boolean;
}

const props = defineProps<Props>();

const standing = useFollowedReading(
  () => props.text,
  () => props.follow
);
</script>
