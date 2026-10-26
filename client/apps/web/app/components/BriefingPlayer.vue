<template>
  <!-- The voice briefing playing, as a compact control in the one title bar's set of buttons (docs/web.md,
       「Messages」, the briefing's player): over nothing a screen draws. It carries no words: the visualiser, which
       leads to the voice message or plays a sound waiting for a press, and the close mark, which stops the
       listening. Nothing was pressed for it, so it comes and goes by fading where it stands. Its dark surface is a
       layer of its own behind the two presses, so the swell with the sound moves the surface alone. -->
  <Transition name="bmo-briefing">
    <div v-if="shown !== null" data-briefing-popup role="group" :aria-label="$t('briefing.label.title')" class="relative flex shrink-0 items-center gap-0.5 p-0.5">
      <span
        data-briefing-surface
        aria-hidden="true"
        class="absolute inset-0 -z-10 rounded-full bg-zinc-900 ring-1 ring-white/15 dark:bg-zinc-800"
        :style="{ scale: swell }"
      />

      <UTooltip :text="pressLabel">
        <button
          type="button"
          class="flex h-7 w-12 cursor-pointer items-center justify-center rounded-full text-white transition-colors hover:bg-white/10 active:bg-white/20 focus-inset"
          :aria-label="pressLabel"
          @click="press"
        >
          <UIcon v-if="waitsForPress" name="i-material-symbols-play-arrow-rounded" class="size-5" />
          <span v-else aria-hidden="true" class="flex h-5 items-center gap-1">
            <span v-for="(bar, index) in bars" :key="index" class="w-1 rounded-full bg-white" :style="{ height: `${barHeight(bar)}px` }" />
          </span>
        </button>
      </UTooltip>

      <UTooltip :text="$t('briefing.action.stop')">
        <UButton
          icon="i-material-symbols-close"
          size="xs"
          color="neutral"
          variant="ghost"
          class="rounded-full"
          :ui="{ base: 'text-zinc-300 hover:bg-white/10 hover:text-white active:bg-white/20' }"
          :aria-label="$t('briefing.action.stop')"
          @click="shown.stop()"
        />
      </UTooltip>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { barsOf, BRIEFING_BARS, BRIEFING_FFT, briefingState, swayingBars, swellOf } from "~/domain/briefing";
import { useNarrow } from "bmo-ui/app/domain/screen";

const { t } = useI18n();
const shown = briefingState();

// A sound that stopped short of playing — paused by another player, or refused by a browser that
// will not start one nobody pressed for — waits for a press, and the visualiser's place says so.
const waitsForPress = computed(() => shown.value?.phase === "paused" || shown.value?.phase === "blocked");
const pressLabel = computed(() => (waitsForPress.value ? t("briefing.action.listen") : t("briefing.action.open")));

// The bars at rest, while the sound loads, and the still shape a reader who asked for less movement
// is shown while it plays.
const RESTING = Array.from({ length: BRIEFING_BARS }, () => 0);
const STILL = [0.4, 0.7, 1, 0.7, 0.4];
const BAR_MIN_PX = 4;
const BAR_MAX_PX = 20;

const bars = ref<number[]>(RESTING);
const still = useNarrow("(prefers-reduced-motion: reduce)");
const bins = new Uint8Array(BRIEFING_FFT / 2);

// The surface behind the presses swells from its middle with the bars, so at rest, still or silent it
// stands at its own size; the stylesheet eases each frame into the next.
const swell = computed(() => (still.value ? 1 : swellOf(bars.value)));

function barHeight(bar: number): number {
  return Math.round(BAR_MIN_PX + Math.min(1, Math.max(0, bar)) * (BAR_MAX_PX - BAR_MIN_PX));
}

// One frame of the visualiser: the sound's own spectrum where the browser gives it, the bars
// swaying on their own where it does not. It runs only while the sound plays.
let frame: number | null = null;

function draw(now: number): void {
  const playing = shown.value;

  frame = null;

  if (playing === null || playing.phase !== "playing") {
    bars.value = RESTING;

    return;
  }

  if (still.value) {
    bars.value = STILL;

    return;
  }

  bars.value = playing.levels(bins) ? barsOf(bins) : swayingBars(now / 1000);
  frame = requestAnimationFrame(draw);
}

if (import.meta.client) {
  watch(
    () => [shown.value?.phase ?? null, still.value] as const,
    () => {
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }

      frame = requestAnimationFrame(draw);
    },
    { immediate: true }
  );

  onScopeDispose(() => {
    if (frame !== null) {
      cancelAnimationFrame(frame);
    }
  });
}

// The visualiser's press: a sound waiting for one is played, and one playing leads to its voice
// message and keeps playing, since only the close mark, which stops the listening, or the sound's end takes it down.
async function press(): Promise<void> {
  const now = shown.value;

  if (now === null) {
    return;
  }

  if (waitsForPress.value) {
    now.play();

    return;
  }

  await navigateTo(now.to);
}
</script>

<style scoped>
/* Its swell with the sound is the surface's scale alone, eased from one frame to the next, so the presses keep
   their size and place while it plays and no frame lays anything out again. It comes and goes by fading where it
   stands, on the shared quick length. */
[data-briefing-surface] {
  transform-origin: center;
  transition: scale var(--bmo-motion-quick) var(--bmo-ease-move);
}

.bmo-briefing-enter-active {
  transition: opacity var(--bmo-motion-quick) var(--bmo-ease-enter);
}

.bmo-briefing-leave-active {
  transition: opacity var(--bmo-motion-quick) var(--bmo-ease-exit);
}

.bmo-briefing-enter-from,
.bmo-briefing-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  [data-briefing-surface] {
    transition: none;
  }
}
</style>
