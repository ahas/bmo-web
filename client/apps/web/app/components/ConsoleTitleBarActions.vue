<template>
  <!-- The title bar's one set of buttons, the same on every screen and in the same places: the deployment's mark
       first, then for the administrator the usage figures and the TODO button last. The set stands at the bar's right
       end, so words that grow move only what stands before them: the mark's ticking time moves nothing (docs/web.md,
       「The title bar」). The layout
       holds this one instance, so a page change neither stands it up again nor reads its figures again. -->
  <span class="flex shrink-0 items-center gap-1" data-title-bar-actions>
    <DeployMark />
    <UsageMeters v-if="administrator" />
    <TodoOpenButton v-if="administrator" />
  </span>
</template>

<script setup lang="ts">
import { useAdministrator } from "~/domain/access";

const administrator = useAdministrator();
</script>
