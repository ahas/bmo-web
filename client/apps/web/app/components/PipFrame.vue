<template>
  <!-- A small window floating over the page area like a picture-in-picture one (docs/web.md, 「Messages」, the
       briefing's player; 「Presence and typing」, the room's typing picture). It stands inside the layout rather than
       over it, so what opens over the screen covers it like the rest. Where it stands and how it is placed there,
       how it comes and goes and what it holds are its caller's.

       It stands in the dark theme whatever the page's: its surface is a shade darker than that theme's ground, so it
       stands apart from a dark page, and what it holds takes that theme's own colours. The surface is a layer of its
       own behind what it holds, so a caller that scales it moves the surface alone. -->
  <div class="dark isolate flex items-center select-none">
    <span
      data-pip-surface
      aria-hidden="true"
      class="absolute inset-0 -z-10 rounded-2xl bg-neutral-950 shadow-lg shadow-black/40 ring-1 ring-white/15"
      :style="props.surfaceScale === undefined ? undefined : { scale: props.surfaceScale }"
    />
    <slot />
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ surfaceScale?: number }>();
</script>

<style scoped>
/* The surface's scale is eased from one frame to the next, so no frame lays anything out again. */
[data-pip-surface] {
  transform-origin: center;
  transition: scale 120ms ease-out;
}

@media (prefers-reduced-motion: reduce) {
  [data-pip-surface] {
    transition: none;
  }
}
</style>
