<template>
  <UDashboardGroup :style="shell" v-bind="SIDEBAR_GROUP">
    <UDashboardSidebar
      id="member"
      v-model:open="open"
      v-model:collapsed="sidebarFolded"
      collapsible
      resizable
      v-bind="SIDEBAR_WIDTH"
      mode="drawer"
      :menu="{ direction: 'left', handle: false, handleOnly: true }"
      :ui="{ content: 'flex-col w-4/5 max-w-xs', header: sidebarFolded ? 'bmo-window-inset-folded' : 'bmo-window-inset' }"
    >
      <template #header="{ collapsed }">
        <!-- In the desktop app's window the head is the window's drag region beside the title bar, and leaves the room
             of the system's own window buttons where they stand inset (docs/web.md, 「The desktop app's window」). -->
        <div class="flex min-w-0 flex-1 items-center self-stretch" :data-tauri-drag-region="desktopApp === null ? undefined : 'deep'">
          <NuxtLink
            v-if="!collapsed"
            :to="home"
            class="flex items-center gap-2 rounded-md px-2.5 py-1 transition-colors hover:bg-elevated active:bg-accented"
          >
            <BmoMark class="size-5 shrink-0" />
            <span class="font-bold text-highlighted">{{ consoleName($t) }}</span>
          </NuxtLink>

          <UTooltip :text="collapsed ? $t('common.action.expand') : $t('common.action.collapse')" :content="{ side: 'right' }">
            <UDashboardSidebarCollapse class="ms-auto hidden lg:flex" />
          </UTooltip>
        </div>
      </template>

      <template #default="{ collapsed }">
        <!-- The screens' sections they may open, each a menu of its own under its heading (docs/web.md, 「Sidebar」). -->
        <UNavigationMenu
          v-for="section in screenSections"
          :key="section.heading"
          :aria-label="section.heading"
          :items="namedWhenFolded(section.items, collapsed)"
          :collapsed="collapsed"
          tooltip
          orientation="vertical"
        />

        <ContentSkeleton v-if="roomsInitial && roomsRead" :rows="3" listClass="flex flex-col" :label="$t('screens.status.rooms_loading')">
          <div class="flex h-8 items-center gap-1.5 px-2.5">
            <SkeletonBar class="size-5 shrink-0 rounded-sm" />
            <SkeletonBar v-if="!collapsed" class="h-4 w-28" />
          </div>
        </ContentSkeleton>
        <p v-if="roomsError && roomsRead" class="text-sm text-error">{{ $t("screens.error.rooms_failed") }}</p>
        <SidebarRooms v-if="roomsRead" :rooms="namedWhenFolded(roomEntries, collapsed)" :collapsed="collapsed" :openable="roomsWritten" @open="roomOpening = true" />
      </template>

      <template #footer="{ collapsed }">
        <UserMenu :collapsed="collapsed" :screens="screens" :counts="unread" />
      </template>
    </UDashboardSidebar>

    <BundleScreenFrame>
      <slot />
    </BundleScreenFrame>

    <RoomOpenDialog v-model:open="roomOpening" @added="roomOpened" />

    <!-- The title bar's one set of buttons, held here and laid into the standing screen's bar, so a page change moves
         them rather than standing them up again (docs/web.md, 「The title bar」). -->
    <Teleport v-if="titleBarTarget !== null" :to="titleBarTarget">
      <ConsoleTitleBarActions />
    </Teleport>
  </UDashboardGroup>
</template>

<script setup lang="ts">
import { provideConsolePeople } from "~/domain/people-offer";
import { provideConsoleTitleBar, useTitleBarTarget } from "~/domain/title-bar";
import { useDesktopApp } from "~/domain/desktop-app";
import { MEMBER_HOME } from "~/domain/access";
import { consoleName } from "#shared/agent-names";
import { useInitialRead } from "bmo-ui/app/domain/loading";
import { SCREEN_FRAME } from "bmo-ui/app/domain/screen";
import { useVisibleShell } from "~/domain/overlay";
import { useRoomList, useRoomReading } from "~/domain/room-list";
import { useRoomsPresent } from "~/domain/presence";
import { useConsoleScreens } from "~/domain/console-screens";
import { useSectionAccess, useSectionAccessReady } from "~/domain/section-access";
import { featuredScreens, namedWhenFolded, roomItems, screensWithBundles, sectionItems } from "~/domain/screens";
import { useConsoleFeatures } from "~/domain/console-features";
import { SIDEBAR_GROUP, SIDEBAR_WIDTH } from "~/domain/sidebar-width";
import { useSidebarUnread } from "~/domain/sidebar-unread";
import { useKeepsUnits } from "~/domain/organization";
import { accessOf, homeFor, screenMayRead, sectionsOfPath } from "#shared/sections";

import type { NavigationMenuItem } from "@nuxt/ui";
import type { AvatarIndex } from "~/domain/avatars";
import type { SectionMenu } from "~/domain/screens";
import type { RoomAdded } from "#shared/types";

// A member's shell (docs/web.md, 「Access」): the screens units bring that they may open, the rooms they
// may read and their own menu, and nothing that reads a route opened to the administrator alone. It
// frames the screen as the administrator's shell does, so a member's page stands the same way.
// Where the title bar's one set of buttons stands: the standing screen's bar.
const titleBarTarget = useTitleBarTarget();

const shell = SCREEN_FRAME;

useVisibleShell();

const route = useRoute();
// The console's bar, offered to every screen a unit brings.
provideConsoleTitleBar();
provideConsolePeople();
const { t } = useI18n();
const open = ref(false);
// The desktop app the console runs in, where it does (docs/web.md, 「The desktop app's window」).
const desktopApp = useDesktopApp();
const sidebarFolded = ref(false);

// Their rooms, each with how many of its messages they have not read, read again whenever a message lands in one
// of them: the one news of the stream this shell hears (docs/web.md, 「Sidebar」).
const { data: rooms, status: roomsStatus, error: roomsError } = useRoomList();
const roomsInitial = useInitialRead(roomsStatus);
const reading = useRoomReading();
// Who is here and who writes in each room, as the stream tells it (docs/web.md, 「Presence and typing」).
const present = useRoomsPresent();

// The pictures are read off a route a member is not opened to, so every room wears its letter.
const pictures: AvatarIndex = new Map();

const roomEntries = computed<NavigationMenuItem[]>(() => roomItems(t, rooms.value, pictures, route.path, sidebarFolded.value, reading.value, present.value));

// The screens this reader may open: the console's own whose section their permission reads, and the screens units
// bring whose manifest opens to them (docs/web.md, 「Access」). A screen unit-brought and not one of the console's
// own list stands by its manifest's role alone.
const bundles = useConsoleScreens();
const features = useConsoleFeatures();
const access = useSectionAccess();
const accessReady = useSectionAccessReady();
const home = computed(() => (accessReady.value ? homeFor(access.value, screensWithBundles(bundles.value, featuredScreens(features.value)).map((one) => one.to)) : MEMBER_HOME));
// The rooms list is the section's own; a reader whose rooms section is closed sees none of it.
const roomsRead = computed(() => !accessReady.value || accessOf(access.value, "rooms").read);
// A reader whose rooms section writes opens a group room, which stands in the list at once, and the console goes to it.
const roomsWritten = computed(() => accessReady.value && accessOf(access.value, "rooms").write);
const roomOpening = ref(false);

async function roomOpened(room: RoomAdded): Promise<void> {
  await refreshNuxtData("rooms");
  await navigateTo(`/rooms/${room.chatId}`);
}
// The organisation screen stands for a member who heads a unit or writes a unit's org memory (docs/web.md,
// 「Organisation」).
const keepsUnits = useKeepsUnits();
const screens = computed(() =>
  screensWithBundles(bundles.value, featuredScreens(features.value)).filter((screen) => {
    if (screen.administrator === true) return false;
    if (screen.unitKeepers === true) return keepsUnits.value;
    if (sectionsOfPath(screen.to).length === 0) return true;
    if (!accessReady.value) return false;

    return screenMayRead(access.value, screen.to);
  })
);
// The counts the bundles declare, read for this reader while the sidebar stands (docs/web.md, 「Sidebar」).
const unread = useSidebarUnread();
const screenSections = computed<SectionMenu[]>(() => sectionItems(t, route.path, undefined, sidebarFolded.value, screens.value, unread.value));
</script>
