<template>
  <!-- The searchers' work keys, each a row of the road table: its road, its account, its tier and the
       model its run starts on, each cell saving through the same roads and tiers the routes tab does. -->
  <div class="flex min-w-0 flex-col">
    <AgentsRouteTable v-if="!read || keys.length > 0" :only="keys" :query="props.query" />
    <p v-else class="px-4 py-4 text-sm text-muted">{{ $t("research.status.no_keys") }}</p>

    <p class="px-4 py-2 text-sm text-muted">{{ $t("research.message.settings_unserved") }}</p>
  </div>
</template>

<script setup lang="ts">
import { emptyFallbackView } from "~/domain/agent-settings";
import { researchKeys } from "~/domain/research";

import type { TierSettingsView } from "#shared/agency";
import type { FallbackView } from "#shared/types";

const props = withDefaults(defineProps<{ query?: string }>(), { query: "" });

// The same reads the road table holds, so the keys are known from what it shows.
const { data: fallback, status: fallbackStatus } = useFetch<FallbackView>("/api/fallback", { key: "fallback", lazy: true, server: false, default: emptyFallbackView });
const { data: tiers } = useFetch<TierSettingsView>("/api/model-tiers", { key: "model-tiers", lazy: true, server: false });

const read = computed(() => fallbackStatus.value === "success" && tiers.value != null);
const keys = computed(() => researchKeys(fallback.value?.profiles ?? [], tiers.value?.assignments ?? []));
</script>
