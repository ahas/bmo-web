<template>
  <!-- People let into a room, several at once (docs/web.md, the room screen's section on opening a room and letting
       people in): one search finds the people of the reader's directory, each wearing their letter with the dot of
       their presence and its words after their organisation (docs/web.md, 「Presence and typing」), and the
       organisations of the reader's company, each standing for the people it lets in. Each one pressed joins the
       choice, which the field shows as a chip each, an organisation's wearing its mark. Each person let in may call
       their own BMO into the room from then on, membership being the call right. The account service says who may; a
       refusal is said here and nothing changes. -->
  <SettingsDialog :key="openings" v-model:open="open" :title="$t('members.title.let_in')" :description="props.title" :dirty="changes">
    <form id="room-let-in-form" class="flex min-w-0 flex-col gap-3" @submit.prevent="void letIn()">
      <UFormField :label="$t('members.label.choice')" name="choice">
        <ChoiceSelect
          v-model="picked"
          :items="chosen"
          :find="findChoices"
          value-key="value"
          multiple
          class="w-full"
          :placeholder="$t('members.label.find')"
          :aria-label="$t('members.label.choice')"
        >
          <template #default="{ ui }">
            <span v-if="chosen.length === 0" data-slot="placeholder" :class="ui.placeholder()">{{ $t("members.label.find") }}</span>
            <span v-else class="flex min-w-0 flex-wrap gap-1 py-0.5" data-let-in-chosen>
              <UBadge v-for="one in chosen" :key="one.value" color="neutral" variant="outline" :icon="one.icon" class="max-w-full">
                <span class="truncate">{{ one.label }}</span>
              </UBadge>
            </span>
          </template>
        </ChoiceSelect>
      </UFormField>
      <p v-if="failure !== ''" role="alert" class="text-sm text-error">{{ failure }}</p>
    </form>

    <template #footer="{ close }">
      <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" @click="close()" />
      <UButton type="submit" form="room-let-in-form" :label="$t('members.action.let_in')" :disabled="picked.length === 0 || busy" :loading="busy" />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { useOpenedWith } from "bmo-ui/app/domain/form-save";
import { useOpenings } from "bmo-ui/app/domain/openings";
import { useNowSeconds } from "bmo-ui/app/domain/time";
import { matchFields } from "bmo-ui/shared/search";

import { useSignedUser } from "~/domain/access";
import { avatarFor } from "~/domain/avatars";
import { accountEntry, memberPresenceLook, useAccountsPresence } from "~/domain/presence";

import type { AvatarIndex } from "~/domain/avatars";
import type { AvatarProps } from "@nuxt/ui";
import type { PersonView, UnitChoice } from "#shared/people";
import type { SearchField } from "bmo-ui/shared/search";

interface Props {
  chatId: number;
  title: string;
  // The accounts already members, left out of what the search offers.
  members: readonly string[];
}

// One person or organisation the select offers, its value telling the two apart.
interface Offered {
  label: string;
  description?: string;
  avatar?: AvatarProps;
  icon?: string;
  value: string;
}

// A group's heading among what a search found.
interface Heading {
  type: "label";
  label: string;
}

// A person's value is their user id and an organisation's its number, each behind the word for its kind.
const PERSON = "person:";
const UNIT = "unit:";
const UNIT_ICON = "i-material-symbols-groups-outline";

const props = defineProps<Props>();
const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ added: [] }>();

const { t } = useI18n();

const picked = ref<string[]>([]);
const busy = ref(false);
const failure = ref("");

// Mounted afresh at each opening, so it stands over the members sheet it is opened from, which a narrow screen draws as
// a drawer mounted after it (docs/web.md, 「Floating things」).
const openings = useOpenings(() => open.value);
// Closing asks first while the dialog holds a choice not yet let in.
const changes = useOpenedWith(() => picked.value, { open });

async function letIn(): Promise<void> {
  if (picked.value.length === 0) return;

  const asked = {
    accounts: picked.value.filter((value) => value.startsWith(PERSON)).map((value) => value.slice(PERSON.length)),
    units: picked.value.filter((value) => value.startsWith(UNIT)).map((value) => Number(value.slice(UNIT.length)))
  };

  busy.value = true;
  failure.value = "";

  try {
    await $fetch(`/api/rooms/${props.chatId}/accounts`, { method: "POST", body: asked });
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

// Where a row matched in what it does not show, told at the end of the line under it so the hit stands on the screen
// (docs/web.md, 「List search」); nothing where the row shows what matched.
function hiddenMatch(fields: SearchField[], words: string): string {
  const hidden = matchFields(fields, words)?.hidden ?? null;

  return hidden === null ? "" : `${hidden.label} ${hidden.snippet}`;
}

// A person as the select offers them. Their presence is read as the list draws, so it stays as it stands now while
// the list is open.
function offerPerson(person: PersonView, words: string): Offered {
  const presence = () => memberPresenceLook(t, accountEntry(accounts.value, Number(person.user), signedUser.value), now.value * 1000);
  const hidden = hiddenMatch(
    [
      { label: t("people.label.name"), text: person.name, shown: true },
      { label: t("people.label.organization"), text: person.organization, shown: true },
      { label: t("people.label.job_title"), text: person.jobTitle, shown: false },
      { label: t("people.label.rank"), text: person.rank, shown: false },
      { label: t("people.label.position"), text: person.role?.name, shown: false },
      { label: t("people.label.duty"), text: person.duty, shown: false },
      { label: t("people.label.landline"), text: person.landline, shown: false },
      { label: t("people.label.mobile"), text: person.mobile, shown: false },
      { label: t("people.label.email"), text: person.email, shown: false }
    ],
    words
  );

  return {
    label: person.name,
    value: `${PERSON}${person.user}`,
    get description() {
      const line = [person.organization, presence().line ?? "", hidden].filter((part) => part !== "").join(" · ");

      return line === "" ? undefined : line;
    },
    get avatar() {
      return { ...avatarFor(noPictures, "person", null, person.name), chip: presence().chip };
    }
  };
}

// An organisation as the select offers it, under the units above it with how many people it lets in.
function offerUnit(unit: UnitChoice, words: string): Offered {
  const hidden = hiddenMatch(
    [
      { label: t("people.label.organization"), text: unit.name, shown: true },
      { label: t("organization.label.short_name"), text: unit.shortName, shown: false }
    ],
    words
  );
  const count = t("members.label.unit_people", { count: unit.people.toLocaleString("ko-KR") });

  return {
    label: unit.name,
    description: [unit.path.join(" › "), count, hidden].filter((part) => part !== "").join(" · "),
    icon: UNIT_ICON,
    value: `${UNIT}${unit.id}`
  };
}

// Everything a search found since the dialog opened, so the field goes on naming what was chosen once the list closes,
// whichever search found it.
const seen = new Map<string, Offered>();
const chosen = computed<Offered[]>(() => picked.value.flatMap((value) => seen.get(value) ?? []));

// The people the directory finds for the words typed, the room's members left out, and the organisations of the
// reader's company, each group under its heading where it found anything.
async function findChoices(words: string): Promise<(Offered | Heading)[]> {
  const [people, units] = await Promise.all([
    $fetch<PersonView[]>("/api/people/search", { query: { q: words } }),
    $fetch<UnitChoice[]>("/api/people/units", { query: { q: words } }).catch(() => [])
  ]);
  const standing = new Set(props.members);
  const groups = [
    { label: t("members.label.person"), items: people.filter((person) => !standing.has(person.user)).map((person) => offerPerson(person, words)) },
    { label: t("members.label.unit"), items: units.map((unit) => offerUnit(unit, words)) }
  ].filter((group) => group.items.length > 0);

  for (const one of groups.flatMap((group) => group.items)) seen.set(one.value, one);

  return groups.flatMap((group) => [{ type: "label" as const, label: group.label }, ...group.items]);
}

// Each opening starts empty.
watch(open, (standing) => {
  if (!standing) return;

  picked.value = [];
  seen.clear();
  failure.value = "";
});
</script>
