<template>
  <!-- The text as it was written, until the renderer is in the browser: this is what the server
       draws and what the browser draws on its first pass, so the two agree and the place is never
       empty. The HTML replaces it once the renderer has arrived, and only ever after cleaning. A
       line stands inside a line, so both of its forms are inline; its plain form lets the browser
       fold its newlines, as the rendered form does. -->
  <component :is="tag" v-if="html === null" v-bind="$attrs" :class="props.kind === 'line' ? '' : 'break-words whitespace-pre-wrap'">{{ props.text }}</component>
  <component :is="tag" v-else ref="shown" v-bind="$attrs" class="markdown" :class="`markdown--${props.kind}`" @click="pressed" @keydown.enter="uncovered" v-html="html" />
</template>

<script setup lang="ts">
import { colourCode, forgetCode } from "bmo-ui/app/domain/code-colour";
import { copyFromPress } from "bmo-ui/app/domain/code-copy";
import { copyText } from "~/domain/copy";
import { drawDiagrams } from "bmo-ui/app/domain/diagram";
import { loadMarkdownRenderer, markdownRenderer } from "~/domain/markdown-load";
import { useDarkScheme } from "bmo-ui/app/domain/scheme";

import type { MarkdownKind } from "~/domain/markdown";

// A text written in markdown, standing as the formatting it was written for. Where a place shows
// such a text, it hands the text here and says what kind of text it is; how that kind is read is
// the renderer's (see domain/markdown).

interface Props {
  text: string;
  kind?: MarkdownKind;
}

// The text stands in one of two forms, so what a caller puts on this component is put on the text
// itself rather than left to fall through a root there is not one of.
defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<Props>(), { kind: "words" });

// The formatted text has been put on the page, with the element that holds it. A place that steers
// by what the renderer drew — the document viewer's table of contents and its two panes — waits for
// this rather than guessing when the renderer arrived.
const emit = defineEmits<{ rendered: [element: HTMLElement] }>();
const shown = useTemplateRef<HTMLElement>("shown");

// A diagram in the text is drawn, and a code block coloured, in the theme the text stands in (see
// domain/diagram, domain/code-colour and domain/scheme).
const dark = useDarkScheme();

const tag = computed(() => (props.kind === "line" ? "span" : "div"));

// The renderer when it had already arrived before this text was drawn — except while the page is
// being hydrated, where the server drew the plain text and the browser has to draw the same.
const { t } = useI18n();
const renderer = shallowRef(useNuxtApp().isHydrating ? null : markdownRenderer());
// A message is drawn as its chat shows it, by a reading that arrives apart from the renderer; until it has, the
// text stands as it was written.
const read = ref(props.kind !== "message" || (renderer.value?.messageReaderLoaded() ?? false));

const html = computed<string | null>(() =>
  renderer.value === null || !read.value ? null : renderer.value.renderMarkdown(t, props.text, props.kind)
);

// A spoiler is uncovered by a press and covered by the next; any other press is a code block's copy button's.
function uncovered(event: Event): boolean {
  const spoiler = event.target instanceof Element ? event.target.closest("[data-spoiler]") : null;

  if (spoiler === null) {
    return false;
  }

  spoiler.toggleAttribute("data-shown");

  return true;
}

function pressed(event: MouseEvent): void {
  if (!uncovered(event)) {
    void copyFromPress(t, event, copyText);
  }
}

watch(
  html,
  async (value) => {
    if (value === null) {
      return;
    }

    await nextTick();

    if (shown.value !== null) {
      emit("rendered", shown.value);
      void drawDiagrams(shown.value, dark.value);
      colourCode(shown.value, dark.value);
    }
  },
  // A text mounted once the renderer is already in the browser — a message arriving in an open
  // room, a stretch read in — has its HTML from the start, so the first one is settled too.
  { flush: "post", immediate: true }
);

// The code blocks of the text being replaced, or leaving with this component, are let go of too.
watch(
  html,
  () => {
    if (shown.value !== null) {
      forgetCode(shown.value);
    }
  },
  { flush: "pre" }
);

onBeforeUnmount(() => {
  if (shown.value !== null) {
    forgetCode(shown.value);
  }
});

// A diagram in the text is drawn, and a code block coloured, again when its theme switches.
watch(dark, (inDark) => {
  if (shown.value !== null) {
    void drawDiagrams(shown.value, inDark);
    colourCode(shown.value, inDark);
  }
});

onMounted(async () => {
  if (renderer.value === null) {
    renderer.value = await loadMarkdownRenderer();
  }

  if (!read.value && renderer.value !== null) {
    // A reading that could not be fetched leaves the text as it was written.
    await renderer.value.loadMessageReader().then(() => (read.value = true), () => undefined);
  }
});
</script>
