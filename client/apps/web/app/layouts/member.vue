<template>
  <UDashboardGroup :style="shell">
    <UDashboardSidebar
      id="member"
      v-model:open="open"
      v-model:collapsed="sidebarFolded"
      collapsible
      resizable
      :max-size="Infinity"
      mode="drawer"
      :menu="{ direction: 'left', handle: false, handleOnly: true }"
      :ui="{ content: 'flex-col w-4/5 max-w-xs' }"
    >
      <template #header="{ collapsed }">
        <NuxtLink
          v-if="!collapsed"
          :to="MEMBER_HOME"
          class="flex items-center gap-2 rounded-md px-2.5 py-1 transition-colors hover:bg-elevated active:bg-accented"
        >
          <BmoMark class="size-5 shrink-0" />
          <span class="font-bold text-highlighted">{{ consoleName($t) }}</span>
        </NuxtLink>

        <UTooltip :text="collapsed ? $t('common.action.expand') : $t('common.action.collapse')" :content="{ side: 'right' }">
          <UDashboardSidebarCollapse class="ms-auto hidden lg:flex" />
        </UTooltip>
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu v-if="screenEntries.length > 0" :items="namedWhenFolded(screenEntries, collapsed)" :collapsed="collapsed" tooltip orientation="vertical" />

        <ContentSkeleton v-if="roomsInitial" :rows="3" listClass="flex flex-col" :label="$t('screens.status.rooms_loading')">
          <div class="flex h-8 items-center gap-1.5 px-2.5">
            <SkeletonBar class="size-5 shrink-0 rounded-sm" />
            <SkeletonBar v-if="!collapsed" class="h-4 w-28" />
          </div>
        </ContentSkeleton>
        <p v-if="roomsError" class="text-sm text-error">{{ $t("screens.error.rooms_failed") }}</p>
        <SidebarRooms :rooms="namedWhenFolded(roomEntries, collapsed)" :collapsed="collapsed" />
      </template>

      <template #footer="{ collapsed }">
        <UserMenu :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <div class="relative flex min-h-0 min-w-0 flex-1" v-bind="bundleArea">
      <slot />
    </div>

    <!-- The title bar's one set of buttons, held here and laid into the standing screen's bar, so a page change moves
         them rather than standing them up again (docs/web.md, 「The title bar」). -->
    <Teleport v-if="titleBarTarget !== null" :to="titleBarTarget">
      <ConsoleTitleBarActions />
    </Teleport>
  </UDashboardGroup>
</template>

<script setup lang="ts">
import { useTitleBarTarget } from "~/domain/title-bar";
import { MEMBER_HOME } from "~/domain/access";
import { consoleName } from "#shared/agent-names";
import { useInitialRead } from "bmo-ui/app/domain/loading";
import { SCREEN_FRAME } from "bmo-ui/app/domain/screen";
import { useVisibleShell } from "~/domain/overlay";
import { useRoomList, useRoomReading } from "~/domain/room-list";
import { useBundleArea, useConsoleScreens } from "~/domain/console-screens";
import { broughtScreens, namedWhenFolded, roomItems, screenItems } from "~/domain/screens";

import type { NavigationMenuItem } from "@nuxt/ui";
import type { AvatarIndex } from "~/domain/avatars";

// A member's shell (docs/web.md, 「Access」): the screens units bring that they may open, the rooms they
// may read and their own menu, and nothing that reads a route opened to the administrator alone. It
// frames the screen as the administrator's shell does, so a member's page stands the same way.
// Where the title bar's one set of buttons stands: the standing screen's bar.
const titleBarTarget = useTitleBarTarget();

const shell = SCREEN_FRAME;

useVisibleShell();

const route = useRoute();
// The page area as a bundle's screen stands in it.
const bundleArea = useBundleArea();
const { t } = useI18n();
const open = ref(false);
const sidebarFolded = ref(false);

// Their rooms, each with how many of its messages they have not read, read again whenever a message lands in one
// of them: the one news of the stream this shell hears (docs/web.md, 「Sidebar」).
const { data: rooms, status: roomsStatus, error: roomsError } = useRoomList();
const roomsInitial = useInitialRead(roomsStatus);
const reading = useRoomReading();

// The pictures are read off a route a member is not opened to, so every room wears its letter.
const pictures: AvatarIndex = new Map();

const roomEntries = computed<NavigationMenuItem[]>(() => roomItems(t, rooms.value, pictures, route.path, sidebarFolded.value, reading.value));

// The screens units bring whose manifest opens to a member, as the console's list hands them to this reader.
const screens = broughtScreens(useConsoleScreens().value);
const screenEntries = computed<NavigationMenuItem[]>(() => screenItems(t, route.path, undefined, sidebarFolded.value, screens));
</script>
