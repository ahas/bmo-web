<template>
  <!-- The desktop app's window bar over a page with no shell (docs/web.md, 「The desktop app's window」): laid over
       the page's top edge, the window's title at its left as the app sets it, which is where the app's pairing code
       stands, the window's controls at its right where the console draws them, room kept at its left where the
       system's own stand, the whole bar the window's drag region. -->
  <div
    class="fixed inset-x-0 top-0 z-50 flex h-10 items-center gap-2 pe-1 ps-4 bmo-window-inset"
    data-tauri-drag-region="deep"
    data-window-strip
  >
    <span class="min-w-0 flex-1 truncate text-sm text-muted" data-window-title>{{ title }}</span>
    <DesktopWindowControls size="sm" />
  </div>
</template>

<script setup lang="ts">
import { windowFrame } from "~/domain/desktop-app";

// How often the window's title is read again while the bar stands: the app changes it as a pairing opens and ends.
const TITLE_EVERY_MS = 1000;

const title = ref("");
let reading: ReturnType<typeof setInterval> | null = null;

async function readTitle(): Promise<void> {
  try {
    title.value = await windowFrame.title();
  } catch {
    // A title the window does not answer leaves the last one read.
  }
}

onMounted(() => {
  void readTitle();
  reading = setInterval(() => void readTitle(), TITLE_EVERY_MS);
});

onBeforeUnmount(() => {
  if (reading !== null) clearInterval(reading);
});
</script>
