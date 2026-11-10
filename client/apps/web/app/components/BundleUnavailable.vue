<template>
  <!-- The console's own page at a screen a unit brings whose module could not be read (docs/web.md, 「Screens a unit
       brings」): under the screen's title, the sentence that its service is not answering and the key that reads
       the module again; once it loads, the screen's own route opens at the same address. -->
  <div class="flex min-h-0 flex-1 flex-col items-start gap-3 p-4" role="alert">
    <p class="text-sm text-warning">{{ $t("screens.error.screen_unreachable") }}</p>
    <UButton size="sm" color="neutral" variant="subtle" icon="i-material-symbols-refresh" :loading="trying" :label="$t('screens.action.read_screen_again')" @click="tryAgain" />
  </div>
</template>

<script setup lang="ts">
import { openScreen, screenAt, useConsoleScreens } from "~/domain/console-screens";

const route = useRoute();
const router = useRouter();
const screens = useConsoleScreens();
const trying = ref(false);

async function tryAgain(): Promise<void> {
  const screen = screenAt(screens.value, route.path);

  if (screen === null || trying.value) return;

  trying.value = true;

  try {
    await openScreen(router, screen);
    await navigateTo(route.fullPath, { replace: true });
  } catch {
    // Still not answering: the page stays, and the key is pressed again.
  } finally {
    trying.value = false;
  }
}
</script>
