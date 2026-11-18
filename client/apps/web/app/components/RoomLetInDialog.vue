<template>
  <!-- A person let into a room (docs/web.md, the room screen's section on opening a room and letting people in): one
       picked from the directory of the reader's company, each found wearing their letter with the dot of their presence
       and its words after their organisation (docs/web.md, 「Presence and typing」), with the switch allowing the call
       standing on so the call into the room is set as they are let in. The account service says who may; a refusal is
       said here and nothing changes. -->
  <SettingsDialog v-model:open="open" :title="$t('members.title.let_in')" :description="props.title">
    <form id="room-let-in-form" class="flex min-w-0 flex-col gap-3" @submit.prevent="void letIn()">
      <UFormField :label="$t('members.label.person')" name="person">
        <ChoiceSelect
          v-model="picked"
          :items="chosen"
          :find="findPeople"
          value-key="value"
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
import { useNowSeconds } from "bmo-ui/app/domain/time";

import { useSignedUser } from "~/domain/access";
import { avatarFor } from "~/domain/avatars";
import { accountEntry, memberPresenceLook, useAccountsPresence } from "~/domain/presence";

import type { AvatarIndex } from "~/domain/avatars";
import type { AvatarProps } from "@nuxt/ui";
import type { PersonView } from "#shared/people";

interface Props {
  chatId: number;
  title: string;
  // The accounts already members, left out of what the search offers.
  members: readonly string[];
}

interface Offered {
  label: string;
  description?: string;
  avatar: AvatarProps;
  value: string;
}

const props = defineProps<Props>();
const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ added: [] }>();

const { t } = useI18n();

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

// Each person found as the menu offers them, with their presence as it stands now.
const accounts = useAccountsPresence();
const signedUser = useSignedUser();
const { now } = useNowSeconds(60_000);
// The directory carries no person number, so each person found wears their letter.
const noPictures: AvatarIndex = new Map();

// A person as the select offers them. Their presence is read as the list draws, so it stays as it stands now while
// the list is open.
function offer(person: PersonView): Offered {
  const presence = () => memberPresenceLook(t, accountEntry(accounts.value, Number(person.user), signedUser.value), now.value * 1000);

  return {
    label: person.name,
    value: person.user,
    get description() {
      const line = [person.organization, presence().line ?? ""].filter((part) => part !== "").join(" · ");

      return line === "" ? undefined : line;
    },
    get avatar() {
      return { ...avatarFor(noPictures, "person", null, person.name), chip: presence().chip };
    }
  };
}

// Everyone a search found since the dialog opened, so the field goes on naming the person picked once the list
// closes, whichever search found them.
const seen = new Map<string, PersonView>();
const chosen = computed<Offered[]>(() => {
  const person = picked.value === undefined ? undefined : seen.get(picked.value);

  return person === undefined ? [] : [offer(person)];
});

// The people the directory finds for the words typed, the room's members left out.
async function findPeople(words: string): Promise<Offered[]> {
  const people = await $fetch<PersonView[]>("/api/people/search", { query: { q: words } });
  const standing = new Set(props.members);
  const offered = people.filter((person) => !standing.has(person.user));

  for (const person of offered) seen.set(person.user, person);

  return offered.map(offer);
}

// Each opening starts empty, the switch standing on.
watch(open, (standing) => {
  if (!standing) return;

  picked.value = undefined;
  seen.clear();
  caller.value = true;
  failure.value = "";
});
</script>
