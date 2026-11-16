<template>
  <!-- The step a row or an opened item grows before its approval is taken back (docs/todo.md,
       「Approval」): the question, what taking it back does, then the way out and the way through at
       the trailing edge. -->
  <div
    role="group"
    :aria-label="$t('todo.message.unapprove_confirm', { id: props.id })"
    class="flex flex-col gap-2 border-s-2 border-warning ps-3 text-sm"
  >
    <p class="text-highlighted">{{ $t("todo.message.unapprove_confirm", { id: props.id }) }}</p>
    <p class="text-muted">{{ $t("todo.message.unapprove_effect") }}</p>
    <div class="flex flex-wrap justify-end gap-2">
      <UButton size="sm" color="neutral" variant="ghost" :label="$t('common.action.cancel')" :disabled="props.busy" @click="emit('cancel')" />
      <UButton
        size="sm"
        color="warning"
        :label="$t('todo.action.unapprove')"
        :loading="props.busy"
        @click="emit('confirm')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  id: number;
  // Whether the taking back it started is still on its way, so the button wears the spinner.
  busy: boolean;
}>();

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();
</script>
