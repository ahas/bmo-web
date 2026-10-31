<template>
  <!-- Where a research item came from, in one line (docs/web.md, 「Research screen」): a scan's source, an ask's words,
       or the research a follow-up follows from, linked to its page in a new tab, with the words it was asked with. -->
  <p v-if="line !== null" class="flex min-w-0 items-start gap-1 text-sm text-muted">
    <UIcon :name="props.origin.kind === 'follow-up' ? 'i-material-symbols-subdirectory-arrow-right' : 'i-material-symbols-info-outline'" class="mt-0.5 size-4 shrink-0" />
    <span class="min-w-0 break-words">
      <a v-if="line.link !== null" :href="line.link" target="_blank" rel="noopener noreferrer" class="text-primary underline-offset-2 hover:underline">
        {{ line.text }}<span class="sr-only"> {{ $t("common.aria.opens_new_tab") }}</span>
      </a>
      <template v-else>{{ line.text }}</template>
      <template v-if="line.because !== null"> · {{ line.because }}</template>
    </span>
  </p>
</template>

<script setup lang="ts">
import { originLine } from "~/domain/research";

import type { ResearchOrigin } from "#shared/research";

const props = defineProps<{
  origin: ResearchOrigin;
}>();

const { t } = useI18n();

const line = computed(() => originLine(t, props.origin));
</script>
