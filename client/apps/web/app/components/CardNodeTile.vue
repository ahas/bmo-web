<!-- One node's card as the card master reads it (docs/web.md, 「Monitor's services tab」): its mark and name,
     its link to the master and its slave's version, the claim holding the card and a stage waiting on it,
     the card's memory as one bar split by unit with the units under it in shared columns and where each
     one out is, whose turn the card is and the queue, the host memory the dumps take, and the dump store.
     Shown whole; nothing folds. -->
<template>
  <div class="flex min-w-0 flex-col gap-4 rounded-lg border border-default bg-default p-4">
    <div class="flex min-w-0 flex-col gap-2">
      <div class="flex min-w-0 items-center gap-2">
        <UAvatar v-bind="identityMark(`node:${node.name}`, label, { icon: NODE_ICON })" size="sm" />
        <span class="min-w-0 flex-1 truncate font-medium">{{ label }}</span>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <UBadge
          :icon="node.link.state === 'connected' ? 'i-material-symbols-link' : 'i-material-symbols-link-off'"
          :label="linkText"
          :color="node.link.state === 'connected' ? 'success' : 'error'"
          variant="subtle"
        />
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2 text-sm">
      <span class="text-muted">{{ $t("cards.label.version") }}</span>
      <span class="font-mono">{{ node.version ?? $t("hardware.label.unread") }}</span>
      <UBadge v-if="card?.claim.by" icon="i-material-symbols-front-hand-outline" :label="$t('cards.status.claim', { who: card.claim.by })" color="warning" variant="subtle" />
      <UBadge v-if="node.rules?.error" icon="i-material-symbols-warning-outline" :label="$t('cards.status.rules_error')" :title="node.rules.error" color="warning" variant="subtle" />
      <UBadge v-if="card?.stage.waiting"icon="i-material-symbols-hourglass-top" :label="$t('cards.status.stage', { t: waitText($t, card.stage.waitingS) })" color="info" variant="subtle" />
    </div>

    <template v-if="card">
      <div class="flex flex-col gap-2">
        <div class="flex min-w-0 items-center gap-3 text-sm">
          <span class="min-w-0 truncate text-muted" :title="card.name ?? undefined">{{ card.name ? gpuShortName(card.name) : "GPU" }}</span>
          <span class="ms-auto shrink-0 tabular-nums">{{ usedText }}</span>
        </div>
        <div class="flex items-center gap-3 text-sm">
          <span class="text-muted">{{ $t("cards.label.free") }}</span>
          <span class="ms-auto tabular-nums">{{ mibText($t, card.freeMiB) }}</span>
        </div>
        <div class="flex h-3 w-full gap-px overflow-hidden rounded-sm bg-default" aria-hidden="true">
          <div v-for="piece in pieces" :key="piece.key" :class="piece.tone" :style="{ width: `${(piece.share * 100).toFixed(2)}%` }" :title="piece.label" />
        </div>
      </div>

      <dl v-if="card.units.length > 0" class="grid grid-cols-[minmax(0,1fr)_max-content_max-content_max-content] gap-x-3 gap-y-1 text-sm">
        <div class="col-span-full grid grid-cols-subgrid text-muted">
          <span>{{ $t("cards.label.unit") }}</span>
          <span class="text-right">{{ $t("cards.label.vram") }}</span>
          <span class="text-right">{{ $t("cards.label.unload") }}</span>
          <span class="text-right">{{ $t("cards.label.load") }}</span>
        </div>
        <div v-for="unit in card.units" :key="unit.name" class="col-span-full grid grid-cols-subgrid items-center">
          <dt class="flex min-w-0 items-center gap-2">
            <span class="size-2 shrink-0 rounded-full" :class="tone(unit.service).bar" aria-hidden="true" />
            <span class="min-w-0 wrap-anywhere" :title="unit.name">{{ unit.name.split("@")[0] }}</span>
            <span v-if="unit.state !== 'resident'" class="shrink-0 text-warning">{{ unitStateWord($t, unit) }}</span>
          </dt>
          <dd class="text-right tabular-nums">{{ mibText($t, unit.vramMiB) }}</dd>
          <dd class="text-right text-muted tabular-nums">{{ msText(unit.unloadMs) }}</dd>
          <dd class="text-right text-muted tabular-nums">{{ msText(unit.loadMs) }}</dd>
        </div>
      </dl>
      <p v-else class="text-sm text-muted">{{ $t("cards.status.no_units") }}</p>

      <dl class="pair-list gap-x-3 gap-y-1 text-sm">
        <dt class="text-muted">{{ $t("cards.label.turn") }}</dt>
        <dd class="tabular-nums">{{ card.turn ? `${card.turn.service} · ${waitText($t, card.turn.waitedS)}` : $t("cards.status.no_turn") }}</dd>
        <dt class="text-muted">{{ $t("cards.label.queue") }}</dt>
        <dd>
          <ul v-if="card.queue.length > 0" class="flex flex-col gap-1">
            <li v-for="ticket in card.queue" :key="ticket.ticket" class="flex flex-wrap gap-x-2 tabular-nums wrap-anywhere">
              <span>{{ ticket.service }}</span>
              <span v-if="ticket.position !== null" class="text-muted">{{ $t("cards.status.position", { n: countText(ticket.position) }) }}</span>
              <span v-if="ticket.unit" class="font-mono">{{ ticket.unit }}</span>
              <span class="text-muted">{{ waitText($t, ticket.waitedS) }}</span>
            </li>
          </ul>
          <span v-else class="text-muted">{{ $t("cards.status.no_queue") }}</span>
        </dd>
        <dt class="text-muted">{{ $t("cards.label.ram") }}</dt>
        <dd class="tabular-nums">{{ ramText($t, card.ram) }}</dd>
        <template v-if="card.store">
          <dt class="text-muted">{{ $t("cards.label.store") }}</dt>
          <dd class="min-w-0 tabular-nums wrap-anywhere">
            {{ card.store.error ?? `${mibText($t, card.store.bytes / 2 ** 20)} · ${$t("cards.status.extents", { n: countText(card.store.extents ?? 0), s: countText(card.store.slotsUsed) })}` }}
          </dd>
        </template>
      </dl>
    </template>

    <p v-if="node.link.state !== 'connected' && node.link.error" class="text-sm text-error font-mono wrap-anywhere">{{ node.link.error }}</p>
  </div>
</template>

<script setup lang="ts">
import { identityMark } from "~/domain/avatars";
import { gpuShortName } from "~/domain/hardware";
import { linkWord, memoryBar, mibText, msText, ramText, unitStateWord, waitText } from "~/domain/cards";
import { NODE_ICON } from "~/domain/nodes";
import { countText } from "~/domain/numbers";

import type { Palette } from "~/domain/cards";
import type { CardNode } from "#shared/cards";

// The label is the node list's, so a node wears the same letter and colour here as in the sidebar; the
// services wear the colours the board above gives them.
const props = defineProps<{ node: CardNode; label: string; now: number; tone: Palette }>();
const { t } = useI18n();

const card = computed(() => props.node.cards[0] ?? null);
const pieces = computed(() => (card.value ? memoryBar(t, card.value, props.tone) : []));
const usedText = computed(() => {
  const shown = card.value;
  if (!shown || shown.usedMiB === null || shown.totalMiB === null) return t("hardware.label.unread");
  return `${countText(shown.usedMiB)} / ${mibText(t, shown.totalMiB)}`;
});
const linkText = computed(() => linkWord(t, props.node, props.now));
</script>
