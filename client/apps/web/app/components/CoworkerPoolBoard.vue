<template>
  <!-- The co-worker pool at a glance: a tile to every place, the workers' own first, then every
       co-worker tier on each provider. A busy tile opens the live log of the run doing its work. -->
  <div class="flex flex-col gap-3">
    <ReadFailure :failure="readFailure" :message="failed" :reading="reading" @retry="load()" />

    <!-- The pool before it has arrived: the one title it always stands, and under it the tiles in
         the shape of a real place — its mark, its name and the line under them. -->
    <ContentSkeleton v-if="board === null && failed === ''" :label="$t('live.status.pool_loading')">
      <div class="flex flex-col gap-2">
        <h3 class="text-sm font-medium text-toned">{{ $t("common.label.worker") }}</h3>
        <div class="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2 sm:grid-cols-[repeat(auto-fill,minmax(9rem,1fr))]">
          <div v-for="n in 8" :key="n" class="flex flex-col justify-center gap-1 rounded-md border border-default px-2 py-2">
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
      <div class="flex flex-col gap-2">
        <h3 class="text-sm font-medium text-toned">{{ $t("common.label.worker") }} <span class="tabular-nums text-muted">{{ busyWorkers }}/{{ board.workers.length.toLocaleString("ko-KR") }}</span></h3>
        <ul class="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2 sm:grid-cols-[repeat(auto-fill,minmax(9rem,1fr))]" :aria-label="$t('live.aria.worker_places')">
          <li v-for="worker in board.workers" :key="worker.name">
            <PoolTile :tile="worker.tile" :name="worker.label" :now="now" :stops="stops" @open="openLog" />
          </li>
        </ul>
        <!-- A tile is too small to hold the question, so it grows out of the group the tile is
             in, naming that tile. The tile itself is marked while it asks, so which one is being
             answered for is never in doubt. -->
        <StopConfirm
          v-if="asking(board.workers.map((worker) => worker.tile)) !== null"
          :target="asking(board.workers.map((worker) => worker.tile))!.target"
          :label="asking(board.workers.map((worker) => worker.tile))!.label"
          :stops="stops"
          :question="$t('live.message.stop_confirm')"
        />
      </div>

      <p v-if="board.buckets.length === 0" class="text-sm text-muted">{{ $t("live.status.no_places") }}</p>

      <div v-for="bucket in board.buckets" :key="`${bucket.provider}:${bucket.tier}`" class="flex flex-col gap-2">
        <h3 class="text-sm font-medium text-toned tabular-nums">{{ bucketHead($t, bucket) }}</h3>
        <ul class="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2 sm:grid-cols-[repeat(auto-fill,minmax(9rem,1fr))]" :aria-label="bucketHead($t, bucket)">
          <li v-for="(tile, at) in bucket.tiles" :key="at">
            <PoolTile :tile="tile" :name="tile.work?.role ?? ''" :now="now" :stops="stops" @open="openLog" />
          </li>
        </ul>
        <StopConfirm
          v-if="asking(bucket.tiles) !== null"
          :target="asking(bucket.tiles)!.target"
          :label="asking(bucket.tiles)!.label"
          :stops="stops"
          :question="$t('live.message.stop_confirm')"
        />
      </div>
    </template>

    <AgentLogDialog v-if="log !== null" v-model:open="logOpen" :name="log.agent" :place="{ run: log.run }" :rooms="props.rooms" end />
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { useReadFailure } from "~/domain/events";
import { useBackClose } from "bmo-ui/app/domain/layers";
import { bucketHead, tileStop } from "~/domain/pool-board";
import { usePolling } from "~/domain/polling";
import { stopKey, useStops } from "~/domain/stopping";

import type { RoomSummary, StopTarget } from "#shared/types";
import type { PoolBoard, PoolBoardLog, PoolBoardTile } from "#shared/agency";

const props = withDefaults(defineProps<{ rooms?: RoomSummary[]; now: number }>(), { rooms: () => [] });

// How often the pool is read again while the screen stands and is seen.
const POLL_MS = 3_000;

const board = ref<PoolBoard | null>(null);
const failed = ref("");
const reading = ref(false);
const log = ref<PoolBoardLog | null>(null);
const logOpen = ref(false);

// A co-worker is stopped through the run it works inside, and the answer is the bot's own; what
// the board does with it is read the screen again, since the tile goes when that run does.
const { t } = useI18n();
const stops = useStops(t, async (target) => {
  const answer = await $fetch<{ state?: string }>("/api/run-stop", { method: "POST", body: { target } });

  void load();

  return answer;
});

// The open question goes back with the back gesture, like everything else a screen goes into.
useBackClose(computed(() => stops.asking.value !== null), () => stops.cancel());

// The tile of this group whose question stands open, with the words that say which one it is.
function asking(tiles: readonly PoolBoardTile[]): { target: StopTarget; label: string } | null {
  for (const tile of tiles) {
    const target = tile.state === "working" ? tileStop(tile) : null;

    if (target !== null && stops.isAsking(target)) {
      return { target, label: tile.work?.title ?? t("live.label.coworker") };
    }
  }

  return null;
}

const busyWorkers = computed(() => (board.value?.workers.filter((worker) => worker.tile.state !== "idle").length ?? 0).toLocaleString("ko-KR"));

async function load(): Promise<void> {
  if (reading.value) return;

  reading.value = true;

  try {
    board.value = await $fetch<PoolBoard>("/api/agency/pool");
    failed.value = "";
    // A place the pool no longer holds is work that ended, and what stood on that tile goes with it.
    stops.seen([
      ...board.value.workers.map((worker) => worker.tile),
      ...board.value.buckets.flatMap((bucket) => bucket.tiles),
    ].flatMap((tile) => { const target = tileStop(tile); return target === null ? [] : [stopKey(target)]; }));
  } catch (error) {
    failed.value = failureText(error, t("live.error.pool_read_failed"));
  } finally {
    reading.value = false;
  }
}

const readFailure = useReadFailure({ failed: () => failed.value !== "", reading: () => reading.value, reread: () => void load() });

function openLog(place: PoolBoardLog): void {
  log.value = place;
  logOpen.value = true;
}

onMounted(() => {
  void load();
});

usePolling(() => {
  if (document.visibilityState === "visible") void load();
}, POLL_MS);
</script>
