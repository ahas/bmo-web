<template>
  <!-- What a call returned, under its command in the same block (docs/web.md, 「A tool call」): its first lines always
       standing, the rest a press away, coloured by the chat's own code highlighter in the language the call's target
       names. A search's result is coloured line by line, each by its own path, the path and the number apart. -->
  <div ref="root" class="flex min-w-0 flex-col gap-1 border-t border-default px-2 py-1" data-tool-result>
    <template v-if="look.kind === 'lines'">
      <div v-for="(line, index) in lines" :key="index" class="flex min-w-0 flex-wrap items-baseline">
        <template v-if="line.path !== null">
          <span class="break-all text-(--ansi-blue)">{{ line.path }}</span>
          <span class="text-dimmed">:</span>
          <template v-if="line.number !== null">
            <span class="tabular-nums text-(--ansi-yellow)">{{ line.number }}</span>
            <span class="text-dimmed">:</span>
          </template>
          <div class="markdown-code min-w-0 grow" :data-language="line.word ?? undefined">
            <pre class="break-words whitespace-pre-wrap"><code>{{ line.text }}</code></pre>
          </div>
        </template>
        <pre v-else class="min-w-0 grow break-words whitespace-pre-wrap">{{ line.text }}</pre>
      </div>
    </template>
    <div v-else-if="look.kind === 'language'" class="markdown-code min-w-0" :data-language="look.word">
      <pre class="break-words whitespace-pre-wrap"><code :key="spread ? 'whole' : 'head'">{{ shownText }}</code></pre>
    </div>
    <pre v-else class="min-w-0 break-words whitespace-pre-wrap text-muted">{{ shownText }}</pre>

    <p v-if="props.truncated" class="font-sans text-sm text-dimmed">{{ $t("agents.label.record_ends") }}</p>

    <!-- The one fold a call has: the lines past the first five, and how many they are. -->
    <UButton
      v-if="parts.hiddenCount > 0"
      size="sm"
      color="neutral"
      variant="ghost"
      class="self-start font-sans"
      :icon="spread ? 'i-material-symbols-unfold-less' : 'i-material-symbols-unfold-more'"
      :label="spread ? $t('agents.label.result_less') : $t('agents.label.result_more', { n: countText(parts.hiddenCount) })"
      :aria-expanded="spread"
      @click="spread = !spread"
    />
  </div>
</template>

<script setup lang="ts">
import { colourCode, forgetCode } from "bmo-ui/app/domain/code-colour";
import { useDarkScheme } from "bmo-ui/app/domain/scheme";
import { countText } from "~/domain/numbers";
import { resultParts, searchLines } from "~/domain/tool-view";

import type { ResultLook } from "~/domain/tool-view";

interface Props {
  text: string;
  look: ResultLook;
  // Whether the record itself is short of the result: the writer cut it at its own cap.
  truncated?: boolean;
}

const props = withDefaults(defineProps<Props>(), { truncated: false });

const spread = ref(false);
const parts = computed(() => resultParts(props.text));
const shownText = computed(() => (spread.value || parts.value.hiddenCount === 0 ? props.text.replace(/\n$/, "") : parts.value.shown));
const lines = computed(() => searchLines(shownText.value));

const root = useTemplateRef<HTMLElement>("root");
const dark = useDarkScheme();

// The highlighter colours what stands, once it is on the screen, and again as more of it stands or the theme turns.
async function colour(): Promise<void> {
  await nextTick();

  if (root.value !== null && props.look.kind !== "plain") colourCode(root.value, dark.value);
}

onMounted(() => void colour());
watch([shownText, dark], () => void colour());
onBeforeUnmount(() => {
  if (root.value !== null) forgetCode(root.value);
});
</script>
