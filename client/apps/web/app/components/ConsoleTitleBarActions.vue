<template>
  <!-- The title bar's one set of buttons, the same on every screen and in the same places: the deployment's mark,
       and for the administrator the TODO button and the usage figures (docs/web.md, 「The title bar」). The layout
       holds this one instance, so a page change neither stands it up again nor reads its figures again. -->
  <span class="flex shrink-0 items-center gap-1.5" data-title-bar-actions>
    <DeployMark />
    <template v-if="administrator">
      <TodoOpenButton />
      <UsageMeters />
    </template>
  </span>
</template>

<script setup lang="ts">
import { useAdministrator } from "~/domain/access";

const administrator = useAdministrator();
</script>
