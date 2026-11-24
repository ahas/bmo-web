<template>
  <!-- The organisation screen's mail servers tab with the platform chosen (docs/web.md, 「Organisation」, the mail servers
       tab): the platform's servers, which everyone is offered, the administrator's alone to set. -->
  <MailServerList ref="list" link="platform" />
</template>

<script setup lang="ts">
// The list's add, handed on to the tab row.
const list = useTemplateRef<{ addLabel: string | null; addDisabled: boolean; openAdd: () => void }>("list");

defineExpose({
  addLabel: computed(() => list.value?.addLabel ?? null),
  addDisabled: computed(() => list.value?.addDisabled ?? true),
  openAdd: () => list.value?.openAdd()
});
</script>
