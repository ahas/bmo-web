<template>
  <!-- One line saying that what stands above it is the role's, shared by every agent of the role, and the way to the
       role's own dialog, where it is changed (docs/web.md, 「Agent management screen」, the agents tab). -->
  <div class="flex min-w-0 flex-wrap items-center gap-x-2" data-role-shared>
    <p class="text-sm text-muted">{{ props.text ?? $t("agents.message.role_shared") }}</p>
    <UButton :label="$t('agents.action.role_settings')" color="primary" variant="link" size="sm" class="px-0" data-role-open @click="emit('open')" />
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ text?: string }>();
const emit = defineEmits<{ open: [] }>();
</script>
