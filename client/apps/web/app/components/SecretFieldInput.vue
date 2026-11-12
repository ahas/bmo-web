<template>
  <!-- One field of the secret form (docs/web.md, the secret store section), typed as its kind says: one line, a password box
       where its value is hidden; several lines, a box that grows with its text, drawn as dots where hidden, with a
       file read into it; or a file, chosen and shown by its name and size. The browser fills none of them. -->
  <UFormField :label="props.field.label" :name="props.field.key" :required="props.field.required" :data-secret-field="props.field.key">
    <UInput
      v-if="props.field.input === 'line'"
      v-model="text"
      class="w-full"
      :type="props.field.masked ? 'password' : 'text'"
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
      data-secret-value
    />

    <div v-else-if="props.field.input === 'lines'" class="flex flex-col items-end gap-2">
      <GrowingTextarea
        v-model="text"
        class="w-full"
        :rows="4"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        :class="props.field.masked ? 'secret-masked' : ''"
        data-secret-value
      />
      <UButton color="neutral" variant="subtle" icon="i-material-symbols-upload-file-outline" :label="$t('secrets.action.load_file')" @click="picker?.click()" />
    </div>

    <div v-else class="flex min-w-0 items-center gap-2">
      <UButton color="neutral" variant="subtle" icon="i-material-symbols-upload-file-outline" :label="$t('secrets.action.choose_file')" data-secret-file @click="picker?.click()" />
      <span v-if="props.file !== null" class="min-w-0 truncate text-sm text-muted">{{ $t("secrets.label.file_chosen", { name: props.file.name, size: fileSizeText(props.file.bytes.length) }) }}</span>
    </div>

    <input v-if="props.field.input !== 'line'" ref="picker" type="file" hidden data-secret-file-picker @change="onPick" />
  </UFormField>
</template>

<script lang="ts">
/** A file chosen for a field: its name, and its bytes, which stand in the form alone. */
export interface ChosenFile {
  name: string;
  bytes: Uint8Array;
}
</script>

<script setup lang="ts">
import { useIsland } from "bmo-ui/app/domain/island";

import { fileSizeText } from "~/domain/attachments";

import type { SecretField } from "#shared/secret-kinds";

const props = defineProps<{ field: SecretField; file: ChosenFile | null }>();
const emit = defineEmits<{ file: [chosen: ChosenFile | null] }>();
const text = defineModel<string>("text", { default: "" });

const { t } = useI18n();
const island = useIsland(t);
const picker = useTemplateRef<HTMLInputElement>("picker");

// A several-line field takes the file as its text; a file field keeps the bytes as they are.
async function onPick(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const chosen = input.files?.[0];

  input.value = "";

  if (chosen === undefined) return;

  try {
    if (props.field.input === "lines") {
      text.value = await chosen.text();
    } else {
      emit("file", { name: chosen.name, bytes: new Uint8Array(await chosen.arrayBuffer()) });
    }
  } catch {
    island.say({ title: t("secrets.error.file_read_failed"), tone: "warning" });
  }
}
</script>

<style>
/* A several-line value that is hidden stands as dots, as a password box's does. */
.secret-masked textarea {
  -webkit-text-security: disc;
}
</style>
