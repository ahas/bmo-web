<template>
  <UDashboardPanel id="rooms">
    <template #header>
      <ConsoleTitleBar :title="$t('common.label.room')" />
    </template>

    <template #body>
      <UAlert v-if="error" color="error" variant="subtle" :description="$t('common.error.rooms_failed')" />
      <!-- The read is this browser's own, so the server stands where nobody has asked yet and the
           browser where it is asking: both draw the placeholder, and only an answer that came back
           says there are no rooms. -->
      <ContentSkeleton v-else-if="!loaded" :rows="4" listClass="flex flex-col gap-2" :label="$t('common.status.rooms_loading')">
        <div class="flex items-start gap-3 rounded-lg border border-default px-4 py-3">
          <SkeletonBar class="size-6 shrink-0 rounded-full" />
          <div class="flex min-w-0 grow flex-col gap-1">
            <SkeletonLine width="w-2/5" />
          </div>
          <div class="flex shrink-0 flex-col items-end gap-1">
            <SkeletonLine width="w-10" />
            <SkeletonLine width="w-20" />
          </div>
        </div>
      </ContentSkeleton>
      <p v-else-if="rooms.length === 0" class="text-sm text-muted">{{ $t("common.status.no_rooms") }}</p>

      <MovingList v-if="loaded && rooms.length > 0" class="flex flex-col gap-2">
        <li v-for="room in rooms" :key="room.chatId">
          <NuxtLink
            class="flex items-start gap-3 rounded-lg border border-default px-4 py-3 transition-colors hover:bg-elevated active:bg-accented"
            :to="`/rooms/${room.chatId}`"
          >
            <UAvatar v-bind="{ ...roomFace(pictures, room), chip: presenceChip(roomPresence(present.presence.get(room.chatId), present.me)) }" size="sm" />
            <p class="min-w-0 grow truncate text-sm font-medium">{{ room.title }}</p>
            <!-- While somebody writes in the room, a still mark after its name (docs/web.md, 「Presence and typing」). -->
            <UIcon
              v-if="typingPeople(present.typing.get(room.chatId), present.me).length > 0"
              name="i-material-symbols-more-horiz"
              class="size-5 shrink-0 text-muted"
              data-room-typing
              role="img"
              :aria-label="$t('screens.aria.room_typing')"
            />
            <div class="shrink-0 text-right text-sm text-muted">
              <RollingSentence tag="p" :keypath="'common.label.count'" :figures="{ n: room.messageCount }" />
              <p>{{ room.lastMessageAt === null ? $t("common.label.no_record") : formatStamp(room.lastMessageAt) }}</p>
            </div>
          </NuxtLink>
        </li>
      </MovingList>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { useAdministrator } from "~/domain/access";
import { roomFace, useAgentAvatars } from "~/domain/agent-face";
import { presenceChip, roomPresence, typingPeople, useRoomsPresent } from "~/domain/presence";
import { formatStamp } from "bmo-ui/app/domain/time";

import type { RoomSummary } from "#shared/types";
import type { AvatarIndex } from "~/domain/avatars";

// The rooms the one signed in may read, and a member's home (docs/web.md, 「Access」): each room's
// name, how many messages it holds and when the last was said, read off the room list alone so
// nothing on it waits on what a member is not opened to.
definePageMeta({ member: true });

const { data, status, error } = useFetch<RoomSummary[]>("/api/rooms", {
  key: "rooms",
  lazy: true,
  server: false,
  default: () => []
});
const loaded = ref(status.value === "success");
watch(status, (value) => { if (value === "success") loaded.value = true; });

const rooms = computed<RoomSummary[]>(() => data.value ?? []);
// Who is here and who writes in each room, as the stream tells it.
const present = useRoomsPresent();

// The pictures are read off a route a member is not opened to, so for a member every room wears its
// letter. Who is signed in does not change while the page stands, so the read is asked or not once.
const pictures = useAdministrator().value ? useAgentAvatars() : computed<AvatarIndex>(() => new Map());
</script>
