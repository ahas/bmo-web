<template>
  <!-- The voice briefing playing, as a small player over the page's panel, first at its top-left
       just under its title row and level with the gutter the content stands on, and dragged from
       there like a picture-in-picture window (docs/web.md, 「Messages」, the briefing's player). It
       carries no words: the visualiser, which leads to the voice message or plays a sound waiting
       for a press, and the close mark, which stops the listening. It stands inside the layout rather than
       over it, so what opens over the screen covers it like the rest. Its dark surface is a layer of
       its own behind the two presses, so the swell with the sound moves the surface alone. -->
  <Transition name="bmo-briefing" type="animation">
    <div
      v-if="shown !== null"
      ref="player"
      data-briefing-popup
      role="group"
      :aria-label="$t('briefing.label.title')"
      class="absolute z-20 flex touch-none items-center gap-1 p-1 select-none [--bmo-gutter:1rem] sm:[--bmo-gutter:1.5rem]"
      :class="dragAt === null ? '' : 'cursor-grabbing'"
      :style="placed"
      @pointerdown="grab"
      @click.capture="swallow"
    >
      <span
        data-briefing-surface
        aria-hidden="true"
        class="absolute inset-0 -z-10 rounded-full bg-zinc-900 shadow-lg shadow-black/40 ring-1 ring-white/15 dark:bg-zinc-800"
        :style="{ scale: swell }"
      />

      <UTooltip :text="pressLabel">
        <button
          type="button"
          class="flex h-8 w-14 cursor-pointer items-center justify-center rounded-full text-white transition-colors hover:bg-white/10 active:bg-white/20 focus-inset"
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
          size="sm"
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
import { type BriefingBounds, clampTo, isDrag, settledSide, useBriefingPosition } from "~/domain/briefing-position";
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

// Where it stands. At rest it is held to its side's gutter and to the height it was left at, which
// the stylesheet pulls inside the panel between the title row and the foot's gutter, so a panel
// that shrinks shows it as low as it allows without losing the height kept for a taller one.
const { position, keep } = useBriefingPosition();
const player = ref<HTMLElement | null>(null);
const dragAt = ref<{ left: number; top: number } | null>(null);
const height = ref(0);

watch(player, (element) => {
  if (element !== null) {
    height.value = element.offsetHeight;
  }
});

function restingTop(top: number): string {
  return `clamp(calc(var(--ui-header-height) + 0.5rem), ${top}px, calc(100% - ${height.value}px - var(--bmo-gutter)))`;
}

const placed = computed(() => {
  if (dragAt.value !== null) {
    return { left: `${dragAt.value.left}px`, top: `${dragAt.value.top}px` };
  }

  const { side, top } = position.value;

  return { [side]: "var(--bmo-gutter)", top: restingTop(top) };
});

// The edges it may be dragged between, read off the panel it stands in as the drag begins: the
// gutter its side keeps, and the highest and lowest its resting rule lets it stand.
function boundsOf(element: HTMLElement): BriefingBounds {
  const panel = element.offsetParent as HTMLElement;
  const width = element.offsetWidth;
  const gutter = position.value.side === "left" ? element.offsetLeft : panel.clientWidth - element.offsetLeft - width;
  const resting = element.style.top;

  element.style.top = restingTop(0);
  const minTop = element.offsetTop;

  element.style.top = restingTop(panel.clientHeight);
  const maxTop = element.offsetTop;

  element.style.top = resting;

  return { minLeft: gutter, maxLeft: panel.clientWidth - width - gutter, minTop, maxTop };
}

// One press on the player, from the pointer going down: a press until it has travelled past the
// slop, a drag from then on.
interface Held {
  pointer: number;
  type: string;
  x: number;
  y: number;
  from: { left: number; top: number };
  bounds: BriefingBounds | null;
  lastX: number;
  lastAt: number;
  speed: number;
}

let held: Held | null = null;
let dragged = false;

function grab(event: PointerEvent): void {
  const element = player.value;

  dragged = false;

  if (element === null || !event.isPrimary || event.button !== 0) {
    return;
  }

  for (const running of element.getAnimations()) {
    running.cancel();
  }

  held = {
    pointer: event.pointerId,
    type: event.pointerType,
    x: event.clientX,
    y: event.clientY,
    from: { left: element.offsetLeft, top: element.offsetTop },
    bounds: null,
    lastX: event.clientX,
    lastAt: event.timeStamp,
    speed: 0
  };
  window.addEventListener("pointermove", follow);
  window.addEventListener("pointerup", release);
  window.addEventListener("pointercancel", release);
}

function follow(event: PointerEvent): void {
  const element = player.value;

  if (held === null || element === null || event.pointerId !== held.pointer) {
    return;
  }

  const dx = event.clientX - held.x;
  const dy = event.clientY - held.y;

  if (held.bounds === null) {
    if (!isDrag(dx, dy, held.type)) {
      return;
    }

    height.value = element.offsetHeight;
    held.bounds = boundsOf(element);
  }

  const { bounds } = held;
  const elapsed = event.timeStamp - held.lastAt;

  if (elapsed > 0) {
    held.speed = ((event.clientX - held.lastX) / elapsed) * 1000;
  }

  held.lastX = event.clientX;
  held.lastAt = event.timeStamp;
  dragAt.value = {
    left: clampTo(held.from.left + dx, bounds.minLeft, bounds.maxLeft),
    top: clampTo(held.from.top + dy, bounds.minTop, bounds.maxTop)
  };
}

// Let go, a drag settles on the nearer side at the height it was let go at, glides there, and is
// kept; the press it began as is not passed on to what it started on.
async function release(event: PointerEvent): Promise<void> {
  const element = player.value;
  const ended = held;

  if (ended === null || event.pointerId !== ended.pointer) {
    return;
  }

  held = null;
  window.removeEventListener("pointermove", follow);
  window.removeEventListener("pointerup", release);
  window.removeEventListener("pointercancel", release);

  const at = dragAt.value;

  if (element === null || ended.bounds === null || at === null) {
    dragAt.value = null;

    return;
  }

  dragged = true;

  const before = element.getBoundingClientRect();

  keep({ side: settledSide(at.left, element.offsetWidth, ended.bounds, ended.speed), top: Math.round(at.top) });
  dragAt.value = null;
  await nextTick();

  if (still.value) {
    return;
  }

  const after = element.getBoundingClientRect();

  element.animate([{ transform: `translate(${before.left - after.left}px, ${before.top - after.top}px)` }, { transform: "none" }], {
    duration: 220,
    easing: "cubic-bezier(0.2, 0.9, 0.25, 1)"
  });
}

// A click that ends a drag is the drag's; one from the keyboard carries no pointer and is passed on.
function swallow(event: MouseEvent): void {
  if (dragged && event.detail !== 0) {
    event.stopPropagation();
    event.preventDefault();
  }

  dragged = false;
}

onScopeDispose(() => {
  if (import.meta.client) {
    window.removeEventListener("pointermove", follow);
    window.removeEventListener("pointerup", release);
    window.removeEventListener("pointercancel", release);
  }
});
</script>

<style scoped>
/* It comes out of its own middle, past its size and back, and goes back into it; the size alone
   shows it coming and going, so nothing fades. Its swell with the sound is the surface's scale
   alone, eased from one frame to the next, so the presses keep their size and place while it plays
   and no frame lays anything out again. */
[data-briefing-popup],
[data-briefing-surface] {
  transform-origin: center;
}

[data-briefing-surface] {
  transition: scale 120ms ease-out;
}

.bmo-briefing-enter-active {
  animation: bmo-briefing-in 460ms both;
}

.bmo-briefing-leave-active {
  animation: bmo-briefing-out 220ms both;
}

@keyframes bmo-briefing-in {
  0% {
    transform: scale(0);
    animation-timing-function: cubic-bezier(0.2, 0.7, 0.4, 1);
  }

  50% {
    transform: scale(1.12);
    animation-timing-function: ease-in-out;
  }

  72% {
    transform: scale(0.95);
    animation-timing-function: ease-in-out;
  }

  88% {
    transform: scale(1.02);
    animation-timing-function: ease-in-out;
  }

  100% {
    transform: scale(1);
  }
}

@keyframes bmo-briefing-out {
  0% {
    transform: scale(1);
    animation-timing-function: ease-out;
  }

  30% {
    transform: scale(1.06);
    animation-timing-function: cubic-bezier(0.5, 0, 0.8, 0.3);
  }

  100% {
    transform: scale(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  [data-briefing-surface] {
    transition: none;
  }

  .bmo-briefing-enter-active,
  .bmo-briefing-leave-active {
    animation: none;
  }
}
</style>
