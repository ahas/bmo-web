<template>
  <!-- A short text standing beside a TranslatedText that carries the one line for both (docs/web.md, 「The original,
       and its translation in its place」): its reading is asked as that text's is, and it stands in the original's
       place exactly while `follow` says that text's reading does, so 원문 보기 there puts this back too. -->
  <slot :text="standing"><span>{{ standing }}</span></slot>
</template>

<script setup lang="ts">
import { readerLanguage, useAskedReading, useAutoTranslate, wantsReading } from "~/domain/text-reading";

interface Props {
  text: string;
  // Whether the text this one follows stands as its reading now.
  follow: boolean;
}

const props = defineProps<Props>();

const { locale } = useI18n();
const language = computed(() => readerLanguage(locale.value));
const wanted = computed(() => wantsReading(props.text, language.value));
const { reading, ask } = useAskedReading(
  () => props.text,
  () => language.value
);
const auto = useAutoTranslate();

// Asked as the text it follows is: as it opens where this browser translates on its own, else once that text's
// reading is pressed for.
watch(
  [() => props.text, auto, () => props.follow],
  () => {
    if (wanted.value && (auto.value || props.follow) && reading.value.kind === "none") ask();
  },
  { immediate: true }
);

const standing = computed(() => (props.follow && reading.value.kind === "read" ? reading.value.text : props.text));
</script>
