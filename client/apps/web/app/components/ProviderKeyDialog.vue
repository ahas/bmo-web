<template>
  <!-- One provider's key written where it reads it (docs/web.md, 「Administration」, the providers tab): a hidden field
       whose value goes under the provider's key file in the administrator's secret space, replacing what stood. The
       key is never read back; a refusal is said here in the pack's sentence. -->
  <SettingsDialog v-model:open="open" :title="$t('agents.title.key_of', { name: props.label })" :description="props.file" :dirty="value !== ''">
    <form :id="formId" class="flex flex-col gap-4" @submit.prevent="save">
      <UFormField :label="$t('agents.label.key')" name="key">
        <UInput v-model="value" type="password" autocomplete="off" class="w-full font-mono" :aria-label="$t('agents.label.key')" />
      </UFormField>
      <p v-if="failed !== ''" role="alert" class="break-words text-sm text-error">{{ failed }}</p>
    </form>

    <template #footer="{ close }">
      <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="saving" @click="close()" />
      <UButton type="submit" :form="formId" :label="$t('common.action.save')" :loading="saving" :disabled="saving || value === ''" />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

interface Props {
  // The provider's name in the pack's words, and the file under the data root's env/ it reads its key from.
  label: string;
  file: string;
}

const props = defineProps<Props>();
const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ kept: [] }>();
const { t } = useI18n();

const formId = useId();
const value = ref("");
const saving = ref(false);
const failed = ref("");

// Each opening starts empty, so nothing typed before stands in the field.
watch(open, (now) => {
  if (!now) return;

  value.value = "";
  failed.value = "";
});

async function save(): Promise<void> {
  if (value.value === "") return;

  saving.value = true;
  failed.value = "";

  try {
    await $fetch("/api/secrets", { method: "POST", body: { name: props.file, value: value.value.trim(), replace: true } });
    value.value = "";
    open.value = false;
    emit("kept");
  } catch (error) {
    failed.value = failureText(error, t("common.error.save_failed"));
  } finally {
    saving.value = false;
  }
}
</script>
