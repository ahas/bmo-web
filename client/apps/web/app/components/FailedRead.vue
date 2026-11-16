<template>
  <!-- A read that failed, said in the place of what it would have shown: its reason, and the refresh at its right, which
       spins while the read is asked again (docs/web.md, 「Organisation」). -->
  <div role="alert" class="flex flex-col items-end gap-3">
    <UAlert class="w-full" color="error" variant="subtle" :description="props.message" />
    <UButton color="neutral" variant="subtle" icon="i-material-symbols-refresh" :label="$t('common.action.refresh')" :loading="props.reading" @click="emit('retry')" />
  </div>
</template>

<script setup lang="ts">
interface Props {
  message: string;
  reading: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{ retry: [] }>();
</script>
