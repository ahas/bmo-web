<template>
  <!-- The page area, and for a screen a unit brings the frame it stands in (docs/web.md, 「Screens a unit brings」,
       「The title bar」): the box its fixed positions are laid out in, and over it the console's own bar where the
       screen's route asks for it, holding the screen's name and mark alone. -->
  <div ref="frame" class="relative flex min-h-0 min-w-0 flex-1" :class="bar === null ? '' : 'flex-col'" v-bind="area">
    <ConsoleTitleBar v-if="bar !== null" :title="$t(bar.title)" :icon="bar.icon" />
    <slot />
    <!-- The voice briefing's player, the layout's: it floats over the page area and stays as the reader moves between
         screens (docs/web.md, 「Messages」). It stands only where the layout hears the briefings. The shell is a fixed
         box, which holds every layer of what stands in it under a dialog, so the player stands outside it, at the
         page's end, in a box laid exactly over the page area, at the playing player's layer (docs/web.md, 「Floating
         things」, the layers). The box itself is neither seen nor pressed, so over a dialog or a viewer only the player
         stands, where it stands. -->
    <Teleport to="body">
      <div ref="lifted" class="pointer-events-none invisible fixed z-(--bmo-layer-pip)" :style="over">
        <BriefingPlayer :area="frame" class="pointer-events-auto visible" />
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { useBundleArea, useBundleBar } from "~/domain/console-screens";

const area = useBundleArea();
const bar = useBundleBar();

// The page area's box on the screen, read again whenever it changes size or the window does.
const frame = ref<HTMLElement | null>(null);
const lifted = ref<HTMLElement | null>(null);
const over = ref<Record<string, string>>({ display: "none" });

function measure(): void {
  const box = frame.value?.getBoundingClientRect();

  over.value = box === undefined ? { display: "none" } : { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` };
}

if (import.meta.client) {
  let observer: ResizeObserver | null = null;
  // An open dialog hides the rest of the page from assistive technology, the player's box with it; the player stands
  // over the dialog, so the box takes that mark straight off again and stays reachable as it is seen and pressed.
  const unhidden = new MutationObserver(() => {
    if (lifted.value?.hasAttribute("aria-hidden")) lifted.value.removeAttribute("aria-hidden");
  });

  watch(lifted, (box) => {
    unhidden.disconnect();
    if (box !== null) unhidden.observe(box, { attributes: true, attributeFilter: ["aria-hidden"] });
  });

  onMounted(() => {
    observer = new ResizeObserver(measure);
    if (frame.value !== null) observer.observe(frame.value);
    window.addEventListener("resize", measure);
    measure();
  });
  onBeforeUnmount(() => {
    observer?.disconnect();
    unhidden.disconnect();
    window.removeEventListener("resize", measure);
  });
}
</script>
