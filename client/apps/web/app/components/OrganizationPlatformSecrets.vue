<template>
  <!-- The organisation screen's secrets tab with the platform chosen (docs/web.md, 「Organisation」, the secrets tab): the
       platform's space, the data root's `env/`, which every platform administrator holds and every unit reads the
       deployment's secrets from by name. It is the administrator's own space, listed through the reader's own routes. -->
  <SecretSpace ref="space" :unit="null" :note="$t('secrets.label.platform_note')" />
</template>

<script setup lang="ts">
// The space's add, handed on to the tab row.
const space = useTemplateRef<{ addLabel: string; addDisabled: boolean; openAdd: () => void }>("space");

defineExpose({
  addLabel: computed(() => space.value?.addLabel ?? null),
  addDisabled: computed(() => space.value?.addDisabled ?? true),
  openAdd: () => space.value?.openAdd()
});
</script>
