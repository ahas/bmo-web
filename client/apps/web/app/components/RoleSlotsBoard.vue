<template>
  <!-- The role slots at a glance (docs/web.md, 「Live status screen」): a row to every role, a tile to every slot its cap
       gives. A working tile opens the live log of the role's run at the place that run began. -->
  <div class="flex flex-col gap-3">
    <ReadFailure :failure="readFailure" :message="failed" :reading="reading" @retry="load()" />

    <!-- The slots before they have arrived: rows in the shape of a real one — its head, and its tiles with a mark and
         two lines. -->
    <ContentSkeleton v-if="board === null && failed === ''" :rows="3" listClass="flex flex-col gap-3" :label="$t('live.status.slots_loading')">
      <div class="flex flex-col gap-2">
        <SkeletonLine width="w-40" />
        <div :class="GRID">
          <div v-for="n in 4" :key="n" class="flex flex-col justify-center gap-1 rounded-md border border-default px-2 py-2">
            <div class="flex h-5 items-center gap-1">
              <SkeletonBar class="size-4 shrink-0 rounded-sm" />
              <SkeletonBar class="h-4 w-3/5" />
            </div>
            <SkeletonLine width="w-4/5" />
          </div>
        </div>
      </div>
    </ContentSkeleton>

    <template v-if="board !== null">
      <BodyLine v-if="board.rows.length === 0">{{ $t("live.status.no_slots") }}</BodyLine>

      <div v-for="row in board.rows" :key="row.role" class="flex flex-col gap-2">
        <h3 class="text-sm font-medium text-toned tabular-nums">{{ rowHead($t, row) }}</h3>
        <ul :class="GRID" :aria-label="rowHead($t, row)">
          <li v-for="(tile, at) in row.tiles" :key="at">
            <SlotTile :tile="tile" :now="props.now" :stops="stops" @open="openLog(row.role, tile)" />
          </li>
        </ul>
        <!-- A tile is too small to hold the question, so it grows under the row the tile is in, naming that tile. The
             tile itself is marked while it asks, so which one is being answered for is never in doubt. -->
        <StopConfirm
          v-if="asking(row.tiles) !== null"
          :target="asking(row.tiles)!.target"
          :label="asking(row.tiles)!.label"
          :stops="stops"
          :question="$t('live.message.stop_confirm')"
        />
      </div>
    </template>

    <AgentLogDialog v-if="log !== null" v-model:open="logOpen" :name="log.role" :place="log.place" :rooms="props.rooms" />
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { useBackClose } from "bmo-ui/app/domain/layers";
import { useReadFailure } from "~/domain/events";
import { stopKey, useStops } from "~/domain/stopping";
import { usePolling } from "~/domain/polling";
import { rowHead } from "~/domain/role-slots";

import type { RoomSummary, StopTarget } from "#shared/types";
import type { SlotBoard, SlotTile as SlotTileView } from "#shared/role-slots";
import type { LogPlace } from "~/domain/log";

const props = withDefaults(defineProps<{ rooms?: RoomSummary[]; now: number }>(), { rooms: () => [] });

// How often the slots are read again while the screen stands and is seen.
const POLL_MS = 3_000;

// The tiles of one row: as many to a line as fit at the width a tile reads well at.
const GRID = "grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2 sm:grid-cols-[repeat(auto-fill,minmax(9rem,1fr))]";

const { t } = useI18n();
const board = ref<SlotBoard | null>(null);
const failed = ref("");
const reading = ref(false);
const log = ref<{ role: string; place: LogPlace | null } | null>(null);
const logOpen = ref(false);

// A job's run is stopped through its item, and the answer is the bot's own; what the board does with it is read the
// slots again, since the tile goes when that run does.
const stops = useStops(t, async (target) => {
  const answer = await $fetch<{ state?: string }>("/api/run-stop", { method: "POST", body: { target } });

  void load();

  return answer;
});

// The open question goes back with the back gesture, like everything else a screen goes into.
useBackClose(computed(() => stops.asking.value !== null), () => stops.cancel());

// The tile of this row whose question stands open, with the words that say which one it is.
function asking(tiles: readonly SlotTileView[]): { target: StopTarget; label: string } | null {
  for (const tile of tiles) {
    const target = tile.state === "working" ? (tile.run?.stop ?? null) : null;

    if (target !== null && stops.isAsking(target)) return { target, label: tile.run?.place ?? "" };
  }

  return null;
}

async function load(): Promise<void> {
  if (reading.value) return;

  reading.value = true;

  try {
    board.value = await $fetch<SlotBoard>("/api/slots");
    failed.value = "";
    // A run the slots no longer hold is work that ended, and what stood on its tile goes with it.
    stops.seen(board.value.rows.flatMap((row) => row.tiles.flatMap((tile) => (tile.run?.stop ? [stopKey(tile.run.stop)] : []))));
  } catch (error) {
    failed.value = failureText(error, t("live.error.slots_read_failed"));
  } finally {
    reading.value = false;
  }
}

const readFailure = useReadFailure({ failed: () => failed.value !== "", reading: () => reading.value, reread: () => void load() });

// A working tile opens the log of the run it holds, from that run's start and following its newest lines; one bound to
// no run yet opens the role's log at the moment it took the slot; an idle or a reserved one opens nothing.
function openLog(role: string, tile: SlotTileView): void {
  if (tile.state !== "working") return;

  const run = tile.run?.log ?? null;
  const since = tile.run?.since ?? null;

  log.value = { role, place: run !== null ? { run } : since === null ? null : { at: Math.floor(since / 1000) } };
  logOpen.value = true;
}

onMounted(() => {
  void load();
});

usePolling(() => {
  if (document.visibilityState === "visible") void load();
}, POLL_MS);
</script>
