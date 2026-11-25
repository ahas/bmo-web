<!-- The store's other address, which forwards to the store at /store with the query it carries, so a link written to
     it lands on the store (docs/web.md, 「App catalogue」). -->
<template>
  <div />
</template>

<script setup lang="ts">
definePageMeta({ redirect: (to) => ({ path: "/store", query: to.query }) });
</script>
