<template>
  <!-- What the settings search found: each result says its section and its row, with the hit
       marked, and a hit only in what the row does not show stands as one line under it. -->
  <div class="flex min-w-0 flex-col py-1">
    <p v-if="searchPhrase(props.query) !== '' && props.hits.length === 0" class="px-3 py-2 text-sm text-muted">{{ $t("screens.status.no_settings_found") }}</p>

    <button
      v-for="(hit, index) in props.hits"
      :key="`${hit.entry.tab}:${hit.entry.id}:${index}`"
      type="button"
      class="flex min-w-0 flex-col items-start gap-1 px-3 py-2 text-start transition-colors hover:bg-elevated active:bg-accented focus-inset"
      @click="emit('go', hit)"
    >
      <span class="flex w-full min-w-0 items-center gap-2 text-sm">
        <SearchText class="min-w-0 flex-1 truncate text-highlighted" :text="hit.entry.label" :query="props.query" />
      </span>
      <span class="flex flex-wrap items-center gap-1">
        <UBadge color="neutral" variant="subtle" size="sm" :label="agentTabLabel($t, hit.entry.tab)" />
      </span>
      <SearchHit class="w-full" :match="hit.match" :query="props.query" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { searchPhrase } from "bmo-ui/shared/search";
import { agentTabLabel } from "~/domain/agent-settings";

import type { SettingsHit } from "~/domain/agent-settings";

interface Props {
  hits: readonly SettingsHit[];
  query: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{ go: [hit: SettingsHit] }>();
</script>
