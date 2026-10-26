<template>
  <!-- The page area, and for a screen a unit brings the frame it stands in (docs/web.md, 「Screens a unit brings」,
       「The title bar」): the box its fixed positions are laid out in, and over it the console's own bar where the
       screen's route asks for it, holding beside the name the place the screen lays what acts on it as a whole. -->
  <div class="relative flex min-h-0 min-w-0 flex-1" :class="bar === null ? '' : 'flex-col'" v-bind="area">
    <ConsoleTitleBar v-if="bar !== null" :title="$t(bar.title)" :icon="bar.icon">
      <template #trailing>
        <span class="flex items-center gap-1" data-title-bar-screen-actions />
      </template>
    </ConsoleTitleBar>
    <slot />
  </div>
</template>

<script setup lang="ts">
import { useBundleArea, useBundleBar } from "~/domain/console-screens";

const area = useBundleArea();
const bar = useBundleBar();
</script>
