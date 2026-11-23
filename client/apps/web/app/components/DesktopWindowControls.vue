<template>
  <!-- The desktop app's window controls, drawn where the app says the console draws them (docs/web.md, 「The desktop
       app's window」): minimise, maximise or restore by whether the window is maximised, and close, each the library's
       square ghost button named in its tooltip, close filling in the error colour under the pointer and a press. -->
  <span v-if="drawn" class="flex shrink-0 items-center gap-1" data-window-control-set>
    <IconButton :size="props.size" icon="i-material-symbols-minimize" :label="$t('desktop.action.minimize')" data-window-control="minimize" @click="void windowFrame.minimize()" />
    <IconButton
      :size="props.size"
      :icon="maximized ? 'i-material-symbols-filter-none-outline' : 'i-material-symbols-crop-square-outline'"
      :label="maximized ? $t('desktop.action.restore') : $t('desktop.action.maximize')"
      data-window-control="maximize"
      @click="void toggle()"
    />
    <IconButton
      :size="props.size"
      icon="i-material-symbols-close"
      :label="$t('desktop.action.close_window')"
      :ui="{ base: 'hover:bg-error hover:text-inverted active:bg-error active:text-inverted' }"
      data-window-control="close"
      @click="void windowFrame.close()"
    />
  </span>
</template>

<script setup lang="ts">
import { useDesktopApp, windowFrame } from "~/domain/desktop-app";

import type { ButtonProps } from "@nuxt/ui";

interface Props {
  size?: ButtonProps["size"];
}

const props = withDefaults(defineProps<Props>(), { size: undefined });

const app = useDesktopApp();
const drawn = computed(() => app.value?.windowControls === "console");
const maximized = ref(false);

// Whether the window is maximised, asked again whenever the page's size changes, which a maximise and a restore do.
async function readMaximized(): Promise<void> {
  try {
    maximized.value = await windowFrame.isMaximized();
  } catch {
    maximized.value = false;
  }
}

async function toggle(): Promise<void> {
  await windowFrame.toggleMaximize();
  await readMaximized();
}

watch(drawn, (now) => {
  if (now) void readMaximized();
}, { immediate: true });

function resized(): void {
  if (drawn.value) void readMaximized();
}

onMounted(() => window.addEventListener("resize", resized));
onBeforeUnmount(() => window.removeEventListener("resize", resized));
</script>
