<template>
  <UDashboardGroup :style="shell">
    <UDashboardSidebar
      id="default"
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
        <!-- The console's own mark rather than a stock icon: the tab's icon in the console's own
             colours, so the picture on a tab, on a home screen and at the top of the sidebar are read
             as one. It is pressed like every row under it, so it wears their box — the same height and
             the same inner inset, which puts the mark on the column the sidebar's icons stand on and
             answers a hover and a press in their colours. -->
        <NuxtLink
          v-if="!collapsed"
          to="/"
          class="flex items-center gap-2 rounded-md px-2.5 py-1 transition-colors hover:bg-elevated active:bg-accented"
        >
          <BmoMark class="size-5 shrink-0" />
          <span class="font-bold text-highlighted">{{ consoleName($t) }}</span>
        </NuxtLink>

        <!-- Collapsing is a desktop affair; the drawer below lg is closed by tapping away. -->
        <UTooltip :text="collapsed ? $t('common.action.expand') : $t('common.action.collapse')" :content="{ side: 'right' }">
          <UDashboardSidebarCollapse class="ms-auto hidden lg:flex" />
        </UTooltip>
      </template>

      <template #default="{ collapsed }">
        <UContentSearchButton :collapsed="collapsed" :tooltip="collapsed" class="shrink-0" />
        <!-- A folded row is its icon alone, and its mark is drawn over that icon rather than given a
             cell of its own, so the folded column keeps one centre. The menu is told which rows
             wear the mark that way, which is why the fold is read out here. Folded, every row names
             itself in a tooltip; spread, its name stands and no tooltip repeats it. -->
        <UNavigationMenu :items="namedWhenFolded(screenEntries, collapsed)" :collapsed="collapsed" tooltip orientation="vertical" />
        <ContentSkeleton v-if="roomsInitial" :rows="3" listClass="flex flex-col" :label="$t('screens.status.rooms_loading')">
          <div class="flex h-8 items-center gap-1.5 px-2.5">
            <SkeletonBar class="size-5 shrink-0 rounded-sm" />
            <SkeletonBar v-if="!collapsed" class="h-4 w-28" />
          </div>
        </ContentSkeleton>
        <p v-if="roomsError" class="text-sm text-error">{{ $t("screens.error.rooms_failed") }}</p>
        <SidebarRooms :rooms="namedWhenFolded(roomEntries, collapsed)" :collapsed="collapsed" addable @add="roomAdding = true" />
        <ContentSkeleton v-if="agentsInitial" :rows="3" listClass="flex flex-col" :label="$t('screens.status.agents_loading')">
          <div class="flex h-8 items-center gap-1.5 px-2.5">
            <SkeletonBar class="size-5 shrink-0 rounded-sm" />
            <SkeletonBar v-if="!collapsed" class="h-4 w-24" />
          </div>
        </ContentSkeleton>
        <p v-if="agentsFailed" class="text-sm text-error">{{ $t("screens.error.agents_failed") }}</p>
        <UNavigationMenu
          v-model="openGroups"
          :items="namedWhenFolded(agentItems, collapsed)"
          :collapsed="collapsed"
          tooltip
          popover
          orientation="vertical"
        />
      </template>

      <template #footer="{ collapsed }">
        <div class="flex w-full flex-col gap-1">
          <!-- Whether the receiver's stream is carrying anything. Nothing is said while it is, or
               before it has first spoken; a break the receiver announced reads as a restart. It leads
               to the live status screen, where what is running is read. -->
          <UTooltip v-if="streamNotice !== null" :text="streamNotice.label" :disabled="!collapsed" :content="{ side: 'right' }">
            <NuxtLink
              to="/live"
              role="status"
              class="flex min-h-8 items-center gap-2 rounded-md px-2.5 text-sm transition-colors hover:bg-elevated active:bg-accented"
              :class="[streamNotice.tone, collapsed ? 'justify-center' : '']"
            >
              <UIcon :name="streamNotice.icon" class="size-5 shrink-0" :class="streamNotice.spin ? 'animate-spin' : ''" />
              <span v-if="!collapsed" class="truncate">{{ streamNotice.label }}</span>
            </NuxtLink>
          </UTooltip>
          <UserMenu :collapsed="collapsed" />
        </div>
      </template>
    </UDashboardSidebar>

    <!-- What outlives moving between rooms: a job that has stopped to ask something stays asked.
         It stands above every screen because it is about something going on elsewhere, and it is
         nothing at all when there is nothing to say. -->
    <div class="flex min-w-0 flex-1 flex-col">
      <QuestionBar />

      <!-- The page has a box of its own beside the task panel. The boundary between that box and the task
           panel is the task panel's own leading edge, so the page's last panel must stay the last element of
           its box, where it draws no trailing edge. -->
      <div class="flex min-h-0 min-w-0 flex-1">
        <div class="relative flex min-h-0 min-w-0 flex-1">
          <slot />
        </div>
        <TodoPanel place="aside" />
      </div>
    </div>
    <UContentSearch
      v-model:search-term="searchTerm"
      :groups="searchGroups"
      :color-mode="false"
      shortcut="meta_k"
      :placeholder="$t('screens.placeholder.find')"
      :title="$t('screens.label.search')"
      :description="$t('screens.label.find_description')"
    />
    <UDrawer
      v-model:open="todoOpen"
      direction="right"
      title="TODO"
      :description="$t('screens.label.todo_description')"
      :handle="false"
      :handle-only="true"
      :ui="{ content: 'flex-col w-4/5 max-w-sm xl:hidden' }"
    >
      <template #content>
        <TodoPanel place="drawer" @close="todoOpen = false" />
      </template>
    </UDrawer>

    <RoomAddDialog v-model:open="roomAdding" @added="roomAdded" />
  </UDashboardGroup>
</template>

<script setup lang="ts">
import { useInitialRead } from "bmo-ui/app/domain/loading";
import { consoleName } from "#shared/agent-names";
import { useAgentFolds } from "~/domain/agent-folds";
import { agentGroups, groupIcon, isAgentRunning, isGroupOpen, sessionLink, withGroupFolds } from "~/domain/agents";
import { avatarFor, useAvatars } from "~/domain/avatars";
import { useAgentCatalogue } from "~/domain/catalogue";
import { useBotEvents } from "~/domain/events";
import { jumpGroups, screenGroup } from "~/domain/jump";
import { SCREEN_FRAME, useNarrow } from "bmo-ui/app/domain/screen";
import { useVisibleShell } from "~/domain/overlay";
import { useRoomList, useRoomReading } from "~/domain/room-list";
import { useConsoleScreens } from "~/domain/console-screens";
import { namedWhenFolded, roomItems, screenItems, screensWithBundles } from "~/domain/screens";

import type { LiveRun, RoomAdded, StatusView } from "#shared/types";
import type { NavigationMenuItem } from "@nuxt/ui";
import type { AgentGroup, AgentMeta, AgentSession } from "~/domain/agents";
import type { JumpGroup } from "~/domain/jump";

const route = useRoute();

// The shell of the console fills what is on the screen rather than what the window says it is.
// The two are the same until something is laid over the page — a virtual keyboard is, on a phone
// — and a shell pinned to a window whose bottom is behind the keys puts the box being typed in there
// with it. What is visible is kept in the two custom properties, so the shell reads them and
// anything else that has to fit on the screen reads the same pair.
const shell = SCREEN_FRAME;

useVisibleShell();

const open = ref(false);
const { t } = useI18n();
const todoOpen = useState<boolean>("todo-open", () => false);

// An address naming a TODO item opens that item wherever the panel stands. Below the width the
// panel stands beside the page at, the panel is the drawer, so the drawer opens to show it.
const asideShown = useNarrow("(min-width: 1280px)");

function openAskedTodo(): void {
  if (route.query.todo !== undefined && !asideShown.value) {
    todoOpen.value = true;
  }
}

watch(() => route.query.todo, openAskedTodo);
onMounted(() => nextTick(openAskedTodo));

// Whether the sidebar stands folded. The menu's rows are built from it: a folded row is its icon
// alone, and a mark it carries is drawn over that icon rather than given a cell of its own.
const sidebarFolded = ref(false);
// The screens units bring take their manifest's own name and icon; the console's own screens and the
// placeholders of units not yet split stand as they are (docs/web.md, 「Screens a unit brings」).
const screens = screensWithBundles(useConsoleScreens().value);
const screenEntries = computed<NavigationMenuItem[]>(() => screenItems(t, route.path, undefined, sidebarFolded.value, screens));

// The picture every session in this sidebar wears.
const avatars = useAvatars();

// The agents are the agency's to report; a catalogue it does not answer leaves the block saying so.
const { agents, initial: agentsInitial, failed: agentsFailed } = useAgentCatalogue();

// The rooms, each with how many of its messages the reader has not read, read again whenever a message lands in one
// of them (docs/web.md, 「Sidebar」). A room's session is titled and ranked by the same list.
const { data: rooms, status: roomsStatus, error: roomsError } = useRoomList();

// A room added from a chat service's account stands in the list at once, and the console goes to it.
const roomAdding = ref(false);

async function roomAdded(added: RoomAdded): Promise<void> {
  await refreshNuxtData("rooms");
  await navigateTo(`/rooms/${added.chatId}`);
}
const reading = useRoomReading();
const roomsInitial = useInitialRead(roomsStatus);
const roomEntries = computed<NavigationMenuItem[]>(() => roomItems(t, rooms.value, avatars.value, route.path, sidebarFolded.value, reading.value));

// Which agents are at work right now. The picture is asked for once and replaced by the one the live events
// carry, so a mark comes and goes without the sidebar asking again.
const live = ref<LiveRun[]>([]);

const groups = computed<AgentGroup[]>(() => agentGroups(t, agents.value.agents, rooms.value));

// Which groups the owner has folded away, and which are left open. The choice stays in this browser, so the
// sidebar stands as it was left however many times the console is opened.
const { folds, setFolds } = useAgentFolds();

// Every agent, in its groups. A group never touched is unfolded: the point of the block is that the whole
// catalogue is in view. Each group is named by its own key so that what the menu hands back is a list of groups
// rather than a list of positions.
const agentItems = computed<NavigationMenuItem[]>(() => [
  { label: t("screens.label.group_agents"), type: "label" },
  ...groups.value.map((group) => ({
    label: group.label,
    value: group.key,
    // Folded, a group is a row of its own mark, and its agents open beside it on hover.
    icon: sidebarFolded.value ? groupIcon(group.key) : undefined,
    children: group.agents.map(agentEntry)
  }))
]);

// The menu is told which groups stand open and says so back when one is folded or unfolded. Only the groups on
// the screen are written down; what was remembered of a group not yet listed waits for it.
const openGroups = computed<string[]>({
  get: () => groups.value.filter((group) => isGroupOpen(folds.value, group.key)).map((group) => group.key),
  set: (open) => setFolds(withGroupFolds(folds.value, groups.value.map((group) => group.key), open))
});

// One agent's entry: its name, and a turning circle while it is at work. Nothing that grows stands beside the
// name, since a name is what the entry is read by. A name carries a colon and may carry a minus sign, so the
// link encodes it.
function agentEntry(agent: AgentMeta): NavigationMenuItem {
  const running = isAgentRunning(agent, live.value);

  return {
    label: agent.label,
    to: `/agents/${encodeURIComponent(agent.name)}`,
    // A room's own session wears that room's picture; every other agent wears its mark.
    icon: agent.chatId === null ? agent.icon : undefined,
    avatar: agent.chatId === null ? undefined : avatarFor(avatars.value, "room", agent.chatId, agent.label),
    active: decodeURIComponent(route.path) === `/agents/${agent.name}`,
    // A turning circle rather than a still dot: the list is meant to say what is alive, and a dot says only
    // that something was true when the picture arrived.
    trailingIcon: running ? "i-material-symbols-progress-activity" : undefined,
    ui: running ? { linkTrailingIcon: "animate-spin text-primary" } : undefined,
    // A designated agent's room sessions stand under it, each its room's name and picture, opening the agent's
    // log at its last turn there (docs/web.md, 「Sidebar」).
    ...(agent.sessions.length === 0 ? {} : { defaultOpen: true, children: agent.sessions.map((session) => sessionEntry(agent, session)) })
  };
}

function sessionEntry(agent: AgentMeta, session: AgentSession): NavigationMenuItem {
  return {
    label: session.label,
    to: sessionLink(agent.name, session),
    avatar: avatarFor(avatars.value, "room", session.chatId, session.label),
    active: decodeURIComponent(route.path) === `/agents/${agent.name}` && route.query.chat === String(session.chatId)
  };
}

// The console search: what this sidebar lists, and the shortcut that opens it from anywhere.
// Ctrl+K is ⌘K on a Mac; the shortcut layer reads `meta` as Ctrl elsewhere.
const searchTerm = ref("");
const jumpSources = computed<JumpGroup[]>(() => [
  screenGroup(t, screens),
  {
    id: "rooms",
    label: t("common.label.room"),
    entries: rooms.value.map((room) => ({
      id: `room-${room.chatId}`,
      label: room.title,
      to: `/rooms/${room.chatId}`,
      avatar: avatarFor(avatars.value, "room", room.chatId, room.title),
      hidden: [{ label: t("screens.label.chat_id"), text: String(room.chatId) }]
    }))
  },
  ...groups.value.map((group) => ({
    id: `agents-${group.key}`,
    label: t("screens.label.agents_group", { name: group.label }),
    entries: group.agents.map((agent) => ({
      id: `agent-${agent.name}`,
      label: agent.label,
      to: `/agents/${encodeURIComponent(agent.name)}`,
      icon: agent.chatId === null ? agent.icon : undefined,
      avatar: agent.chatId === null ? undefined : avatarFor(avatars.value, "room", agent.chatId, agent.label),
      hidden: [{ label: t("screens.label.internal_name"), text: agent.name }]
    }))
  }))
]);
const searchGroups = computed(() => jumpGroups(t, jumpSources.value, searchTerm.value));

const stream = useBotEvents((event) => {
  if (event.type === "live" && event.live !== undefined) {
    live.value = event.live.runs ?? [];
  }
});

onMounted(async () => {
  try {
    live.value = (await $fetch<StatusView>("/api/status")).live;
  } catch {
    // The sidebar stands whether the picture answers or not; without it the agents go without their marks.
  }
});

interface StreamNotice {
  label: string;
  icon: string;
  tone: string;
  spin: boolean;
}

// The one line the sidebar keeps about the stream, standing only while it is not connected. A
// restart the receiver announced is expected and passes on its own, so it is said quietly; any other
// break means what the screens show may be stale, so it is said in the error colour.
const streamNotice = computed<StreamNotice | null>(() => {
  if (stream.restarting.value) {
    return { label: t("screens.status.restarting"), icon: "i-material-symbols-restart-alt", tone: "text-muted", spin: true };
  }

  if (stream.dropped.value) {
    return { label: t("screens.status.disconnected"), icon: "i-material-symbols-link-off", tone: "text-error", spin: false };
  }

  return null;
});
</script>
