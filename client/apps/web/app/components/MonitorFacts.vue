<!-- A card of facts about one machine (docs/web.md, 「Monitor screen」): its title, whatever the
     card carries above its facts, then the facts, labels in one column beside their values, or over
     them on a phone — two such columns where the card is wide and three where it is wider. A node's
     connection card and every machine's system card are this card, so the two stand in one form side
     by side. -->
<template>
  <MonitorCard :title="title">
    <template v-if="$slots.actions" #actions>
      <slot name="actions" />
    </template>

    <slot />

    <SkeletonStatus v-if="loading" as="div" :label="loadingLabel" :class="GRID">
      <template v-for="n in rows" :key="n">
        <SkeletonBar class="h-5 w-16" />
        <SkeletonBar class="h-5 w-40 max-w-full" />
      </template>
    </SkeletonStatus>

    <dl v-else-if="facts.length > 0" class="text-sm" :class="GRID">
      <template v-for="fact in facts" :key="fact.label">
        <dt class="whitespace-nowrap text-muted">{{ fact.label }}</dt>
        <dd class="min-w-0 break-words" :class="fact.tone ?? ''">
          {{ fact.value }}
          <span v-if="fact.failure" class="block text-error" data-fact-failure>{{ fact.failure }}</span>
        </dd>
      </template>
    </dl>
  </MonitorCard>
</template>

<script setup lang="ts">
import type { MonitorFact } from "~/domain/hardware";

withDefaults(defineProps<{ title: string; facts: MonitorFact[]; loading?: boolean; loadingLabel?: string; rows?: number }>(), { loading: false, loadingLabel: "", rows: 6 });

const GRID = "pair-list gap-x-4 gap-y-2 @2xl:grid-cols-[max-content_minmax(0,1fr)_max-content_minmax(0,1fr)] @5xl:grid-cols-[repeat(3,max-content_minmax(0,1fr))]";
</script>
