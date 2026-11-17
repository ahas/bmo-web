<template>
  <!-- One member of a room: their face with the dot of their presence, their name over their presence in words and the
       status line their chat service read, and the console user's mark where the account service knows them as an
       account (docs/web.md, the room screen's members entry, 「Presence and typing」). -->
  <UAvatar v-bind="face" size="md" class="shrink-0" />
  <div class="flex min-w-0 flex-1 flex-col">
    <span class="truncate text-sm text-highlighted">{{ props.member.name }}</span>
    <span v-if="props.presence?.line" class="truncate text-sm text-muted" data-member-presence>{{ props.presence.line }}</span>
    <span v-if="props.member.status !== null" class="truncate text-sm text-muted" data-member-status>{{ props.member.status }}</span>
  </div>
  <UBadge v-if="props.member.account !== null" :label="$t('members.label.console_user')" color="primary" variant="subtle" class="shrink-0" />
</template>

<script setup lang="ts">
import { avatarFor } from "~/domain/avatars";

import type { AvatarIndex } from "~/domain/avatars";
import type { MemberPresence } from "~/domain/presence";
import type { RoomMember } from "#shared/types";

// The member's presence, as the sheet reads it from the room's: the dot on the face and the words under the name.
const props = defineProps<{ member: RoomMember; avatars: AvatarIndex; presence?: MemberPresence }>();

// The picture the archive keeps for the member's person number, else their letter on their own hue; a member with no
// number stands as their letter (docs/web.md, 「Profile photos」). Its corner carries the member's presence.
const face = computed(() => {
  const picture = avatarFor(props.avatars, "person", props.member.person, props.member.name);

  return props.presence === undefined ? picture : { ...picture, chip: props.presence.chip };
});
</script>
