<template>
  <!-- A companion's settings as a room's top bar opens them (docs/web.md, 「Room screen」, a companion's model settings): the
       very dialog the supervisor's own screen and the supervisors tab open, so the places never differ. -->
  <SupervisorSettingsDialog v-model:open="open" :name="props.meta.name" :reread="props.reread" />
</template>

<script setup lang="ts">
interface Props {
  // The companion, by the name its supervisor row stands under.
  meta: { name: string };
  agent?: unknown;
  reread?: () => Promise<void>;
}

const props = withDefaults(defineProps<Props>(), { agent: undefined, reread: async () => {} });
const open = defineModel<boolean>("open", { required: true });
</script>
