<template>
  <!-- A room's members, the room information's members tab (docs/web.md, the room screen's members entry), by either road: each with their face, their name
       and the status line their chat service read, and the mark of a console user, pressed through to that person's
       page, on a member the account service knows as an account. A member it does not know stands as a member alone.
       A reader who may let people in adds them, the room's menu opening the same dialog over this tab, and a member let
       in in the console leaves, or is taken out by a reader who may take members out, from their row (the room
       screen's section on opening a room and letting people in). Under a member the console knows as an account stands
       what that member may do to the room's people besides being one, which a reader the receiver would take such a
       writing from sets there, and nobody else sees. -->
  <div class="flex min-w-0 flex-col">
    <RoomSupervisorsSection v-if="props.manages" :chat-id="props.chatId" />
    <!-- A room a messenger carries takes its people from the messenger, which this line says in place of the add. -->
    <p v-if="loaded && entry.messenger" class="mb-2 text-sm text-muted" data-room-messenger-members>{{ $t("members.label.messenger_room") }}</p>
    <div v-else-if="loaded && entry.letIn" class="mb-2 flex justify-end">
      <UButton size="sm" icon="i-material-symbols-person-add-outline" :label="$t('members.action.let_in')" data-room-let-in @click="letInOpen = true" />
    </div>

    <!-- One row while the first read runs: every room a chat service reads holds at least the account reading it,
         so the list that lands is never shorter than this. -->
    <ContentSkeleton v-if="!loaded && pending" :rows="1" :list-class="LIST" :label="$t('members.status.loading')">
      <div :class="ROW">
        <USkeleton class="size-8 shrink-0 rounded-full" />
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <SkeletonBar class="h-4 w-32" />
          <SkeletonBar class="h-4 w-48" />
        </div>
      </div>
    </ContentSkeleton>

    <ReadFailure :failure="failure" :message="failed" :reading="pending" @retry="read()" />

    <!-- No members at all, with one line on why where the room's chat service gave none. -->
    <div v-if="loaded && members.length === 0" class="flex flex-col gap-1 text-sm text-dimmed" data-room-members-none>
      <p>{{ $t("members.label.none") }}</p>
      <p v-if="noneReason !== null">{{ noneReason }}</p>
    </div>

    <ul v-else-if="loaded" :class="LIST" data-room-members>
      <li
        v-for="member in members"
        :key="member.person ?? `account:${member.account ?? member.name}`"
        class="flex min-w-0 flex-col"
        :data-room-member="member.person ?? ''"
      >
        <div class="flex min-w-0 items-start gap-1">
          <NuxtLink
            v-if="member.account !== null && mayOpenPeople"
            :to="`/people/${member.account}`"
            :class="[ROW, 'min-w-0 flex-1 transition-colors hover:bg-elevated active:bg-accented focus-inset']"
            :data-console-user="member.account"
          >
            <RoomMemberLine :member="member" :avatars="props.avatars" :presence="presenceOf(member)" />
          </NuxtLink>
          <div v-else :class="[ROW, 'min-w-0 flex-1']" :data-console-user="member.account ?? undefined">
            <RoomMemberLine :member="member" :avatars="props.avatars" :presence="presenceOf(member)" />
          </div>
          <IconButton
            v-if="member.inConsole && member.account !== null && member.account === mine && entry.leaves"
            icon="i-material-symbols-logout"
            class="mt-2"
            :label="$t('members.action.leave')"
            :loading="busy === member.account"
            data-room-leave
            @click="void takeOut(member.account)"
          />
          <IconButton
            v-else-if="member.inConsole && member.account !== null && member.account !== mine && entry.takeOut"
            icon="i-material-symbols-person-remove-outline"
            class="mt-2"
            :label="$t('members.action.take_out')"
            :loading="busy === member.account"
            data-room-take-out
            @click="void takeOut(member.account)"
          />
        </div>
        <!-- What this member may do to the room's people beyond what being a member gives them, which a reader who
             may hand it out sets here: each right's own word beside its switch, the change going as it is made and
             standing as the receiver keeps it. The line stands under the member it names, on the member's own
             column, and only where the receiver would take this reader's writing of it. -->
        <div
          v-if="mayGrant && member.grants !== null && member.account !== mine && !entry.messenger"
          class="flex flex-wrap items-center gap-x-4 gap-y-2 pb-2 pl-13"
          role="group"
          :aria-label="$t('members.label.rights')"
          data-member-rights
        >
          <span class="text-sm text-muted">{{ $t("members.label.rights") }}</span>
          <span v-for="offered in RIGHTS" :key="offered.right" class="flex items-center gap-2" :data-member-right="offered.right">
            <span class="text-sm text-toned">{{ $t(offered.label) }}</span>
            <USwitch
              :model-value="member.grants?.[offered.key] === true"
              :aria-label="$t(offered.aria, { name: member.name })"
              :loading="granting === `${member.account}:${offered.key}`"
              :disabled="granting !== ''"
              @update:model-value="(on: boolean) => void setRight(member, offered, on)"
            />
          </span>
        </div>
      </li>
    </ul>
    <p v-if="actFailure !== ''" role="alert" class="mt-2 text-sm text-error">{{ actFailure }}</p>
    <!-- The dialog floats over the screen wherever it is written; it stands inside the tab so the tab is one element,
         which the room information shows and hides whole. -->
    <RoomLetInDialog v-model:open="letInOpen" :chat-id="props.chatId" :title="props.title" :members="memberAccounts" @added="void read()" />
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import { useReadFailure } from "~/domain/events";
import { useSignedUser } from "~/domain/access";
import { memberPresence, memberPresenceLook, useAccountsPresence, usePresence } from "~/domain/presence";
import { useNowSeconds } from "bmo-ui/app/domain/time";
import { useSectionAccess } from "~/domain/section-access";
import { mayRead } from "#shared/sections";

import type { AvatarIndex } from "~/domain/avatars";
import type { MemberPresence } from "~/domain/presence";
import type { RoomChatMembers, RoomEntry, RoomGrants, RoomMember, RoomMembersView, RoomRight } from "#shared/types";

// One right of a member, with its words on the row and the key the receiver keeps it under.
interface OfferedRight {
  right: RoomRight;
  key: keyof RoomGrants;
  label: string;
  aria: string;
}

interface Props {
  chatId: number;
  title: string;
  avatars: AvatarIndex;
  administrator: boolean;
  // Whether the reader is the owner in a room he may change, who sees and sets the supervisors that answer it.
  manages?: boolean;
}

// The list and each row share one shape, so the skeleton's rows stand where the members land. A row holds its picture
// and its button to its top, each 8px in, so a member of several lines keeps them beside the name's line, and a row of
// one line still stands them on its centre.
const LIST = "flex flex-col gap-1";
const ROW = "flex min-h-12 min-w-0 items-start gap-3 rounded-md px-2 py-2";

const props = defineProps<Props>();
// The reader's own row is left from rather than taken out of, and the room screen goes home once they have left.
const emit = defineEmits<{ left: [] }>();

const { t } = useI18n();
const access = useSectionAccess();

// A person's page is the account section's, so a member is pressed through to it only for a reader who may read
// that section (docs/web.md, 「Person's page」).
const mayOpenPeople = computed<boolean>(() => props.administrator || mayRead(access.value, "account"));

const members = ref<RoomMember[]>([]);
const entry = ref<RoomEntry>({ letIn: false, takeOut: false, messenger: false, leaves: false });
// Whether this reader may hand a member the rights of letting people in and taking members out, as the receiver says
// it beside the rights themselves.
const mayGrant = ref(false);
const chatMembers = ref<RoomChatMembers>("listed");

// The two rights of the room's people a manager may hand out, each with the words it wears on the row and the key the
// routes name it by.
const RIGHTS: readonly OfferedRight[] = [
  { right: "let-in", key: "letIn", label: "members.label.right_let_in", aria: "members.aria.right_let_in" },
  { right: "take-out", key: "takeOut", label: "members.label.right_take_out", aria: "members.aria.right_take_out" }
];

// Why a room with no members has none of its chat service's, where its chat service gave none.
const noneReason = computed<string | null>(() => {
  switch (chatMembers.value) {
    case "no-service":
      return t("members.label.no_service");
    case "unlisted":
      return t("members.label.unlisted");
    case "listed":
      return null;
  }
});
// The dialog that lets people in, which the room's menu opens too.
const letInOpen = defineModel<boolean>("letIn", { default: false });
const busy = ref<string | null>(null);
// The right change under way, by its member and right, so no second one is written beside it.
const granting = ref("");
const actFailure = ref("");
const signedUser = useSignedUser();
const mine = computed<string | null>(() => (signedUser.value === null ? null : String(signedUser.value)));
// Each member's presence in the room, as the stream tells it, and for an account the room tells nothing of, as the
// stream hands it by account (docs/web.md, 「Presence and typing」); the reader's own row carries none.
const presence = usePresence();
const accountsPresence = useAccountsPresence();
const { now } = useNowSeconds(60_000);

function presenceOf(member: RoomMember): MemberPresence {
  return memberPresenceLook(t, memberPresence(presence.value.get(props.chatId), member, signedUser.value, accountsPresence.value), now.value * 1000);
}
const memberAccounts = computed<string[]>(() => members.value.flatMap((member) => member.account ?? []));
const loaded = ref(false);
const pending = ref(false);
const failed = ref("");
let generation = 0;
onScopeDispose(() => { generation++; });

// Each opening of the room information reads the members afresh, since the chat service may have read them again since the last look.
async function read(): Promise<void> {
  const mine = ++generation;

  pending.value = true;
  failed.value = "";

  try {
    const answer = await $fetch<RoomMembersView>(`/api/rooms/${props.chatId}/members`);

    if (mine !== generation) return;
    members.value = answer.members;
    entry.value = answer.entry;
    mayGrant.value = answer.mayGrant;
    chatMembers.value = answer.chatMembers;
    loaded.value = true;
  } catch (error) {
    if (mine !== generation) return;
    failed.value = failureText(error, t("members.error.load_failed"));
  } finally {
    if (mine === generation) pending.value = false;
  }
}

// A member taken out, or the reader leaving; a refusal is said under the list, which stands as it was.
async function takeOut(account: string): Promise<void> {
  busy.value = account;
  actFailure.value = "";

  try {
    await $fetch(`/api/rooms/${props.chatId}/accounts/${account}`, { method: "DELETE" });

    if (account === mine.value) {
      emit("left");
      return;
    }

    await read();
  } catch (error) {
    actFailure.value = failureText(error, t("members.error.entry_failed"));
  } finally {
    busy.value = null;
  }
}

// One member's right in the room given or taken back. The switch stands as it was pressed while the write runs and as
// the receiver answers it once the write is through; a refusal puts it back and is said under the list, which stands
// as it was.
async function setRight(member: RoomMember, offered: OfferedRight, on: boolean): Promise<void> {
  const stood = member.grants;

  if (member.account === null || stood === null || granting.value !== "") return;

  const account = member.account;
  const at = `/api/rooms/${props.chatId}/accounts/${account}/grants`;

  member.grants = heldAs(stood, offered.key, on);
  granting.value = `${account}:${offered.key}`;
  actFailure.value = "";

  try {
    if (on) {
      member.grants = await $fetch<RoomGrants>(at, { method: "PUT", body: { right: offered.right } });
    } else {
      await $fetch(at, { method: "DELETE", query: { right: offered.right } });
      member.grants = heldAs(stood, offered.key, false);
    }
  } catch (error) {
    member.grants = stood;
    actFailure.value = failureText(error, t(on ? "members.error.grant_failed" : "members.error.grant_revoke_failed"));
  } finally {
    granting.value = "";
  }
}

// What a member holds with one right stood as given or taken back.
function heldAs(held: RoomGrants, key: keyof RoomGrants, on: boolean): RoomGrants {
  return key === "letIn" ? { ...held, letIn: on } : { ...held, takeOut: on };
}

const failure = useReadFailure({
  failed: () => failed.value !== "",
  reading: () => pending.value,
  reread: () => void read()
});

onMounted(() => void read());
</script>
