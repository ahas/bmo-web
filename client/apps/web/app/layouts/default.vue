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
        <!-- The screens' sections, each a menu of its own under its heading, parted as the sidebar parts its groups
             (docs/web.md, 「Sidebar」). -->
        <UNavigationMenu
          v-for="section in screenSections"
          :key="section.heading"
          :aria-label="section.heading"
          :items="namedWhenFolded(section.items, collapsed)"
          :collapsed="collapsed"
          tooltip
          orientation="vertical"
        />
        <ContentSkeleton v-if="roomsInitial" :rows="3" listClass="flex flex-col" :label="$t('screens.status.rooms_loading')">
          <div class="flex h-8 items-center gap-1.5 px-2.5">
            <SkeletonBar class="size-5 shrink-0 rounded-sm" />
            <SkeletonBar v-if="!collapsed" class="h-4 w-28" />
          </div>
        </ContentSkeleton>
        <p v-if="roomsError" class="text-sm text-error">{{ $t("screens.error.rooms_failed") }}</p>
        <SidebarRooms :rooms="namedWhenFolded(roomEntries, collapsed)" :collapsed="collapsed" addable openable @add="roomAdding = true" @open="roomOpening = true" />
        <ContentSkeleton v-if="agentsWaiting" :rows="3" listClass="flex flex-col" :label="$t('screens.status.agents_loading')">
          <div class="flex h-8 items-center gap-1.5 px-2.5">
            <SkeletonBar class="size-5 shrink-0 rounded-sm" />
            <SkeletonBar v-if="!collapsed" class="h-4 w-24" />
          </div>
        </ContentSkeleton>
        <p v-if="agentsFailed" class="text-sm text-error">{{ $t("screens.error.agents_failed") }}</p>
        <!-- A closed branch keeps its list mounted, so a row folded under it stands in the state it was
             left when the branch opens again (docs/web.md, 「Sidebar」). -->
        <UNavigationMenu
          v-model="openGroups"
          :items="namedWhenFolded(agentItems, collapsed)"
          :collapsed="collapsed"
          tooltip
          popover
          orientation="vertical"
          :unmount-on-hide="false"
        >
          <!-- An entry at work turns a mark at its line's end, beside a role's count of its runs and the chevron of an
               entry that holds lines under it, so a spinning mark never stands where the chevron is pressed. -->
          <template #item-trailing="{ item, ui, active }">
            <UIcon v-if="item.busy === true" name="i-material-symbols-progress-activity" class="size-5 shrink-0 animate-spin text-primary" />
            <UBadge v-if="typeof item.badge === 'object'" v-bind="item.badge" />
            <UIcon v-if="item.children?.length" :name="appConfig.ui.icons.chevronDown" data-slot="linkTrailingIcon" :class="ui.linkTrailingIcon({ active })" />
          </template>
        </UNavigationMenu>
      </template>

      <template #footer="{ collapsed }">
        <div class="flex w-full flex-col gap-1">
          <!-- Whether the receiver's stream is carrying anything. Nothing is said while it is, or
               before it has first spoken; a break the receiver announced reads as a restart. It leads
               to agent management's agents tab, where what each agent is doing now is read. -->
          <UTooltip v-if="streamNotice !== null" :text="streamNotice.label" :disabled="!collapsed" :content="{ side: 'right' }">
            <NuxtLink
              to="/agents?tab=supervisors"
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
        <BundleScreenFrame>
          <slot />
        </BundleScreenFrame>
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
    <!-- The drawer stands in the app's own host for floating parts, right after the app, rather than at the page's
         end: a menu or a dialog opened over it is added at the end, and whatever stood last there is styled again
         whole, every row of the panel with it (docs/web.md, the TODO panel's section). -->
    <UDrawer
      v-model:open="todoOpen"
      portal="#teleports"
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
    <RoomOpenDialog v-model:open="roomOpening" @added="roomAdded" />

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
import { useBriefings } from "~/domain/briefing";
import { useInitialRead } from "bmo-ui/app/domain/loading";
import { consoleName } from "#shared/agent-names";
import { useAgentFolds } from "~/domain/agent-folds";
import { agentGroups, groupIcon, isAgentRunning, isGroupOpen, runLink, sessionLink, withGroupFolds } from "~/domain/agents";
import { useAgentFace } from "~/domain/agent-face";
import { avatarFor, useAvatars } from "~/domain/avatars";
import { useAgentCatalogue } from "~/domain/catalogue";
import { useBotEvents, useLiveRefresh, useSupervisorsAnswering } from "~/domain/events";
import { COUNT_BADGE, countText } from "~/domain/numbers";
import { POLL_INTERVAL_MS } from "#shared/config";
import { jumpGroups, screenGroup } from "~/domain/jump";
import { peopleGroup } from "~/domain/people";
import { useModelNames } from "~/domain/model-names";
import { SCREEN_FRAME, useNarrow } from "bmo-ui/app/domain/screen";
import { useVisibleShell } from "~/domain/overlay";
import { useRoomList, useRoomReading } from "~/domain/room-list";
import { useConsoleScreens } from "~/domain/console-screens";
import { namedWhenFolded, roomItems, screensWithBundles, sectionItems } from "~/domain/screens";
import { useSidebarUnread } from "~/domain/sidebar-unread";
import { sameKept, sameRowsKept } from "~/domain/same-kept";
import { useAskedTodo } from "~/domain/todo-address";

import type { LiveRun, RoomAdded, StatusView } from "#shared/types";
import type { PersonView } from "#shared/people";
import type { NavigationMenuItem } from "@nuxt/ui";
import type { AgentGroup, AgentMeta, AgentRun, AgentSession } from "~/domain/agents";
import type { JumpGroup } from "~/domain/jump";
import type { SectionMenu } from "~/domain/screens";

// Where the title bar's one set of buttons stands: the standing screen's bar.
const titleBarTarget = useTitleBarTarget();

const route = useRoute();
// The console's bar, offered to every screen a unit brings.
provideConsoleTitleBar();
provideConsolePeople();

// The shell of the console fills what is on the screen rather than what the window says it is.
// The two are the same until something is laid over the page — a virtual keyboard is, on a phone
// — and a shell pinned to a window whose bottom is behind the keys puts the box being typed in there
// with it. What is visible is kept in the two custom properties, so the shell reads them and
// anything else that has to fit on the screen reads the same pair.
const shell = SCREEN_FRAME;

useVisibleShell();

const open = ref(false);
const { t } = useI18n();
// The registrations behind a model alias, for every row in this shell that names a model.
useModelNames();
// The voice briefings, heard for as long as the layout stands, and played in its player.
useBriefings(t);
const todoOpen = useState<boolean>("todo-open", () => false);

// An address naming a TODO item opens that item wherever the panel stands. Below the width the
// panel stands beside the page at, the panel is the drawer, so the drawer opens to show it.
const asideShown = useNarrow("(min-width: 1280px)");

const askedTodo = useAskedTodo();

function openAskedTodo(): void {
  if (askedTodo() !== null && !asideShown.value) {
    todoOpen.value = true;
  }
}

watch(() => route.query.todo, openAskedTodo);
onMounted(() => nextTick(openAskedTodo));

// Whether the sidebar stands folded. The menu's rows are built from it: a folded row is its icon
// alone, and a mark it carries is drawn over that icon rather than given a cell of its own.
const sidebarFolded = ref(false);
// The screens units bring take their manifest's own name and icon; the console's own screens stand as they are
// (docs/web.md, 「Screens a unit brings」). The sidebar stands them in its two sections (「Sidebar」).
const bundles = useConsoleScreens();
const screens = screensWithBundles(bundles.value);
// The counts the bundles declare, read for this reader while the sidebar stands (docs/web.md, 「Sidebar」).
const unread = useSidebarUnread();
const screenSections = computed<SectionMenu[]>((before) => sameKept(before, sectionItems(t, route.path, undefined, sidebarFolded.value, screens, unread.value)));

// The picture every session in this sidebar wears.
const avatars = useAvatars();
const agentFace = useAgentFace();

// The agents are the agency's to report; a catalogue it does not answer leaves the block saying so.
const { agents, initial: agentsInitial, failed: agentsFailed, refresh: refreshAgents } = useAgentCatalogue();
const appConfig = useAppConfig();

// A supervisor, a role or a repository moving, a role's slot being let in or given back, and a job or a run of a role
// starting or ending are what the branches read again on (docs/web.md, 「Sidebar」).
useLiveRefresh(() => void refreshAgents(), { on: ["agency-catalogue", "agency-run", "worker-run"], everyMs: POLL_INTERVAL_MS });

// The rooms, each with how many of its messages the reader has not read, read again whenever a message lands in one
// of them (docs/web.md, 「Sidebar」). A room's session is titled and ranked by the same list.
const { data: rooms, status: roomsStatus, error: roomsError } = useRoomList();

// A room added from a chat service's account stands in the list at once, and the console goes to it.
const roomAdding = ref(false);
// A group room opened in the console stands in the list the same way.
const roomOpening = ref(false);

async function roomAdded(added: RoomAdded): Promise<void> {
  await refreshNuxtData("rooms");
  await navigateTo(`/rooms/${added.chatId}`);
}
const reading = useRoomReading();
const roomsInitial = useInitialRead(roomsStatus);
// Each room's entry stays the one in hand while what it shows is the same, so a room switch or a room's message draws
// again the rows that changed and no other (docs/web.md, 「What the stream costs a tab」).
const roomEntries = computed<NavigationMenuItem[]>((before) =>
  sameRowsKept(before, roomItems(t, rooms.value, avatars.value, route.path, sidebarFolded.value, reading.value), (entry) => String(entry.to))
);

// Which agents are at work right now. The picture is asked for once and replaced by the one the live events
// carry, so a mark comes and goes without the sidebar asking again.
const live = ref<LiveRun[]>([]);

// The branches wait for the room list's first answer as well as the agency's: a supervisor's rooms are the ones the
// list holds, and the menu reads whether a row stands open only as the row first stands (docs/web.md, 「Sidebar」).
const agentsWaiting = computed<boolean>(() => agentsInitial.value || roomsInitial.value);
// The groups stay the ones in hand while a read of the agents or the rooms leaves them as they were, so a room's
// message draws nothing of the agents' menu again (docs/web.md, 「What the stream costs a tab」).
const groups = computed<AgentGroup[]>((before) => sameKept(before, roomsInitial.value ? [] : agentGroups(t, [...agents.value.agents], rooms.value)));
// The supervisors whose turn runs now in a room.
const answering = useSupervisorsAnswering();

// Which groups the owner has folded away, and which are left open. The choice stays in this browser, so the
// sidebar stands as it was left however many times the console is opened.
const { folds, setFolds } = useAgentFolds();

// Every agent, in its groups. A group never touched is unfolded: the point of the block is that the whole
// catalogue is in view. Each group is named by its own key so that what the menu hands back is a list of groups
// rather than a list of positions.
// Where in the agents the address stands, the same value while it stands anywhere else, so a room switch leaves the
// agents' menu as it is (docs/web.md, 「What the stream costs a tab」).
const agentPlace = computed<{ path: string; chat?: string; at?: string }>((before) =>
  sameKept(
    before,
    route.path.startsWith("/agents/")
      ? { path: decodeURIComponent(route.path), chat: route.query.chat?.toString(), at: route.query.at?.toString() }
      : { path: "" }
  )
);

const agentItems = computed<NavigationMenuItem[]>((before) => sameKept(before, [
  { label: t("screens.label.group_agents"), type: "label" },
  ...groups.value.map((group) => ({
    label: group.label,
    value: group.key,
    // Folded, a group is a row of its own mark, and its agents open beside it on hover.
    icon: sidebarFolded.value ? groupIcon(group.key) : undefined,
    children: group.agents.map(agentEntry)
  }))
]));

// The menu is told which groups stand open and says so back when one is folded or unfolded. Only the groups on
// the screen are written down; what was remembered of a group not yet listed waits for it.
const openGroups = computed<string[]>({
  get: (before) => sameKept(before, groups.value.filter((group) => isGroupOpen(folds.value, group.key)).map((group) => group.key)),
  set: (open) => setFolds(withGroupFolds(folds.value, groups.value.map((group) => group.key), open))
});

// Whether an entry is at work (docs/web.md, 「Sidebar」): a supervisor whose turn runs, a role whose runs go, and a
// repository a job works in.
function busy(agent: AgentMeta): boolean {
  if (agent.group === "supervisor") return answering.value.has(agent.name) || isAgentRunning(agent, live.value);
  if (agent.group === "role") return agent.running > 0;

  return agent.working;
}

// One entry: its name, a turning circle while it is at work, and a role's count of the runs it has going. Nothing that
// grows stands beside the name but that count, since a name is what the entry is read by. A name may carry a colon or
// a minus sign, so the link encodes it.
function agentEntry(agent: AgentMeta): NavigationMenuItem {
  const at = agentPlace.value.path === `/agents/${agent.name}`;
  const children = [...agent.sessions.map((session) => sessionEntry(agent, session)), ...agent.runs.map((run) => runEntry(agent, run))];

  return {
    label: agent.label,
    to: `/agents/${encodeURIComponent(agent.name)}`,
    // A supervisor wears its face, a role and a repository their branch's mark (docs/web.md, 「Profile photos」).
    icon: agentFace.value(agent) === undefined ? agent.icon : undefined,
    avatar: agentFace.value(agent),
    active: at && agentPlace.value.chat === undefined && agentPlace.value.at === undefined,
    // A turning circle rather than a still dot: the list is meant to say what is alive, and a dot says only that
    // something was true when the picture arrived.
    busy: busy(agent),
    ...(agent.group === "role" && agent.running > 0 ? { badge: { ...COUNT_BADGE, color: "neutral" as const, label: countText(agent.running) } } : {}),
    // A supervisor's room sessions and a role's runs stand under it (docs/web.md, 「Sidebar」).
    ...(children.length === 0 ? {} : { defaultOpen: true, children })
  };
}

function sessionEntry(agent: AgentMeta, session: AgentSession): NavigationMenuItem {
  return {
    label: session.label,
    to: sessionLink(agent.name, session),
    avatar: avatarFor(avatars.value, "room", session.chatId, session.label),
    active: agentPlace.value.path === `/agents/${agent.name}` && agentPlace.value.chat === String(session.chatId)
  };
}

// One run of a role, by what it works in, opening the role's log at that run.
function runEntry(agent: AgentMeta, run: AgentRun): NavigationMenuItem {
  return {
    label: run.label,
    to: runLink(agent.name, run),
    icon: "i-material-symbols-subdirectory-arrow-right",
    active: agentPlace.value.path === `/agents/${agent.name}` && run.since !== null && agentPlace.value.at === String(run.since)
  };
}

// The console search: what this sidebar lists, and the shortcut that opens it from anywhere.
// Ctrl+K is ⌘K on a Mac; the shortcut layer reads `meta` as Ctrl elsewhere.
const searchTerm = ref("");

// The people the account service finds in the reader's organisation (docs/accounts.md, 「The people
// directory」). The search asks once typing stops, and an answer to words already typed past is dropped.
const people = ref<PersonView[]>([]);
let peopleTimer: ReturnType<typeof setTimeout> | null = null;
let peopleAsked = 0;

watch(searchTerm, (term) => {
  const asked = ++peopleAsked;
  const words = term.trim();

  if (peopleTimer !== null) clearTimeout(peopleTimer);

  if (words === "") {
    people.value = [];

    return;
  }

  peopleTimer = setTimeout(async () => {
    try {
      const found = await $fetch<PersonView[]>("/api/people/search", { query: { q: words } });

      if (asked === peopleAsked) people.value = found;
    } catch {
      if (asked === peopleAsked) people.value = [];
    }
  }, 250);
});

onBeforeUnmount(() => {
  if (peopleTimer !== null) clearTimeout(peopleTimer);
});

const jumpSources = computed<JumpGroup[]>((before) => sameKept(before, [
  screenGroup(t, screens),
  peopleGroup(t, people.value),
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
      icon: agentFace.value(agent) === undefined ? agent.icon : undefined,
      avatar: agentFace.value(agent),
      hidden: [{ label: t("screens.label.internal_name"), text: agent.name }]
    }))
  }))
]));
const searchGroups = computed(() => jumpGroups(t, jumpSources.value, searchTerm.value));

// The jobs running beside the chat are the agency's, so the receiver's picture says nothing of one starting or
// ending. The agency's job events name it, and the board is read again when one comes.
async function readLiveStatus(): Promise<void> {
  try {
    live.value = sameKept(live.value, (await $fetch<StatusView>("/api/status")).live);
  } catch {
    // The sidebar stands whether the units answer or not; without it the agents go without their marks.
  }
}

const stream = useBotEvents((event) => {
  if (event.type === "live" && event.live !== undefined) {
    live.value = sameKept(live.value, event.live.runs ?? []);
  }
});

// A burst of the agency's job words is one read of the board, not one for each word.
useLiveRefresh(() => void readLiveStatus(), { on: ["worker-run"] });

onMounted(readLiveStatus);

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
