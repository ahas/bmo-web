<template>
  <!-- A card on no shell, as the login screen stands (docs/web.md, 「Pages with no sign-in」): the console's name at its
       head, the page's own content, and its actions at the foot's right end, the way back to the sign-in among them. -->
  <div class="relative flex overflow-y-auto bg-default p-4 text-default" :style="{ top: 'var(--bmo-screen-top)', height: 'var(--bmo-screen)' }">
    <UCard class="m-auto w-full max-w-sm">
      <template #header>
        <h1 class="text-xl font-semibold text-highlighted">{{ consoleName($t) }}</h1>
      </template>

      <div class="flex flex-col gap-4">
        <slot />
      </div>

      <template #footer>
        <div class="flex flex-wrap justify-end gap-2">
          <UButton color="neutral" variant="ghost" to="/login" :label="$t('security.action.to_login')" data-to-login />
          <slot name="actions" />
        </div>
      </template>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { consoleName } from "#shared/agent-names";
import { useVisibleShell } from "~/domain/overlay";

useVisibleShell();
</script>
