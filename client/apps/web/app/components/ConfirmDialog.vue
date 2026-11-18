<template>
  <!-- A question asked before an action, as the component library's dialog and never the message pill (docs/web.md,
       「Messages」): the question, the item it acts on, what going through does, then the way out and, last, the way
       through under the action's own verb. Only the way through answers yes; the way out, the close, Esc, a press
       outside and the back gesture close it with no answer, which is no. -->
  <UModal
    v-model:open="open"
    :title="props.title"
    :description="props.item ?? undefined"
    :ui="{ content: 'sm:max-w-xl', description: 'line-clamp-3 break-words' }"
    @after:leave="emit('after:leave')"
  >
    <template #close="{ ui }">
      <ShellClose :class="ui.close()" @close="open = false" />
    </template>

    <template v-if="props.effect" #body>
      <p class="whitespace-pre-line break-words text-sm text-toned">{{ props.effect }}</p>
    </template>

    <template #footer>
      <div class="flex w-full flex-wrap items-center justify-end gap-2">
        <UButton :label="props.cancel ?? $t('common.action.cancel')" color="neutral" variant="ghost" @click="emit('close', false)" />
        <UButton :label="props.confirm" color="error" @click="emit('close', true)" />
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { ConfirmAsked } from "~/domain/confirm";

const props = defineProps<ConfirmAsked>();
const open = defineModel<boolean>("open", { default: false });

// The answer goes to whoever opened it through `close`; `after:leave` lets it be taken off the page once it has gone.
const emit = defineEmits<{ close: [taken: boolean]; "after:leave": [] }>();
</script>
