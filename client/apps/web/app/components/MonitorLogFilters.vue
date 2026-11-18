<!-- The logs tab's filters, at the right end of the monitor's own tab row (docs/web.md, 「Monitor's logs tab」): the
     category, the level and the search. A phone has no room for three in the row, so there they fold into one button
     opening the same three, marked with how many are set. -->
<template>
  <div class="flex min-w-0 items-center gap-2">
    <div class="hidden items-center gap-2 sm:flex">
      <ChoiceSelect
        :model-value="source"
        :items="sources"
        value-key="value"
        :content="{ align: 'end' }"
        class="w-44"
        size="sm"
        color="neutral"
        variant="subtle"
        :aria-label="$t('monitor_logs.label.category')"
        @update:model-value="setSource"
      />
      <ChoiceSelect
        :model-value="level"
        :items="levels"
        value-key="value"
        :content="{ align: 'end' }"
        class="w-28"
        size="sm"
        color="neutral"
        variant="subtle"
        :aria-label="$t('monitor_logs.label.level')"
        @update:model-value="setLevel"
      />
      <UInput
        :model-value="words"
        class="w-48"
        size="sm"
        color="neutral"
        variant="subtle"
        icon="i-material-symbols-search"
        :placeholder="$t('monitor_logs.label.search')"
        :aria-label="$t('monitor_logs.label.search')"
        @update:model-value="setWords"
      />
    </div>

    <UPopover :content="{ align: 'end' }" :ui="{ content: 'flex w-64 flex-col gap-2 p-3' }">
      <UButton
        class="sm:hidden"
        size="sm"
        color="neutral"
        variant="subtle"
        icon="i-material-symbols-filter-list"
        :label="count > 0 ? $t('monitor_logs.label.filter_count', { n: count }) : $t('monitor_logs.label.filter')"
        :aria-label="$t('monitor_logs.aria.filters')"
      />

      <template #content>
        <ChoiceSelect
          :model-value="source"
          :items="sources"
          value-key="value"
          :content="{ align: 'start' }"
          class="w-full"
          size="sm"
          color="neutral"
          variant="subtle"
          :aria-label="$t('monitor_logs.label.category')"
          @update:model-value="setSource"
        />
        <ChoiceSelect
          :model-value="level"
          :items="levels"
          value-key="value"
          :content="{ align: 'start' }"
          class="w-full"
          size="sm"
          color="neutral"
          variant="subtle"
          :aria-label="$t('monitor_logs.label.level')"
          @update:model-value="setLevel"
        />
        <UInput
          :model-value="words"
          class="w-full"
          size="sm"
          color="neutral"
          variant="subtle"
          icon="i-material-symbols-search"
          :placeholder="$t('monitor_logs.label.search')"
          :aria-label="$t('monitor_logs.label.search')"
          @update:model-value="setWords"
        />
      </template>
    </UPopover>
  </div>
</template>

<script setup lang="ts">
import { ALL_CHOICE, levelChoices, setFilterCount, sourceChoices, sourceFilter, sourceValue, useMonitorLogFilter } from "~/domain/monitor-logs";
import { isLogLevel, MONITOR_LOG_SOURCES_URL } from "#shared/monitor-logs";

import type { LogSources } from "#shared/monitor-logs";

const { t } = useI18n();
const { filter, change } = useMonitorLogFilter();

// The categories and the servers' units are read once the tab stands; until they come, every category and the
// servers' category stand alone.
const { data } = useFetch<LogSources>(MONITOR_LOG_SOURCES_URL, { server: false });

const sources = computed(() => sourceChoices(t, data.value ?? null, filter.value));
const source = computed(() => sourceValue(filter.value));
const levels = computed(() => levelChoices(t));
const level = computed(() => filter.value.level ?? ALL_CHOICE);
const count = computed(() => setFilterCount(filter.value));

// What is typed stands at once; the address, and the read it starts, follow a moment after the typing stops.
const words = ref(filter.value.query);

watch(
  () => filter.value.query,
  (query) => {
    if (query !== words.value) words.value = query;
  }
);

const WORDS_SETTLE_MS = 300;
let wordsTimer: ReturnType<typeof setTimeout> | null = null;

function setWords(value: string | number): void {
  words.value = String(value);

  if (wordsTimer !== null) clearTimeout(wordsTimer);
  wordsTimer = setTimeout(() => {
    wordsTimer = null;
    change({ query: words.value });
  }, WORDS_SETTLE_MS);
}

onBeforeUnmount(() => {
  if (wordsTimer !== null) clearTimeout(wordsTimer);
});

function setSource(value: unknown): void {
  if (typeof value === "string") change(sourceFilter(value));
}

function setLevel(value: unknown): void {
  change({ level: isLogLevel(value) ? value : null });
}
</script>
