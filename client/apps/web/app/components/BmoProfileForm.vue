<template>
  <!-- The text parts of a BMO profile changed in one form (docs/web.md, 「Organisation」, its BMO tab, and
       「Settings」, its own-BMO section): the name, the call names and, for one's own BMO, the persona with its count as
       it nears the ceiling; the save at its foot, open only while a part differs, and the refusal said in the form. -->
  <SettingsDialog v-model:open="open" :title="props.title" :dirty="changes">
    <form :id="formId" class="flex flex-col gap-4" @submit.prevent="save">
      <UFormField :label="$t('bmo_profile.label.name')" name="name">
        <UInput v-model="name" class="w-full" :placeholder="nameShown(t, null)" :maxlength="PROFILE_LIMITS.name" autocomplete="off" data-bmo-name />
      </UFormField>

      <UFormField :label="$t('bmo_profile.label.call_names')" name="callNames">
        <CallNamesField v-model="callNames" />
      </UFormField>

      <UFormField v-if="props.persona" :label="$t('bmo_profile.label.persona')" name="persona" :hint="personaCount">
        <UTextarea v-model="persona" class="w-full" :rows="8" autoresize :maxlength="PROFILE_LIMITS.persona" data-bmo-persona />
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
import { countText } from "~/domain/numbers";

import { PROFILE_LIMITS } from "#shared/bmo-profile";

import type { OwnBmoParts } from "#shared/bmo-profile";

interface Props {
  title: string;
  // The parts as they stand when the form opens.
  parts: OwnBmoParts;
  // Whether the form carries the persona, which only one's own BMO takes.
  persona: boolean;
  // Saves the parts, throwing the console route's refusal.
  save: (parts: OwnBmoParts) => Promise<void>;
}

const props = defineProps<Props>();
const open = defineModel<boolean>("open", { required: true });
const { t } = useI18n();
const formId = useId();

const name = ref("");
const callNames = ref<string[]>([]);
const persona = ref("");
const busy = ref(false);
const failure = ref("");

// The count shows once the persona passes nine tenths of the ceiling.
const personaCount = computed(() => {
  const count = [...persona.value].length;

  return count >= PROFILE_LIMITS.persona * 0.9 ? t("bmo_profile.label.persona_count", { count: countText(count), max: countText(PROFILE_LIMITS.persona) }) : undefined;
});

const asked = computed<OwnBmoParts>(() => ({
  name: name.value.trim() === "" ? null : name.value.trim(),
  callNames: callNames.value,
  persona: props.persona && persona.value.trim() !== "" ? persona.value : props.persona ? null : props.parts.persona
}));

// What the form asks for, the persona only where the form carries it.
const changes = useOpenedWith(() => ({ ...asked.value, persona: props.persona ? asked.value.persona : null }), { open });

watch(
  open,
  (opened) => {
    if (!opened) return;

    name.value = props.parts.name ?? "";
    callNames.value = [...props.parts.callNames];
    persona.value = props.parts.persona ?? "";
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
