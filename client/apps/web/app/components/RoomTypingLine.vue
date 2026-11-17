<!-- The line under a room's input box naming who is writing in the room now (docs/web.md, 「Presence and typing」).
     It keeps its height whether or not anybody writes, so nothing above or beside it moves as people start and stop;
     its words shimmer as a turn's state does, and stand still for a reader who asked for less motion. -->
<template>
  <p class="h-5 min-w-0 truncate text-sm leading-5" role="status" data-typing-line>
    <UChatShimmer v-if="words !== null" :text="words" />
  </p>
</template>

<script setup lang="ts">
import { useSignedUser } from "~/domain/access";
import { typingPeople, typingWords, useTyping, whoKey } from "~/domain/presence";

import type { PresenceWho, RoomMember, RoomMembersView } from "#shared/types";

const props = defineProps<{ chatId: number }>();

const { t } = useI18n();
const typing = useTyping();
const me = useSignedUser();

const writers = computed<PresenceWho[]>(() => typingPeople(typing.value.get(props.chatId), me.value));

// The names are the room's members' (docs/web.md, the room screen's members), read once, when a mark first stands
// here; a read that fails leaves the writers unnamed.
const members = ref<RoomMember[] | null>(null);
let asked = false;

watch(
  () => writers.value.length > 0,
  (writing) => {
    if (!writing || asked) return;

    asked = true;
    $fetch<RoomMembersView>(`/api/rooms/${props.chatId}/members`)
      .then((view) => { members.value = view.members; })
      .catch(() => { members.value = []; });
  },
  { immediate: true }
);

const names = computed<Map<string, string>>(() => {
  const named = new Map<string, string>();

  for (const member of members.value ?? []) {
    if (member.account !== null) named.set(whoKey({ kind: "account", account: Number(member.account) }), member.name);
  }

  return named;
});

// A person of a chat service is named by the member standing under their number on any service of the room.
function nameOf(who: PresenceWho): string | null {
  if (who.kind === "person") return (members.value ?? []).find((member) => member.person === who.personId)?.name ?? null;

  return names.value.get(whoKey(who)) ?? null;
}

const words = computed<string | null>(() => typingWords(t, writers.value.map(nameOf)));
</script>
