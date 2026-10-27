<template>
  <!-- A message the reader's own edited (docs/web.md, the room screen's message menu): its words in a box as tall as
       they are, saved or left as they were. The record keeps the new words and the moment they changed; the room
       answers by closing the box on a save it took and by handing a refusal back for the box to say, and every other
       open tab is told the message changed. -->
  <SettingsDialog v-model:open="open" :title="$t('room.title.edit_message')" :description="props.description" :dirty="typed !== props.text">
    <form id="message-edit-form" class="flex flex-col gap-3" @submit.prevent="void save()">
      <UFormField :label="$t('room.label.edit_message')" name="text">
        <UTextarea v-model="typed" class="w-full" :rows="6" autoresize autofocus :maxlength="MAX_SAY_TEXT_LENGTH" :aria-label="$t('room.label.edit_message')" />
      </UFormField>

      <p v-if="failed !== ''" role="alert" class="break-words text-sm text-error">{{ failed }}</p>
    </form>

    <template #footer="{ close }">
      <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="saving" @click="close()" />
      <UButton
        type="submit"
        form="message-edit-form"
        :label="$t('common.action.save')"
        :loading="saving"
        :disabled="saving || typed.trim() === '' || typed === props.text"
      />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { MAX_SAY_TEXT_LENGTH } from "#shared/config";

interface Props {
  // The words the message holds now, and who said them, for the box and its line under the title.
  text: string;
  description: string;
  // Saves the words; the refusal in the pack's words, or null once the record took it.
  save: (text: string) => Promise<string | null>;
}

const props = defineProps<Props>();

const open = defineModel<boolean>("open", { required: true });

const typed = ref(props.text);
const saving = ref(false);
const failed = ref("");

// Every opening starts from the words the row holds now, since an edit another tab saved may have changed them.
watch(open, (now) => {
  if (!now) return;

  typed.value = props.text;
  failed.value = "";
});

async function save(): Promise<void> {
  if (saving.value || typed.value.trim() === "" || typed.value === props.text) return;

  saving.value = true;
  failed.value = "";

  try {
    const refused = await props.save(typed.value);

    if (refused === null) {
      open.value = false;
    } else {
      failed.value = refused;
    }
  } finally {
    saving.value = false;
  }
}
</script>
