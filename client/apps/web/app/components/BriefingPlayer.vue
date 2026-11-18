<template>
  <!-- The voice briefing playing, as a small player floating over the page area like a picture-in-picture window,
       first at the bottom right on the content's gutter above whatever bar stands at the screen's foot, and dragged
       from there (docs/web.md, 「Messages」, the briefing's player). Its press pauses the sound or plays one waiting,
       its title leads to the line it speaks over how far it has played, and its close mark stops the listening. Its
       surface swells with the sound, and its words, marks and the library's buttons take the dark theme the frame
       stands in, so a ghost button's hover and press read on it. -->
  <Transition name="bmo-briefing" type="animation">
    <PipFrame
      v-if="shown !== null"
      ref="pip"
      data-briefing-popup
      role="group"
      :aria-label="$t('briefing.label.title')"
      :surface-scale="swell"
      class="absolute z-30 w-72 max-w-[calc(100%-2*var(--bmo-gutter))] touch-none gap-2 p-1.5 [--bmo-gutter:1rem] sm:[--bmo-gutter:1.5rem]"
      :class="dragAt === null ? '' : 'cursor-grabbing'"
      :style="placed"
      @pointerdown="grab"
      @click.capture="swallow"
    >
      <!-- Back puts it away as it puts away anything floating over the screen: it stops the listening. -->
      <BriefingBack @back="shown.stop()" />

      <!-- The library's square icon button, the visualiser drawn at the library's icon size in the play mark's place. -->
      <HintTip :text="pressLabel" press class="shrink-0">
        <UButton color="neutral" variant="ghost" square data-briefing-press :aria-label="pressLabel" @click="press">
          <UIcon v-if="waitsForPress" name="i-material-symbols-play-arrow-rounded" class="size-5" />
          <span v-else aria-hidden="true" class="flex size-5 items-center justify-center gap-0.5">
            <span v-for="(bar, index) in bars" :key="index" class="w-0.5 rounded-full bg-inverted" :style="{ height: `${barHeight(bar)}px` }" />
          </span>
        </UButton>
      </HintTip>

      <span class="flex min-w-0 flex-1 flex-col gap-1.5">
        <HintTip :text="$t('briefing.action.open')" press class="min-w-0">
          <button type="button" data-briefing-title class="block w-full cursor-pointer truncate rounded-sm text-start text-sm text-highlighted hover:underline focus-inset" @click="go">
            {{ title }}
          </button>
        </HintTip>
        <span
          role="progressbar"
          data-briefing-progress
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="Math.round(played * 100)"
          :aria-valuetext="playedText"
          :aria-label="$t('briefing.label.title')"
          class="block h-1 overflow-hidden rounded-full bg-accented"
        >
          <span class="block h-full rounded-full bg-inverted" :style="{ width: `${played * 100}%` }" />
        </span>
      </span>

      <HintTip :text="$t('briefing.action.stop')" press class="shrink-0">
        <UButton
          icon="i-material-symbols-close"
          color="neutral"
          variant="ghost"
          data-briefing-stop
          :aria-label="$t('briefing.action.stop')"
          @click="shown.stop()"
        />
      </HintTip>
    </PipFrame>
  </Transition>
</template>

<script setup lang="ts">
import { barsOf, BRIEFING_BARS, BRIEFING_FFT, briefingState, swayingBars, swellOf } from "~/domain/briefing";
import { type BriefingBounds, clampTo, footClearance, isDrag, SCREEN_FOOT, settledSide, useBriefingPosition } from "~/domain/briefing-position";
import { useNarrow } from "bmo-ui/app/domain/screen";

import type { ComponentPublicInstance } from "vue";

const { t } = useI18n();
const shown = briefingState();

// A sound that stopped short of playing — paused by another player, or refused by a browser that
// will not start one nobody pressed for — waits for a press, and the visualiser's place says so.
const waitsForPress = computed(() => shown.value?.phase === "paused" || shown.value?.phase === "blocked");
const pressLabel = computed(() => (waitsForPress.value ? t("briefing.action.listen") : t("briefing.action.pause")));
const title = computed(() => shown.value?.title ?? t("briefing.label.title"));


// How far the sound has played, from nought to one, and the same in minutes and seconds.
const played = ref(0);
const playedText = ref("");

function clockOf(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));

  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function readPlayed(): void {
  const at = shown.value?.position() ?? null;

  played.value = at === null ? 0 : Math.min(1, at.at / at.length);
  playedText.value = at === null ? "" : t("briefing.label.played", { at: clockOf(at.at), length: clockOf(at.length) });
}

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

// One frame of the visualiser and of how far the sound has played: the sound's own spectrum where the browser gives
// it, the bars swaying on their own where it does not. It runs only while the sound plays.
let frame: number | null = null;

function draw(now: number): void {
  const playing = shown.value;

  frame = null;
  readPlayed();

  if (playing === null || playing.phase !== "playing") {
    bars.value = RESTING;

    return;
  }

  // Still bars for a reader who asked for less movement, while how far it has played goes on being read.
  if (still.value) {
    bars.value = STILL;
    frame = requestAnimationFrame(draw);

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

// Its press: a sound waiting for one is played, and one playing or loading is paused; only the close mark, which
// stops the listening, or the sound's end takes it down.
function press(): void {
  const now = shown.value;

  if (now === null) return;

  if (waitsForPress.value) now.play();
  else now.pause();
}

// Its title leads to the line it speaks, in its room, and leaves it playing.
async function go(): Promise<void> {
  const now = shown.value;

  if (now !== null) await navigateTo(now.to);
}

// Where it stands. At rest it is held to its side's gutter and to the height it was left at — where it first stands,
// as low as it may — which the stylesheet pulls inside the page area between the title row and the bar at the
// screen's foot, so a page area that shrinks shows it as low as it allows without losing the height kept for a
// taller one.
const { position, keep } = useBriefingPosition();
const pip = ref<ComponentPublicInstance | null>(null);
const player = computed<HTMLElement | null>(() => (pip.value?.$el instanceof HTMLElement ? pip.value.$el : null));
const dragAt = ref<{ left: number; top: number } | null>(null);
const height = ref(0);
// How far up from the page area's foot it keeps, over the bar standing there.
const foot = ref(0);

watch(player, (element) => {
  if (element !== null) {
    height.value = element.offsetHeight;
    measureFoot();
  }
});

function measureFoot(): void {
  const area = player.value?.offsetParent;

  if (!(area instanceof HTMLElement)) return;

  foot.value = Math.round(footClearance(area.getBoundingClientRect(), [...area.querySelectorAll(SCREEN_FOOT)].map((one) => one.getBoundingClientRect())));
}

// The bar at a screen's foot comes with the screen and grows with what is typed into it, so while the player stands
// it reads the bar again every half second.
const FOOT_READ_MS = 500;
let footTimer: ReturnType<typeof setInterval> | null = null;

if (import.meta.client) {
  watch(
    () => shown.value !== null,
    (standing) => {
      if (footTimer !== null) clearInterval(footTimer);

      footTimer = standing ? setInterval(measureFoot, FOOT_READ_MS) : null;
    },
    { immediate: true }
  );

  onScopeDispose(() => {
    if (footTimer !== null) clearInterval(footTimer);
  });
}

function restingTop(top: number | null): string {
  const lowest = `calc(100% - ${height.value}px - var(--bmo-gutter) - ${foot.value}px)`;

  return top === null ? `max(calc(var(--ui-header-height) + 0.5rem), ${lowest})` : `clamp(calc(var(--ui-header-height) + 0.5rem), ${top}px, ${lowest})`;
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
   shows it coming and going, so nothing fades. Its swell with the sound is the frame's surface
   alone, so the presses keep their size and place while it plays. */
[data-briefing-popup] {
  transform-origin: center;
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
  .bmo-briefing-enter-active,
  .bmo-briefing-leave-active {
    animation: none;
  }
}
</style>
