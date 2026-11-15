<!-- An address kept so a link made to it lands on agent management's agents tab, where what each agent is doing now
     is read (docs/web.md, 「Monitor screen」). -->
<template>
  <div />
</template>

<script setup lang="ts">
definePageMeta({ redirect: { path: "/agents", query: { tab: "supervisors" } } });
</script>
