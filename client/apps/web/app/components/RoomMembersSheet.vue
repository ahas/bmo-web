<template>
  <!-- A room's members (docs/web.md, the room screen's members entry), by either road: each with their face, their name
       and the status line their chat service read, and the mark of a console user, pressed through to that person's
       page, on a member the account service knows as an account. A member it does not know stands as a member alone.
       A reader who may let people in adds one, and a member let in in the console leaves or is taken out from their
       row (the room screen's section on opening a room and letting people in). -->
  <!-- A side sheet on a wide screen, as the room's session sheet is; a bottom drawer on a narrow one, where a panel pulled up to
       consult stands. -->
  <component :is="narrow ? UDrawer : USlideover" v-model:open="open" :title="$t('members.title.sheet')" :description="props.title">
    <template #close="{ ui }">
      <ShellClose :class="ui.close()" @close="open = false" />
    </template>

    <template #body>
      <div v-if="loaded && mayLetIn" class="mb-2 flex justify-end">
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

      <p v-if="loaded && members.length === 0" class="text-sm text-dimmed">{{ $t("members.label.none") }}</p>

      <ul v-else-if="loaded" :class="LIST" data-room-members>
        <li
          v-for="member in members"
          :key="member.person ?? `account:${member.account ?? member.name}`"
          class="flex min-w-0 items-center gap-1"
          :data-room-member="member.person ?? ''"
        >
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
            v-if="member.inConsole && member.account !== null && member.account === mine"
            icon="i-material-symbols-logout"
            :label="$t('members.action.leave')"
            :loading="busy === member.account"
            data-room-leave
            @click="void takeOut(member.account)"
          />
          <IconButton
            v-else-if="member.inConsole && member.account !== null && mayLetIn"
            icon="i-material-symbols-person-remove-outline"
            :label="$t('members.action.take_out')"
            :loading="busy === member.account"
            data-room-take-out
            @click="void takeOut(member.account)"
          />
        </li>
      </ul>
      <p v-if="actFailure !== ''" role="alert" class="mt-2 text-sm text-error">{{ actFailure }}</p>
    </template>
  </component>
  <RoomLetInDialog v-model:open="letInOpen" :chat-id="props.chatId" :title="props.title" :members="memberAccounts" @added="void read()" />
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { useNarrow } from "bmo-ui/app/domain/screen";

import { UDrawer, USlideover } from "#components";

import { useReadFailure } from "~/domain/events";
import { useSignedUser } from "~/domain/access";
import { memberPresence, memberPresenceLook, usePresence } from "~/domain/presence";
import { useNowSeconds } from "bmo-ui/app/domain/time";
import { useSectionAccess } from "~/domain/section-access";
import { mayRead } from "#shared/sections";

import type { AvatarIndex } from "~/domain/avatars";
import type { MemberPresence } from "~/domain/presence";
import type { RoomMember, RoomMembersView } from "#shared/types";

interface Props {
  chatId: number;
  title: string;
  avatars: AvatarIndex;
  administrator: boolean;
}

// The list and each row share one shape, so the skeleton's rows stand where the members land.
const LIST = "flex flex-col gap-1";
const ROW = "flex min-h-12 min-w-0 items-center gap-3 rounded-md px-2 py-2";

const props = defineProps<Props>();
const open = defineModel<boolean>("open", { required: true });
// The reader's own row is left from rather than taken out of, and the room screen goes home once they have left.
const emit = defineEmits<{ left: [] }>();

const { t } = useI18n();
const narrow = useNarrow();
const access = useSectionAccess();

// A person's page is the account section's, so a member is pressed through to it only for a reader who may read
// that section (docs/web.md, 「Person's page」).
const mayOpenPeople = computed<boolean>(() => props.administrator || mayRead(access.value, "account"));

const members = ref<RoomMember[]>([]);
const mayLetIn = ref(false);
const letInOpen = ref(false);
const busy = ref<string | null>(null);
const actFailure = ref("");
const signedUser = useSignedUser();
const mine = computed<string | null>(() => (signedUser.value === null ? null : String(signedUser.value)));
// Each member's presence in the room, as the stream tells it (docs/web.md, 「Presence and typing」); the reader's own
// row carries none.
const presence = usePresence();
const { now } = useNowSeconds(60_000);

function presenceOf(member: RoomMember): MemberPresence {
  return memberPresenceLook(t, memberPresence(presence.value.get(props.chatId), member, signedUser.value), now.value * 1000);
}
const memberAccounts = computed<string[]>(() => members.value.flatMap((member) => member.account ?? []));
const loaded = ref(false);
const pending = ref(false);
const failed = ref("");
let generation = 0;
onScopeDispose(() => { generation++; });

// Each opening reads the members afresh, since the chat service may have read them again since the last look.
async function read(): Promise<void> {
  const mine = ++generation;

  pending.value = true;
  failed.value = "";

  try {
    const answer = await $fetch<RoomMembersView>(`/api/rooms/${props.chatId}/members`);

    if (mine !== generation) return;
    members.value = answer.members;
    mayLetIn.value = answer.mayLetIn;
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
      open.value = false;
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

const failure = useReadFailure({
  failed: () => open.value && failed.value !== "",
  reading: () => pending.value,
  reread: () => void read()
});

watch(open, (standing) => {
  if (!standing) return;

  actFailure.value = "";
  void read();
});
</script>
