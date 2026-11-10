<template>
  <!-- The page area, and for a screen a unit brings the frame it stands in (docs/web.md, 「Screens a unit brings」,
       「The title bar」): the box its fixed positions are laid out in, and over it the console's own bar where the
       screen's route asks for it, holding before the name the place the screen lays its way back, and after it the
       place it lays what acts on it as a whole. -->
  <div class="relative flex min-h-0 min-w-0 flex-1" :class="bar === null ? '' : 'flex-col'" v-bind="area">
    <ConsoleTitleBar v-if="bar !== null" :title="$t(bar.title)" :icon="bar.icon">
      <!-- Filling the bar's leading place takes the library's mark out of it, so the mark stands again after the
           screen's way back. -->
      <template #leading="{ ui }">
        <span class="contents" data-title-bar-screen-lead />
        <UIcon :name="bar.icon" data-slot="icon" :class="ui.icon()" />
      </template>
      <template #trailing>
        <span class="flex items-center gap-1" data-title-bar-screen-actions />
      </template>
    </ConsoleTitleBar>
    <slot />
    <!-- The voice briefing's player, the layout's: it floats over the page area and stays as the reader moves between
         screens (docs/web.md, 「Messages」). It stands only where the layout hears the briefings. -->
    <BriefingPlayer />
  </div>
</template>

<script setup lang="ts">
import { useBundleArea, useBundleBar } from "~/domain/console-screens";

const area = useBundleArea();
const bar = useBundleBar();
</script>
