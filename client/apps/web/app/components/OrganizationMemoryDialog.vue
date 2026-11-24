<template>
  <!-- A unit's memory written or edited (docs/web.md, 「Organisation」, the org memory tab, the memory form): its
       text, its topic, the person it is about where it is one, and its two marks, written by its one save. -->
  <SettingsDialog v-model:open="open" :title="props.title" :dirty="changes">
    <UForm id="org-memory-form" :state="draft" class="flex flex-col gap-4" @submit="save">
      <UFormField :label="$t('org_memory.label.text')" :help="$t('org_memory.label.text_help')" name="text" required>
        <UTextarea v-model="draft.text" class="w-full" :rows="4" autoresize :maxlength="TEXT_LIMIT" data-org-memory-text />
      </UFormField>
      <UFormField :label="$t('org_memory.label.topic')" name="topic">
        <ChoiceSelect v-model="draft.topic" :items="topicItems" create-item class="w-full" :aria-label="$t('org_memory.label.topic')" data-org-memory-topic />
      </UFormField>
      <UFormField v-if="!props.platform" :label="$t('org_memory.label.person')" :help="$t('org_memory.label.person_help')" name="about">
        <ChoiceSelect v-model="draft.about" :items="personItems" value-key="value" class="w-full" :aria-label="$t('org_memory.label.person')" data-org-memory-person />
      </UFormField>
      <UFormField :label="$t('org_memory.label.locked')" :help="$t('org_memory.label.locked_help')" name="locked">
        <USwitch v-model="draft.locked" data-org-memory-locked />
      </UFormField>
      <UFormField v-if="!props.platform" :label="$t('org_memory.label.internal')" :help="$t('org_memory.label.internal_help')" name="internalOnly">
        <USwitch v-model="draft.internalOnly" data-org-memory-internal />
      </UFormField>
      <UAlert v-if="failure !== ''" color="error" variant="subtle" :description="failure" class="whitespace-pre-line" />
    </UForm>

    <template #footer="{ close }">
      <UButton color="neutral" variant="ghost" :label="$t('common.action.cancel')" @click="close()" />
      <UButton type="submit" form="org-memory-form" :label="$t('common.action.save')" :loading="busy" :disabled="busy || !ready || !changes.dirty.value" data-org-memory-save />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { useOpenedWith } from "bmo-ui/app/domain/form-save";

import { topicKey } from "#shared/org-memory";

import type { OrgMemory, OrgMemoryDraft, OrgMemoryPerson } from "#shared/org-memory";

interface Props {
  title: string;
  // The topics the units of the path already hold, offered so a unit's memory overrides an inherited one by the same
  // word.
  topics: readonly string[];
  // The people standing in the unit or under it, whom a memory may be about.
  people?: readonly OrgMemoryPerson[];
  // The memory as it stands where one is edited; null for a new one.
  saved?: OrgMemory | null;
  // Where the form's draft goes: written for a new memory, a version for one edited.
  send: (draft: OrgMemoryDraft) => Promise<void>;
  // Whether the memory is the base's, which holds none about a person and keeps none from a room.
  platform?: boolean;
}

const props = withDefaults(defineProps<Props>(), { saved: null, people: () => [], platform: false });
const emit = defineEmits<{ saved: [] }>();
const open = defineModel<boolean>("open", { default: false });

const { t } = useI18n();

// The brain takes a memory's text up to this many characters (bmo-brain's `docs/boundary-api.md`, 「Strings」).
const TEXT_LIMIT = 64000;

// The person choice's value for a memory about no one.
const NOBODY = "";

const draft = reactive({ text: "", topic: "", locked: false, internalOnly: true, about: NOBODY });
const busy = ref(false);
const failure = ref("");

const topicItems = computed(() => [...new Set([...props.topics, ...(draft.topic === "" ? [] : [draft.topic])])]);
const personItems = computed(() => [
  { label: t("org_memory.label.person_none"), value: NOBODY },
  ...props.people.map((person) => ({ label: person.name, value: person.user }))
]);
const ready = computed(() => draft.text.trim() !== "");
const changes = useOpenedWith(() => draft, { open });

// Every opening starts from the memory as it stands, or from a new one, kept inside the company at first.
watch(open, (now) => {
  if (!now) return;

  const saved = props.saved;

  Object.assign(draft, { text: saved?.text ?? "", topic: saved?.topic ?? "", locked: saved?.locked ?? false, internalOnly: props.platform ? false : (saved?.internalOnly ?? true), about: saved?.about?.user ?? NOBODY });
  failure.value = "";
});

async function save(): Promise<void> {
  if (!ready.value || !changes.dirty.value || busy.value) return;

  busy.value = true;
  failure.value = "";
  try {
    await props.send({ text: draft.text.trim(), topic: topicKey(draft.topic), locked: draft.locked, internalOnly: draft.internalOnly, about: draft.about === NOBODY ? null : draft.about });
    await changes.take();
    open.value = false;
    emit("saved");
  } catch (error) {
    failure.value = failureText(error, t("org_memory.error.failed"));
  } finally {
    busy.value = false;
  }
}
</script>
