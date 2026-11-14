<template>
  <!-- One member of a room: their face, their name over the status line their chat service read, and the console
       user's mark where the account service knows them as an account (docs/web.md, the room screen's members entry). -->
  <UAvatar v-bind="face" size="md" class="shrink-0" />
  <div class="flex min-w-0 flex-1 flex-col">
    <span class="truncate text-sm text-highlighted">{{ props.member.name }}</span>
    <span v-if="props.member.status !== null" class="truncate text-sm text-muted" data-member-status>{{ props.member.status }}</span>
  </div>
  <UBadge v-if="props.member.account !== null" :label="$t('members.label.console_user')" color="primary" variant="subtle" class="shrink-0" />
</template>

<script setup lang="ts">
import { avatarFor } from "~/domain/avatars";

import type { AvatarIndex } from "~/domain/avatars";
import type { RoomMember } from "#shared/types";

const props = defineProps<{ member: RoomMember; avatars: AvatarIndex }>();

// The picture the archive keeps for the member's person number, else their letter on their own hue; a member with no
// number stands as their letter (docs/web.md, 「Profile photos」).
const face = computed(() => avatarFor(props.avatars, "person", props.member.person, props.member.name));
</script>
