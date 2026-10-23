<!-- The card arbiter screen's whole board, its view of everything (docs/web.md, 「Monitor's services tab」):
     every card as one bar, every service with its standing and, card by card, its units and its
     processes' own memory under it in shared columns, the memory no service accounts for after them,
     and every waiting ticket. Every name is the master's picture's; on a phone the kind and the state
     stand under the name they belong to. -->
<template>
  <section class="flex flex-col gap-4">
    <h2 class="text-lg font-medium">{{ $t("cards.label.board") }}</h2>

    <CardsBoardChart :cards="board.cards" :labels="labels" :tone="board.tone" />

    <div class="grid grid-cols-[minmax(0,1fr)_max-content] gap-x-3 gap-y-1 text-sm sm:grid-cols-[minmax(0,1fr)_repeat(3,max-content)]">
      <div class="col-span-full grid grid-cols-subgrid text-muted">
        <span>{{ $t("cards.label.service") }}</span>
        <span class="text-right">{{ $t("cards.label.vram") }}</span>
        <span class="hidden sm:block">{{ $t("cards.label.kind") }}</span>
        <span class="hidden sm:block">{{ $t("cards.label.where") }}</span>
      </div>

      <template v-for="service in board.services" :key="service.name">
        <div class="col-span-full grid grid-cols-subgrid items-center pt-2">
          <div class="flex min-w-0 flex-col gap-1">
            <div class="flex min-w-0 flex-wrap items-center gap-x-2">
              <span class="size-3 shrink-0 rounded-sm" :class="board.tone(service.name).bar" aria-hidden="true" />
              <span class="font-medium wrap-anywhere">{{ service.name }}</span>
            </div>
            <div v-if="chips(service).length > 0" class="flex flex-wrap gap-1 sm:hidden">
              <UBadge v-for="chip in chips(service)" :key="chip.label" :label="chip.label" :color="chip.color" variant="subtle" />
            </div>
          </div>
          <span class="text-right font-medium tabular-nums">{{ service.vramMiB > 0 ? mibText($t, service.vramMiB) : "—" }}</span>
          <div class="col-span-2 hidden flex-wrap gap-1 sm:flex">
            <UBadge v-for="chip in chips(service)" :key="chip.label" :label="chip.label" :color="chip.color" variant="subtle" />
          </div>
        </div>

        <template v-for="chunk in service.chunks" :key="chunk.key">
          <div class="col-span-full grid grid-cols-subgrid items-center">
            <div class="flex min-w-0 flex-col ps-5">
              <span class="min-w-0 font-medium wrap-anywhere">{{ chunkLabel(chunk) }}</span>
              <span v-if="chunkState(chunk)" class="text-muted wrap-anywhere sm:hidden">{{ chunkState(chunk) }}</span>
            </div>
            <span class="text-right tabular-nums">{{ chunk.vramMiB === null ? "—" : mibText($t, chunk.vramMiB) }}</span>
            <span class="hidden sm:block">{{ chunk.kinds.length === 1 ? kindWord($t, chunk.kinds[0]!) : "" }}</span>
            <span class="hidden sm:block" :class="whereTone(chunk.wheres)">{{ chunk.wheres.length === 1 ? whereWord($t, chunk.wheres[0]!) : "" }}</span>
          </div>

          <div v-for="unit in chunk.units" :key="unit.key" class="col-span-full grid grid-cols-subgrid items-center">
            <div class="flex min-w-0 flex-col ps-10">
              <div class="flex min-w-0 items-center gap-2">
                <span class="size-3 shrink-0 rounded-sm" :class="board.tone(service.name).bar" :style="partSwatch(unit.pattern)" aria-hidden="true" />
                <span class="min-w-0 wrap-anywhere">{{ unit.part }}</span>
              </div>
              <span v-if="detailText($t, unit.detail)" class="ps-5 text-muted wrap-anywhere">{{ detailText($t, unit.detail) }}</span>
              <span v-if="unitState(chunk, unit)" class="ps-5 text-muted wrap-anywhere sm:hidden">{{ unitState(chunk, unit) }}</span>
            </div>
            <span class="text-right tabular-nums">{{ unit.vramMiB === null ? "—" : mibText($t, unit.vramMiB) }}</span>
            <span class="hidden sm:block">{{ chunk.kinds.length > 1 ? kindWord($t, unit.kind) : "" }}</span>
            <span class="hidden sm:block" :class="whereTone([unit.where])">{{ chunk.wheres.length > 1 ? whereWord($t, unit.where) : "" }}</span>
          </div>

          <div v-for="other in chunk.others" :key="other.key" class="col-span-full grid grid-cols-subgrid items-center text-muted">
            <span class="min-w-0 ps-15 wrap-anywhere">{{ otherWord($t, other) }}</span>
            <span class="text-right tabular-nums">{{ mibText($t, other.vramMiB) }}</span>
          </div>
        </template>
      </template>

      <template v-if="board.outside.length > 0">
        <div class="col-span-full grid grid-cols-subgrid items-center pt-2">
          <span class="font-medium">{{ $t("cards.label.outside") }}</span>
          <span class="text-right font-medium tabular-nums">{{ mibText($t, board.outside.reduce((sum, chunk) => sum + (chunk.vramMiB ?? 0), 0)) }}</span>
        </div>
        <template v-for="chunk in board.outside" :key="chunk.key">
          <div class="col-span-full grid grid-cols-subgrid items-center">
            <span class="min-w-0 ps-5 font-medium wrap-anywhere">{{ chunkLabel(chunk) }}</span>
            <span class="text-right tabular-nums">{{ chunk.vramMiB === null ? "—" : mibText($t, chunk.vramMiB) }}</span>
          </div>
          <div v-for="other in chunk.others" :key="other.key" class="col-span-full grid grid-cols-subgrid items-center text-muted">
            <span class="min-w-0 ps-10 wrap-anywhere">{{ otherWord($t, other) }}</span>
            <span class="text-right tabular-nums">{{ mibText($t, other.vramMiB) }}</span>
          </div>
        </template>
      </template>
    </div>

    <div class="flex flex-col gap-1 text-sm">
      <h3 class="text-base font-medium">{{ $t("cards.label.waiting") }}</h3>
      <ul v-if="board.waiting.length > 0" class="flex flex-col gap-1">
        <li v-for="ticket in board.waiting" :key="ticket.ticket" class="flex flex-wrap gap-x-2 tabular-nums wrap-anywhere">
          <span class="font-medium">{{ ticket.service }}</span>
          <span>{{ placeText($t, ticket, label(ticket.node)) }}</span>
          <span v-if="ticket.unit" class="font-mono">{{ ticket.unit }}</span>
          <span v-if="ticket.position !== null" class="text-muted">{{ $t("cards.status.position", { n: countText(ticket.position) }) }}</span>
          <span class="text-muted">{{ waitText($t, ticket.waitedS) }}</span>
          <span v-if="ticket.waitS !== null" class="text-muted">{{ $t("cards.status.expected", { t: waitText($t, ticket.waitS) }) }}</span>
        </li>
      </ul>
      <p v-else class="text-muted">{{ $t("cards.status.no_queue") }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { detailText, kindWord, mibText, otherWord, partSwatch, placeText, waitText, whereWord } from "~/domain/cards";
import { countText } from "~/domain/numbers";

import type { Board, BoardChunk, BoardService, BoardUnit, UnitWhere } from "~/domain/cards";

const props = defineProps<{ board: Board; labels: Map<string, string> }>();
const { t } = useI18n();

function label(node: string): string {
  return props.labels.get(node) ?? node;
}

/** A chunk by its card, or as the units no card holds. */
function chunkLabel(chunk: BoardChunk): string {
  return chunk.place ? placeText(t, chunk.place, label(chunk.place.node)) : t("cards.label.unplaced_chunk");
}

/** The kind and the state a chunk's units share, as a phone shows them under its name. */
function chunkState(chunk: BoardChunk): string {
  const said = [];
  if (chunk.kinds.length === 1 && chunk.kinds[0] !== null) said.push(kindWord(t, chunk.kinds[0]!));
  if (chunk.wheres.length === 1) said.push(whereWord(t, chunk.wheres[0]!));
  return said.join(" · ");
}

/** A unit's own kind and state where its chunk's units differ in them, as a phone shows them. */
function unitState(chunk: BoardChunk, unit: BoardUnit): string {
  const said = [];
  if (chunk.kinds.length > 1) said.push(kindWord(t, unit.kind));
  if (chunk.wheres.length > 1) said.push(whereWord(t, unit.where));
  return said.join(" · ");
}

/** A state off the card warns; on the card it reads plain. */
function whereTone(wheres: UnitWhere[]): string {
  return wheres.length === 1 && wheres[0] !== "resident" ? "text-warning" : "";
}

/** A service's standing as chips: the cards its claim holds, the cards whose turn it is, its waiting tickets. */
function chips(service: BoardService): { label: string; color: "warning" | "success" | "info" }[] {
  const standing: { label: string; color: "warning" | "success" | "info" }[] = [];
  if (service.claims.length > 0) standing.push({ label: t("cards.status.claim_on", { nodes: service.claims.map(label).join(" · ") }), color: "warning" });
  if (service.turns > 0) standing.push({ label: t("cards.status.turns", { n: countText(service.turns) }), color: "success" });
  if (service.waiting > 0) standing.push({ label: t("cards.status.waiting", { n: countText(service.waiting) }), color: "info" });
  return standing;
}
</script>
