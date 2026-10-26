<!-- The card arbiter's board, the Monitor screen's Services tab (docs/web.md, 「Monitor's services tab」):
     the master's row, then the whole board, then each group of the rules with its memory and a tile
     per node's card, then the nodes no group chooses, then the events.
     It reads the master's state API alone, through its event stream, and changes nothing. -->
<template>
  <div class="flex flex-col gap-6">
    <p v-if="failed" role="alert" class="text-sm text-error wrap-anywhere">{{ $t("cards.error.master") }} <span class="font-mono">{{ failed }}</span></p>

    <SkeletonStatus v-if="loading && !state" as="div" :label="$t('cards.status.loading')" class="flex flex-col gap-4">
      <SkeletonBar class="h-5 w-64 max-w-full" />
      <SkeletonBar class="h-80 w-full" />
      <div class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))] gap-4">
        <SkeletonBar v-for="n in 3" :key="n" class="h-72 w-full" />
      </div>
    </SkeletonStatus>

    <template v-if="state">
      <dl class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <div class="flex items-center gap-2">
          <dt class="text-muted">{{ $t("cards.label.master") }}</dt>
          <dd><UBadge :label="failed ? $t('cards.status.lost') : $t('cards.status.connected')" :color="failed ? 'error' : 'success'" variant="subtle" /></dd>
        </div>
        <div class="flex items-center gap-2">
          <dt class="text-muted">{{ $t("cards.label.version") }}</dt>
          <dd class="font-mono">{{ state.master.version }}</dd>
        </div>
        <div v-if="state.master.rulesError" class="flex min-w-0 items-center gap-2">
          <dt class="text-muted">{{ $t("cards.label.rules") }}</dt>
          <dd class="min-w-0 truncate text-error" :title="state.master.rulesError">{{ $t("cards.status.rules_error") }}</dd>
        </div>
      </dl>

      <CardsBoard v-if="shown" :board="shown" :labels="labels" />

      <section v-for="section in sections(state)" :key="section.name || 'others'" class="flex flex-col gap-4">
        <div class="flex flex-col gap-2">
          <h2 class="text-lg font-medium">{{ section.name || $t("cards.label.others") }}</h2>
          <div v-if="section.pool || section.totalMiB !== null" class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <UBadge v-if="section.pool" :label="$t('cards.label.pool')" color="neutral" variant="subtle" />
            <span v-if="section.totalMiB !== null" class="text-sm tabular-nums text-muted">
              {{ $t("cards.label.free") }} {{ mibText($t, section.freeMiB) }} / {{ mibText($t, section.totalMiB) }}
            </span>
          </div>
        </div>
        <UProgress v-if="section.totalMiB" :model-value="Math.round(((section.totalMiB - (section.freeMiB ?? 0)) / section.totalMiB) * 1000) / 10" :max="100" size="sm" aria-hidden="true" />
        <div class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))] gap-4">
          <CardNodeTile v-for="node in section.nodes" :key="node.name" :node="node" :label="labels.get(node.name) ?? node.name" :now="now" :tone="shown?.tone ?? palette([])" />
        </div>
      </section>

      <!-- The order the rules keep among the cards' occupants, read here and changed only in the rules file. -->
      <section v-if="state.tiers.length > 0 || state.services.length > 0" class="flex flex-col gap-3" data-cards-priority>
        <div class="flex flex-col gap-1">
          <h2 class="text-lg font-medium">{{ $t("cards.label.priority") }}</h2>
          <p class="text-sm text-muted wrap-anywhere">{{ $t("cards.label.priority_rule", { file: state.master.rulesFile }) }}</p>
        </div>

        <DataTable v-if="state.tiers.length > 0" :data="tierRows" :columns="tierColumns" layout="own">
          <template #occupant-cell="{ row }">
            <span :class="CELL_TEXT" class="ps-4 font-mono text-sm text-highlighted">{{ row.original.occupant }}</span>
          </template>
          <template #tier-cell="{ row }">
            <span :class="CELL_TEXT" class="text-sm tabular-nums text-highlighted">{{ figure(row.original.tier) }}</span>
          </template>
          <template #nodes-cell="{ row }">
            <span :class="[CELL_TEXT, row.original.nodes.length === 0 ? 'text-muted' : 'text-highlighted']" class="text-sm">{{ nodesText(row.original.nodes) }}</span>
          </template>
        </DataTable>

        <DataTable v-if="state.services.length > 0" :data="state.services" :columns="serviceColumns" layout="own">
          <template #service-cell="{ row }">
            <span :class="CELL_TEXT" class="ps-4 font-mono text-sm text-highlighted">{{ row.original.service }}</span>
          </template>
          <template #tier-cell="{ row }">
            <span :class="[CELL_TEXT, row.original.tier === null ? 'text-muted' : 'text-highlighted']" class="text-sm tabular-nums">{{ row.original.tier === null ? "—" : figure(row.original.tier) }}</span>
          </template>
          <template #priority-cell="{ row }">
            <span :class="CELL_TEXT" class="text-sm tabular-nums text-highlighted">{{ row.original.priority === null ? "—" : figure(row.original.priority) }}</span>
          </template>
          <template #nodes-cell="{ row }">
            <span :class="CELL_TEXT" class="max-w-72 text-sm text-highlighted">{{ nodesText(row.original.nodes) }}</span>
          </template>
          <template #card-cell="{ row }">
            <span :class="CELL_TEXT" class="text-sm tabular-nums text-highlighted">{{ row.original.cardMiB === null ? "—" : mibText($t, row.original.cardMiB) }}</span>
          </template>
          <template #spread-cell="{ row }">
            <span :class="CELL_TEXT" class="text-sm text-highlighted">{{ spreadText(row.original) }}</span>
          </template>
        </DataTable>
      </section>

      <section class="flex flex-col gap-2">
        <h2 class="text-lg font-medium">{{ $t("cards.label.events") }}</h2>
        <ol class="flex flex-col gap-1 text-sm">
          <li v-for="(event, at) in state.events" :key="`${event.at}-${at}`" class="flex gap-3">
            <span class="shrink-0 text-muted tabular-nums">{{ clock(event.at) }}</span>
            <span v-if="event.node" class="shrink-0 font-medium">{{ labels.get(event.node) ?? event.node }}</span>
            <span class="min-w-0 wrap-anywhere">{{ event.text }}</span>
          </li>
        </ol>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { board, mibText, palette, sections, useCards } from "~/domain/cards";
import { useNodes } from "~/domain/nodes";
import { countText } from "~/domain/numbers";
import { CELL_TEXT } from "~/domain/settings-cells";

import type { TableColumn } from "@nuxt/ui";
import type { CardsState } from "#shared/cards";

const { t } = useI18n();

const { state, failed, loading } = useCards();
const { nodes } = useNodes();
const labels = computed(() => new Map(nodes.value.map((node) => [node.name, node.label])));
const shown = computed(() => (state.value ? board(state.value) : null));

// The clock the waits and the ages are counted against, ticking once a second while the screen is open.
const now = ref(Date.now() / 1000);
let ticking: ReturnType<typeof setInterval> | null = null;
onMounted(() => { ticking = setInterval(() => { now.value = Date.now() / 1000; }, 1_000); });
onBeforeUnmount(() => { if (ticking !== null) clearInterval(ticking); });

// The occupants lowest tier first, the order the rules yield in.
const tierRows = computed(() => [...(state.value?.tiers ?? [])].sort((one, other) => one.tier - other.tier));
const tierColumns = computed<TableColumn<CardsState["tiers"][number]>[]>(() => [
  { id: "occupant", header: t("cards.label.occupant"), meta: { class: { th: "w-full" } } },
  { id: "tier", header: t("cards.label.tier") },
  { id: "nodes", header: t("cards.label.nodes") }
]);
const serviceColumns = computed<TableColumn<CardsState["services"][number]>[]>(() => [
  { id: "service", header: t("cards.label.service"), meta: { class: { th: "w-full" } } },
  { id: "tier", header: t("cards.label.tier") },
  { id: "priority", header: t("cards.label.priority_value") },
  { id: "nodes", header: t("cards.label.nodes") },
  { id: "card", header: t("cards.label.card_memory") },
  { id: "spread", header: t("cards.label.spread") }
]);

function figure(value: number): string {
  return Number.isInteger(value) ? countText(value) : value.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
}

function nodesText(names: readonly string[]): string {
  return names.length === 0 ? "—" : names.map((name) => labels.value.get(name) ?? name).join(" · ");
}

function spreadText(service: CardsState["services"][number]): string {
  return [t(service.many ? "cards.label.spread_many" : "cards.label.spread_one"), ...(service.alone ? [t("cards.label.card_alone")] : [])].join(" · ");
}

function clock(at: number): string {
  return new Date(at * 1000).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}
</script>
