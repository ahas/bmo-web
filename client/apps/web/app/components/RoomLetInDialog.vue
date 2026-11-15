<template>
  <!-- A person let into a room (docs/web.md, the room screen's section on opening a room and letting people in): one
       picked from the directory of the reader's company, with the switch allowing the call standing on so the call
       into the room is set as they are let in. The account service says who may; a refusal is said here and nothing
       changes. -->
  <SettingsDialog v-model:open="open" :title="$t('members.title.let_in')" :description="props.title">
    <form id="room-let-in-form" class="flex min-w-0 flex-col gap-3" @submit.prevent="void letIn()">
      <UFormField :label="$t('members.label.person')" name="person">
        <USelectMenu
          v-model="picked"
          v-model:search-term="term"
          :items="found"
          value-key="value"
          ignore-filter
          :loading="finding"
          class="w-full"
          :placeholder="$t('members.label.find')"
          :aria-label="$t('members.label.person')"
        />
      </UFormField>
      <USwitch v-model="caller" :label="$t('callers.label.allow')" />
      <p v-if="failure !== ''" role="alert" class="text-sm text-error">{{ failure }}</p>
    </form>

    <template #footer="{ close }">
      <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" @click="close()" />
      <UButton type="submit" form="room-let-in-form" :label="$t('members.action.let_in')" :disabled="picked === undefined || busy" :loading="busy" />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import type { PersonView } from "#shared/people";

interface Props {
  chatId: number;
  title: string;
  // The accounts already members, left out of what the search offers.
  members: readonly string[];
}

interface Found {
  label: string;
  value: string;
}

const props = defineProps<Props>();
const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ added: [] }>();

const { t } = useI18n();

const term = ref("");
const found = ref<Found[]>([]);
const finding = ref(false);
const picked = ref<string | undefined>(undefined);
const caller = ref(true);
const busy = ref(false);
const failure = ref("");

async function letIn(): Promise<void> {
  const user = picked.value;

  if (user === undefined) return;

  busy.value = true;
  failure.value = "";

  try {
    await $fetch(`/api/rooms/${props.chatId}/accounts/${user}`, { method: "PUT", body: { caller: caller.value } });
    emit("added");
    open.value = false;
  } catch (error) {
    failure.value = failureText(error, t("members.error.entry_failed"));
  } finally {
    busy.value = false;
  }
}

let asked = 0;

watch(term, async (words) => {
  const mine = ++asked;

  if (words.trim() === "") {
    found.value = [];
    return;
  }

  finding.value = true;

  try {
    const people = await $fetch<PersonView[]>("/api/people/search", { query: { q: words } });

    if (mine !== asked) return;

    const standing = new Set(props.members);

    found.value = people
      .filter((person) => !standing.has(person.user))
      .map((person) => ({ label: person.organization === "" ? person.name : `${person.name} · ${person.organization}`, value: person.user }));
  } catch {
    if (mine === asked) found.value = [];
  } finally {
    if (mine === asked) finding.value = false;
  }
});

// Each opening starts empty, the switch standing on.
watch(open, (standing) => {
  if (!standing) return;

  picked.value = undefined;
  term.value = "";
  caller.value = true;
  failure.value = "";
});
</script>
