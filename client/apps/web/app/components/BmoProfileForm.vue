<template>
  <!-- The text parts of a BMO profile changed in one form (docs/web.md, 「System and organisation」, its BMO tab, and
       「Settings」, its own-BMO section): the name and the call names; the save at its foot, open only while a part
       differs, and the refusal said in the form. A BMO's persona is its supervisor's own, set on its pieces. -->
  <SettingsDialog v-model:open="open" :title="props.title" :dirty="changes">
    <form :id="formId" class="flex flex-col gap-4" @submit.prevent="save">
      <UFormField :label="$t('bmo_profile.label.name')" name="name">
        <UInput v-model="name" class="w-full" :placeholder="nameShown(t, null)" :maxlength="PROFILE_LIMITS.name" autocomplete="off" data-bmo-name />
      </UFormField>

      <UFormField :label="$t('bmo_profile.label.call_names')" name="callNames">
        <CallNamesField v-model="callNames" />
      </UFormField>

      <p v-if="failure !== ''" role="alert" class="break-words text-sm text-error">{{ failure }}</p>
    </form>

    <template #footer="{ close }">
      <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="busy" @click="close()" />
      <UButton type="submit" :form="formId" :label="$t('common.action.save')" :loading="busy" :disabled="busy || !changes.dirty.value" />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { useOpenedWith } from "bmo-ui/app/domain/form-save";

import { nameShown } from "~/domain/bmo-profile";

import { PROFILE_LIMITS } from "#shared/bmo-profile";

import type { OwnBmoParts } from "#shared/bmo-profile";

interface Props {
  title: string;
  // The parts as they stand when the form opens.
  parts: OwnBmoParts;
  // Saves the parts, throwing the console route's refusal.
  save: (parts: OwnBmoParts) => Promise<void>;
}

const props = defineProps<Props>();
const open = defineModel<boolean>("open", { required: true });
const { t } = useI18n();
const formId = useId();

const name = ref("");
const callNames = ref<string[]>([]);
const busy = ref(false);
const failure = ref("");

const asked = computed<OwnBmoParts>(() => ({
  name: name.value.trim() === "" ? null : name.value.trim(),
  callNames: callNames.value
}));

// What the form asks for.
const changes = useOpenedWith(() => asked.value, { open });

watch(
  open,
  (opened) => {
    if (!opened) return;

    name.value = props.parts.name ?? "";
    callNames.value = [...props.parts.callNames];
    failure.value = "";
  },
  { immediate: true }
);

async function save(): Promise<void> {
  if (!changes.dirty.value) return;

  busy.value = true;
  failure.value = "";

  try {
    await props.save(asked.value);
    open.value = false;
  } catch (error) {
    failure.value = failureText(error, t("bmo_profile.error.failed"));
  } finally {
    busy.value = false;
  }
}
</script>
