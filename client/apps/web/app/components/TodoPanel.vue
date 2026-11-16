<template>
  <!-- Folded away: a strip of its own width, and the one button that brings it back. It draws the
       boundary to the page as its own leading edge, as the open panel below does. -->
  <aside
    v-if="props.place === 'aside' && collapsed"
    class="hidden w-10 shrink-0 flex-col items-center gap-2 border-s border-default bg-default py-3 xl:flex"
  >
    <UTooltip :text="$t('todo.action.panel_expand')">
      <UButton
        icon="i-material-symbols-right-panel-open-outline"
        color="neutral"
        variant="ghost"
        size="sm"
        :aria-label="$t('todo.action.panel_expand')"
        @click="setCollapsed(false)"
      />
    </UTooltip>
    <span class="text-sm [writing-mode:vertical-rl]" :class="questionCount === null ? 'text-muted' : 'text-warning'">
      TODO {{ loaded ? summary : $t("common.status.loading") }}<template v-if="questionCount !== null"> · {{ questionCount }}</template><template v-if="board.paused"> · {{ $t("todo.status.paused_suffix") }}</template><template v-if="board.deployHold !== null"> · {{ $t("todo.status.deploy_hold_suffix") }}</template>
    </span>
  </aside>

  <aside
    v-else
    class="relative flex flex-col bg-default"
    :class="props.place === 'aside' ? 'hidden shrink-0 border-s border-default xl:flex' : 'h-full min-h-0'"
    :style="props.place === 'aside' ? { width: `${width}px` } : undefined"
  >
    <!-- The edge is the handle: dragging it sets the width, and the width is kept.

         The boundary to the page is this panel's own leading border. The page stands in a box of
         its own beside this panel, where its last panel is the last of that box and draws no
         trailing edge, so this line is the only one down the boundary. The line inside the handle
         is nothing at all until a drag begins, when it lights that same border rather than
         standing a stripe of its own next to it. Two 1px lines butted together read as one 2px
         line, which is the whole of what that looks like. -->
    <div
      v-if="props.place === 'aside'"
      class="absolute inset-y-0 -start-1 z-10 w-2 cursor-col-resize focus-visible:bg-primary/40 focus-visible:outline-none"
      role="separator"
      aria-orientation="vertical"
      :aria-label="$t('todo.aria.panel_width')"
      :aria-valuenow="width"
      :aria-valuemin="PANEL_MIN_WIDTH"
      :aria-valuemax="PANEL_MAX_WIDTH"
      tabindex="0"
      @pointerdown="onDragStart"
      @keydown.left.prevent="setWidth(width + DRAG_STEP_PX)"
      @keydown.right.prevent="setWidth(width - DRAG_STEP_PX)"
    >
      <!-- Exactly over the boundary: the handle straddles it, so a line whose far edge is the
           handle's own midline is the panel's border and not a neighbour of it. -->
      <div class="absolute inset-y-0 end-1/2 w-px transition-colors" :class="dragging ? 'bg-primary' : ''" />
    </div>

    <!-- The head stands at the height the page's own top bar stands at, from the same token, so
         the two bottom edges are one line across the window. -->
    <div class="flex h-(--ui-header-height) shrink-0 items-center justify-between border-b border-default px-4">
      <div class="flex min-w-0 items-center gap-2">
        <h2 class="shrink-0 text-base font-semibold text-highlighted">TODO</h2>
        <p v-if="questionCount !== null" class="truncate text-sm text-warning">{{ questionCount }}</p>
      </div>

      <div class="flex items-center gap-1">
        <!-- Re-reading an already loaded board is said once, in the one place it is not already
             said: the spinner on the button below is the whole of what a reader needs, but it is
             a disabled control with an aria-hidden icon, so assistive technology would hear
             nothing at all. This carries that and takes no room on the screen. -->
        <span v-if="pending && loaded" role="status" class="sr-only">{{ $t("todo.status.list_refreshing") }}</span>
        <UTooltip :text="board.paused ? $t('todo.action.auto_resume') : $t('todo.action.auto_pause')">
          <UButton
            :icon="board.paused ? 'i-material-symbols-play-arrow' : 'i-material-symbols-pause'"
            :color="board.paused ? 'warning' : 'neutral'"
            variant="ghost"
            size="sm"
            :aria-label="board.paused ? $t('todo.action.auto_resume') : $t('todo.action.auto_pause')"
            :loading="switching"
            @click="switchPause(!board.paused)"
          />
        </UTooltip>
        <UTooltip :text="$t('common.action.refresh')">
          <UButton
            icon="i-material-symbols-refresh"
            color="neutral"
            variant="ghost"
            size="sm"
            :aria-label="$t('common.action.refresh')"
            :loading="pending"
            @click="reload"
          />
        </UTooltip>
        <UTooltip v-if="props.place === 'aside'" :text="$t('todo.action.panel_collapse')">
          <UButton
            icon="i-material-symbols-right-panel-close-outline"
            color="neutral"
            variant="ghost"
            size="sm"
            :aria-label="$t('todo.action.panel_collapse')"
            @click="setCollapsed(true)"
          />
        </UTooltip>
        <UTooltip v-else :text="$t('todo.action.panel_close')">
          <UButton
            icon="i-material-symbols-close"
            color="neutral"
            variant="ghost"
            size="sm"
            :aria-label="$t('todo.action.panel_close')"
            @click="emit('close')"
          />
        </UTooltip>
      </div>
    </div>

    <!-- Stopped, and saying so where the panel cannot be read without seeing it. What is held is
         the calling of the next item: the rows below stand exactly as they are, and whatever was
         already under way runs to its end. -->
    <div
      v-if="board.paused"
      class="flex items-center justify-between gap-2 border-b border-default bg-warning/10 px-3 py-2"
    >
      <p class="text-sm text-warning">{{ $t("todo.action.auto_pause") }}</p>
      <UButton color="warning" variant="soft" size="sm" class="shrink-0" :loading="switching" @click="switchPause(false)">{{ $t("todo.action.resume") }}</UButton>
    </div>

    <!-- A deployment holding the queue until the Jobs it waits for end. It is a state of its own
         beside his pause, never let go by a resume, and the band says which Jobs' end it goes up
         after. Pressed, it opens the title bar's deployment popover, the one place the hold is shown
         whole and let go. -->
    <div v-if="board.deployHold !== null" class="flex items-center border-b border-default bg-warning/10 px-3 py-2">
      <UButton color="warning" variant="ghost" size="sm" class="min-w-0" @click="openDeploy">
        <span class="truncate tabular-nums">{{ holdSummary }}</span>
      </UButton>
    </div>

    <TodoSearchBox :reading="pending" :tally="searchTallyLine" @search="onSearch" />

    <!-- What is shown and in what order; both are kept in this browser. -->
    <div :class="['flex h-10 shrink-0 items-center gap-1 px-3', TAB_ROW_LINE]">
      <UTabs
        :model-value="view.filter"
        :items="filterTabs"
        :content="false"
        color="neutral"
        variant="link"
        size="sm"
        class="min-w-0 flex-1 self-stretch"
        :ui="{ ...TAB_ROW_UI, trigger: `${TAB_ROW_UI.trigger} px-2` }"
        :aria-label="$t('todo.aria.filter')"
        @update:model-value="(choice: string | number) => setView({ ...view, filter: choice as TodoFilter })"
      >
        <!-- Each tab's count turns as its state fills and empties, on the tabs' own badge. -->
        <template #trailing="{ item, ui }">
          <UBadge v-if="item.badge !== undefined" v-bind="item.badge" data-slot="trailingBadge" :class="ui.trailingBadge({ class: item.badge.class })">
            <RollingNumber :value="item.count" />
          </UBadge>
        </template>
      </UTabs>

      <!-- The conditions beyond the state, folded behind one button at every width: the panel is a
           narrow column wherever it stands. The button says how many are set, and the one beside
           it lets them all go at once. -->
      <UPopover
        v-model:open="conditionsOpen"
        :content="{ align: 'end' }"
        :ui="{ content: 'flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-3 p-3' }"
      >
        <UTooltip :text="conditionsSet > 0 ? $t('todo.aria.filters_set', { n: conditionsSet }) : $t('todo.label.filter')">
          <UButton
            class="shrink-0"
            size="sm"
            :color="conditionsSet > 0 ? 'primary' : 'neutral'"
            :variant="conditionsSet > 0 ? 'soft' : 'ghost'"
            icon="i-material-symbols-filter-list"
            :label="conditionsSet > 0 ? String(conditionsSet) : undefined"
            :aria-label="conditionsSet > 0 ? $t('todo.aria.filters_set', { n: conditionsSet }) : $t('todo.label.filter')"
          />
        </UTooltip>

        <template #content>
          <div class="flex items-center justify-between gap-2">
            <p class="text-sm font-semibold text-highlighted">{{ $t("todo.label.filter") }}</p>
            <UButton
              size="sm"
              color="neutral"
              variant="ghost"
              :label="$t('todo.action.clear_all')"
              :disabled="conditionsSet === 0"
              @click="setConditions(NO_CONDITIONS)"
            />
          </div>

          <UFormField v-for="field in conditionFields" :key="field.key" :label="field.label" size="sm">
            <USelect :content="{ align: 'start' }"
              :model-value="view.conditions[field.key] ?? ANY"
              :items="field.items"
              value-key="value"
              class="w-full"
              size="sm"
              :aria-label="$t('todo.aria.filter_of', { name: field.label })"
              @update:model-value="(choice: string) => setCondition(field.key, choice)"
            />
          </UFormField>
        </template>
      </UPopover>

      <UTooltip v-if="conditionsSet > 0" :text="$t('todo.action.clear_filters')">
        <UButton
          class="shrink-0"
          size="sm"
          color="neutral"
          variant="ghost"
          icon="i-material-symbols-filter-list-off"
          :aria-label="$t('todo.action.clear_filters')"
          @click="setConditions(NO_CONDITIONS)"
        />
      </UTooltip>

    </div>

    <!-- The list as one panel under the tabs: a change of tab slides it in from the side its tab
         stands on, and the list read for another room replaces it at once (docs/web.md, 「Motion」).
         A panel the tab brings opens at its own top. -->
    <TabSlide :at="filterIndex" class="min-h-0 flex-1">
      <div :key="listKey" ref="listRoot" :aria-busy="pending || loadingMore" class="h-full overflow-y-auto px-3 py-3">
        <ReadFailure :failure="boardRead" :message="boardFailure" :reading="pending" class="mb-3" @retry="reload()" />
        <UAlert v-if="failure !== null" color="error" variant="subtle" :description="failure" class="mb-3" />

        <p v-if="notice !== null" class="mb-3 whitespace-pre-line rounded-md bg-elevated/60 px-2 py-1 text-sm text-muted">
          {{ notice }}
          <!-- A row that was just raised is a row he wants to look at, and the number alone leaves
               him to find it among the requests waiting on him. It is the same address a
               notification about an item uses, so the press lands on the row itself. -->
          <ItemTip v-if="noticeTodo !== null" :id="noticeTodo" press>
            <NuxtLink :to="{ query: { ...route.query, todo: noticeTodo } }" class="ml-1 font-medium text-primary underline underline-offset-2">
              {{ $t("todo.action.open_item", { id: noticeTodo }) }}
            </NuxtLink>
          </ItemTip>
        </p>

        <!-- The board before it has arrived. A section's title and the frame of a row say nothing
             that had to be fetched, so they stand at once and only the words inside a row are kept
             waiting: the placeholder is the row the filter is about to fill, at its own height, with
             its own handle column, its own number and title line and its own run of marks under
             them. -->
        <ContentSkeleton v-if="!loaded && failure === null && boardFailure === ''" :label="$t('todo.status.loading')">
          <section v-for="section in waitingSections" :key="section.key" class="mb-4 last:mb-0">
            <p v-if="section.label !== null" class="px-1 pb-1 text-sm font-medium text-muted">{{ section.label }}</p>

            <div class="flex flex-col gap-1">
              <TodoRowSkeleton v-for="n in section.rows" :key="n" :narrow="narrow" />
            </div>
          </section>
        </ContentSkeleton>

        <!-- A right press or a held finger on a row stands that row's own menu: the acts its state allows,
             without opening it (docs/web.md, the TODO panel's section). One menu serves every row, drawn apart
             from the list; which row it was asked over is read off the press, which hands it that row's acts. -->
        <PointMenu ref="rowMenu" @update:open="onRowMenu" />
        <div ref="menuSurface" @pointerdown.capture="notePointer" @contextmenu="askRowMenu" @click.capture="swallowLift">
        <section v-for="section in (loaded ? sections : [])" :key="section.key" class="mb-4 last:mb-0">
          <p class="px-1 pb-1 text-sm font-medium text-muted">{{ section.label }}</p>

          <p v-if="section.items.length === 0" class="px-1 pb-1 text-sm text-muted">{{ section.empty }}</p>


          <MovingList class="flex flex-col gap-1">
            <!-- A row is two columns: the handle's own, which every row keeps whether or not it can be carried, and
                 the content, whose lines all start on one edge. What it holds is a part of its own inside the moving
                 list's item, drawn again only when what it is handed changed (docs/web.md, the TODO panel's section).
                 A row off screen skips its styling and layout until it comes near, so a change over the whole page, a
                 menu standing over it among them, costs the rows in view alone (docs/web.md, 「Floating things」); the
                 clip that skipping brings leaves more room outside the row than the keyboard's ring takes, its width
                 and its gap, as a plain length: the browser takes no sum there. -->
            <li
              v-for="item in section.items"
              :key="item.id"
              :data-todo-id="item.id"
              class="relative grid grid-cols-[1rem_minmax(0,1fr)] gap-x-1 rounded-lg border py-2 ps-1 pe-2 transition-colors hover:bg-elevated/50 [content-visibility:auto] [contain-intrinsic-size:auto_4.5rem] [overflow-clip-margin:0.5rem]"
              :class="rowMark(item.id)"
            >
              <TodoRow
                :item="item"
                :query="searched"
                :narrow="narrow"
                :draggable="canDrag(item, view, searched !== '')"
                :deploy-phase="itemDeployPhase(deployView, item)"
                :testbed-turn="testbedTurns.get(item.id) ?? null"
                :questions="askedOf.get(item.id) ?? null"
                :match="rowMatches.get(item.id) ?? null"
                :rooms="roomNames"
                :unapproving="unapproving === item.id && rowVerbs(item, board.queue).includes('unapprove')"
                :unapprove-busy="unapproving === item.id && busy.has(busyKey(item.id, 'unapprove'))"
                @open="toggle"
                @handle-down="onHandleDown"
                @unapprove="unapprove"
                @cancel-unapprove="unapproving = null"
              />
            </li>
          </MovingList>

          <!-- The foot of the finished list. Reaching it is what asks for the next page, so the
               list carries on for as long as he keeps scrolling; when there is no more, it says
               how many there were rather than leaving him wondering whether it stopped early. -->
          <template v-if="section.key === 'done'">
            <div ref="listFoot" class="h-px" />

            <!-- The next page of finished rows, in the shape of the rows already above it. -->
            <ContentSkeleton v-if="loadingMore" :rows="2" listClass="flex flex-col gap-1 pt-1" :label="$t('todo.status.more_done_loading')">
              <TodoRowSkeleton :narrow="narrow" />
            </ContentSkeleton>
            <p v-else-if="doneTailLine !== null" class="px-1 pt-2 text-sm text-muted">{{ doneTailLine }}</p>
          </template>
        </section>
        </div>
      </div>
    </TabSlide>
  </aside>

  <!-- The log of the job running a row, opened from the row's menu at its run and following it.
       Drawn only by the panel a person is looking at, as the item dialog is; the state is shared, so the
       press answers in that panel whichever one took it. -->
  <AgentLogDialog v-if="showsDetail && logAgent !== null" v-model:open="logOpen" :name="logAgent" :place="logPlace" :rooms="rooms ?? []" end />

  <!-- Words added to a row from its menu: the same added instructions the opened row adds. -->
  <UModal v-if="showsDetail" v-model:open="appendOpen" :title="appendItem === null ? '' : `#${appendItem.id} ${$t('todo.title.notes')}`">
    <template #body>
      <ChatInput v-model="appendText" :placeholder="$t('todo.placeholder.note')" :maxlength="APPEND_LIMIT" :busy="appending" @submit="sendAppend" />
      <p v-if="appendFailure !== null" class="mt-2 text-sm text-error">{{ appendFailure }}</p>
    </template>
  </UModal>

  <!-- One row's detail, over the list rather than inside it. Every panel holds one, so what is
       typed into it lives as long as the panel does; only the panel a person is reading draws it. -->
  <TodoItemDetail ref="detail" :shows="showsDetail" :item="readingItem" :panel="shared" @close="dismiss" @log="(item) => void openJobLog(item)" />

</template>

<script setup lang="ts">
import { APPEND_LIMIT, DONE_PAGE_SIZE } from "#shared/config";
import { todoOfQuery } from "#shared/paths";
import { todoClosed, useAskedTodo } from "~/domain/todo-address";
import { useAgentCatalogue } from "~/domain/catalogue";
import { failureText } from "bmo-ui/app/domain/errors";
import { useHoldMenu } from "bmo-ui/app/domain/holdmenu";
import { usePolling } from "~/domain/polling";
import { useTodoModelPlan } from "~/domain/todo-models";
import { useBotEvents, useLiveRefresh, useReadFailure, useTestbedEvents } from "~/domain/events";
import { useNarrow } from "bmo-ui/app/domain/screen";
import { TAB_ROW_LINE, TAB_ROW_UI } from "bmo-ui/app/domain/tabs";
import { COUNT_BADGE } from "~/domain/numbers";
import { questionSummary, useOpenQuestions } from "~/domain/questions";
import { provideTodoClock } from "~/domain/todo-clock";
import { useTodoPanelLayout, useTodoView } from "~/domain/todo-settings";
import { toUnixSeconds } from "bmo-ui/app/domain/time";
import { holdWaits } from "~/domain/queue-place";
import { itemDeployPhase, withDeploying } from "~/domain/deploy";
import { useIsland } from "bmo-ui/app/domain/island";
import { useConfirm } from "~/domain/confirm";
import { matchFields } from "bmo-ui/shared/search";
import {
  boardInOrder,
  doneTail,
  keptDoneLimit,
  nextDoneLimit,
  searchTally,
  busyKey,
  canDrag,
  clampPanelWidth,
  EDGE_STEP_MS,
  edgeScrollStep,
  filterCount,
  filterLabel,
  PANEL_MAX_WIDTH,
  PANEL_MIN_WIDTH,
  queueOrder,
  queueSection,
  reorderedQueue,
  rowVerbs,
  todoFilters,
  todoSearchFields,
  todoSections,
  todoWaitingSections,
  todoSummary,
  conditionCount,
  conditionQuery,
  NO_CONDITIONS,
  NO_ROOM,
  patchedBoard,
  sameItemsKept
} from "~/domain/todos";
import { movedEnoughToDrag, rowAtPoint, startsRowDrag } from "~/domain/row-drag";

import type {
  DeployView,
  JobQuestion,
  ItemTestbedTurn,
  QueuePauseChanged,
  RoomSummary,
  ItemRuns,
  StatusView,
  TodoAction,
  TodoBoard,
  TodoBoardRow,
  TodoItem
} from "#shared/types";
import type { SearchMatch } from "bmo-ui/shared/search";
import type { RowVerb, TodoActFields, TodoConditions, TodoFilter } from "~/domain/todos";
import type { DragPoint, RowBox } from "~/domain/row-drag";
import type { LogPlace } from "~/domain/log";
import type { ContextMenuItem } from "@nuxt/ui";

interface Props {
  // Where this panel is standing: the column beside the room, or the drawer a narrow screen
  // opens over it. The drawer has no width of its own and nothing to fold away, so it closes
  // rather than collapses and the page it belongs to is the one that closes it.
  place: "aside" | "drawer";
}

const props = defineProps<Props>();
const { t } = useI18n();
// The model each row names as the one its work will go out on, read while the panel stands (docs/web.md, the TODO
// panel's section).
useTodoModelPlan();

const emit = defineEmits<{
  close: [];
}>();

const EMPTY: TodoBoard = {
  queue: [],
  pending: [],
  held: [],
  merged: [],
  done: [],
  doneTotal: 0,
  standingNotes: [],
  choices: { workers: [], chats: [], requesters: [] },
  standing: { queue: 0, running: 0, deploy: 0, deploying: 0, pending: 0, held: 0, merged: 0 },
  paused: false,
  deployHold: null
};

// How much one arrow key moves the edge, for a hand that is on the keyboard.
const DRAG_STEP_PX = 16;

// How often the countdown on an open question is redrawn. It is a clock and nothing else: what
// the questions say is read when the bot says one was asked or settled.
const TICK_MS = 1_000;

// How long typing settles before the archive is asked. Long enough that a word typed straight
// through is one read rather than one per letter, short enough that it answers as he stops.
const SEARCH_SETTLE_MS = 250;

const { data: rooms } = useFetch<RoomSummary[]>("/api/rooms", {
  key: "rooms",
  lazy: true,
  server: false,
  default: () => []
});
// The rooms a line names its request's room by, kept the same while no room's number or name moved: the room list is
// read again on every room's message, and a line handed it anew would be drawn again for a count it does not show.
const roomNames = computed<RoomSummary[]>((before) => {
  const now = rooms.value;
  const same = before !== undefined && before.length === now.length && before.every((room, at) => room.chatId === now[at]!.chatId && room.title === now[at]!.title);

  return same ? before : now;
});

// The repositories an item may go to, out of the one catalogue read every screen shares: the list is the agency's,
// so this panel holds none of its own and a repository the owner adds stands here without a change.
const { agents } = useAgentCatalogue();

const workers = computed(() => agents.value.agents.filter((agent) => agent.kind === "repository"));

// The deployment the title bar reads, which says on a row whose item it carries whether it is being tested or put
// live (docs/web.md, the TODO panel's section).
const { data: deployView } = useNuxtData<DeployView>("deploy");

// Each running item's turn in the testbed's queue, read again on the stream's `testbed` word and whenever the stream
// opens (docs/web.md, the TODO panel's section).
const { data: testbedRead, refresh: readTestbed } = useFetch<{ items: ItemTestbedTurn[] }>("/api/todos/testbed", { key: "todo-testbed", lazy: true, server: false });

useTestbedEvents(() => {
  void readTestbed();
});

const testbedTurns = computed(() => new Map((testbedRead.value?.items ?? []).map((turn) => [turn.itemId, turn])));

const board = ref<TodoBoard>(EMPTY);
// The board with the rows a deployment under way carries told from those still waiting for one, which the deploy view
// says and the board does not: what the sections, the chips' counts and the strip read.
const shownBoard = computed(() => withDeploying(board.value, deployView.value));
// What the jobs have stopped to ask him, and the clock the countdown on an open one is read
// against. The questions are the console's own one reading of them — the strip that stands over
// every screen is looking at the same list, so the panel and the strip cannot disagree about
// whether a job is still waiting. The clock moves on its own second.
const { all: questions } = useOpenQuestions(t);
// The second the lines' times, waits and countdowns are read against. Only the panel being looked at moves it; a hidden
// one's stands still until it is shown. It is handed to the parts of a line that show a time, which read it on their
// own, so nothing the list itself is drawn from reads it and a tick redraws those parts alone (docs/web.md, the TODO
// panel's section).
const now = ref(toUnixSeconds(Date.now()));
usePolling(() => {
  if (showsDetail.value) now.value = toUnixSeconds(Date.now());
}, TICK_MS);
provideTodoClock(now);
// Which question is being answered, what is typed into each one's own box, and what came back
// when an answer arrived too late.
const pending = ref(false);
const loaded = ref(false);
let boardGeneration = 0;
onScopeDispose(() => { boardGeneration++; });
// A read for the next page of finished items, which is its own wait: the list stays on the
// screen and only its foot says that more is coming.
const loadingMore = ref(false);
// What he is looking for, as the search box hands it over, and the wait that keeps a read off every keystroke. What
// the list is drawn from reads only whether there is a phrase at all, so a keystroke draws no row.
const search = ref("");
const hasPhrase = computed(() => search.value.trim() !== "");
// The phrase the rows on the screen were found with, which is what their marks are drawn from.
const searched = ref("");
let searching: ReturnType<typeof setTimeout> | null = null;
// The foot of the list. Coming into view is what asks for the next page — the browser's own
// observer says so without a scroll handler counting pixels on every frame.
const listFoot = ref<HTMLElement | null>(null);
let watcher: IntersectionObserver | null = null;
const failure = ref<string | null>(null);
// Why the board itself could not be read, apart from what a change or one row's read refused.
const boardFailure = ref("");
// Which item is open, and which buttons are waiting on the bot. A press waits under its own
// button's name — the item, the verb and the direction — so the one that was pressed is the one
// that spins, and two that are allowed to run at once each spin on their own.
const route = useRoute();
const router = useRouter();

const opened = ref<number | null>(null);

// The width the aside itself appears at. The dialog is drawn by one panel at a time and this is
// how that one is known: below it the aside is on the screen only as a hidden element and the
// drawer is what a person is reading, above it there is no drawer to read. It is the breakpoint
// the aside's own class uses, said here because a media query is what a script can ask.
const PANEL_QUERY = "(min-width: 1280px)";
const wideEnoughForAside = useNarrow(PANEL_QUERY);
const showsDetail = computed(() => (props.place === "aside" ? wideEnoughForAside.value : !wideEnoughForAside.value));

// A panel coming into view reads its lines against the present at once, not a second later.
watch(showsDetail, (shown) => {
  if (shown) now.value = toUnixSeconds(Date.now());
});

// Whether a row stands its lines under its title, on the same width every dialog in this console
// changes shape at.
const narrow = useNarrow();

// The row the dialog is reading. It is looked up rather than held, so a row that has just been
// re-read from the bot is the one on the screen and not the copy that was opened.
const readingItem = computed<TodoItem | null>(() => (opened.value === null ? null : itemOf(opened.value) ?? null));

const busy = ref(new Set<string>());
// One short line about what just happened, for a change that moves a row somewhere else, and the
// row it is about where there is one — which is what makes the line pressable.
const notice = ref<string | null>(null);
const noticeTodo = ref<number | null>(null);

const { width, collapsed, setWidth, setCollapsed } = useTodoPanelLayout();
const { view, setView } = useTodoView();

const dragging = ref(false);

// Which row is being carried by its handle, which row it is over, and whether an order is on its
// way to the bot. The panel does not re-read while any of that is going on: a re-read in the
// middle of it would put the rows back in the order the table still has, taking the drag or the
// half-saved order with it.
const held = ref<number | null>(null);
const over = ref<number | null>(null);
const saving = ref(false);
// A press on the auto-progression switch that has not come back yet.
const switching = ref(false);

// The press a handle is under, until it lets go: where it went down, where it is now, and what
// it is held on. Nothing here is on the screen, so it is not reactive — what the screen shows of
// a drag is held and over. The timer beside it is the list creeping at an edge.
let press: { id: number; pointer: number; from: DragPoint; at: DragPoint; handle: HTMLElement } | null = null;
let drift: ReturnType<typeof setInterval> | null = null;

// The scrolling part of the panel, which is where its rows are and nobody else's.
const listRoot = ref<HTMLElement | null>(null);

// The conditions: how many are set, whether their popover stands, and what each one is picked
// out of. A select cannot carry an empty value, so "any" has a name of its own here and is
// written back as no condition. Every list is the table's own columns — the workers the catalogue
// knows and any other a row still names, the rooms and names requests were filed from — so a
// worker, a room or a person added later stands here without a change.
const ANY = "*";
const conditionsOpen = ref(false);
const conditionsSet = computed(() => conditionCount(view.value.conditions));

const conditionFields = computed<{ key: keyof TodoConditions; label: string; items: { label: string; value: string }[] }[]>(() => {
  const choices = board.value.choices;
  const known = new Set(workers.value.map((agent) => agent.name));
  const any = { label: t("common.label.all"), value: ANY };

  return [
    {
      key: "worker",
      label: t("todo.label.field_worker"),
      items: [
        any,
        ...workers.value.map((agent) => ({ label: agent.label ?? agent.name, value: agent.name })),
        ...choices.workers.filter((name) => !known.has(name)).map((name) => ({ label: name, value: name }))
      ]
    },
    {
      key: "unfinished",
      label: t("todo.label.field_unfinished"),
      items: [any, { label: t("todo.label.unfinished_remaining"), value: "open" }, { label: t("todo.label.unfinished_resolved"), value: "resolved" }]
    },
    {
      key: "chat",
      label: t("todo.label.requested_room"),
      items: [
        any,
        ...choices.chats.map((chat) =>
          chat === null
            ? { label: t("todo.label.no_room"), value: NO_ROOM }
            : { label: (rooms.value ?? []).find((room) => room.chatId === chat)?.title ?? String(chat), value: String(chat) }
        )
      ]
    },
    {
      key: "requester",
      label: t("todo.label.requested_by"),
      items: [any, ...choices.requesters.map((name) => ({ label: name, value: name }))]
    }
  ];
});

function setConditions(next: TodoConditions): void {
  setView({ ...view.value, conditions: next });
}

function setCondition(key: keyof TodoConditions, choice: string): void {
  setConditions({ ...view.value.conditions, [key]: choice === ANY ? null : choice });
}

// The state tabs, each carrying how many rows its state holds in the whole table. A tab whose state
// holds none carries nothing, so a badge is always news.
const filterTabs = computed(() =>
  todoFilters().map((choice) => {
    const count = loaded.value ? filterCount(shownBoard.value, choice) : null;

    return {
      value: choice,
      label: filterLabel(t, choice),
      count: count ?? 0,
      badge: count === null || count === 0 ? undefined : { ...COUNT_BADGE, color: "neutral" as const }
    };
  })
);
const questionCount = computed(() => questionSummary(t, questions.value, now.value));
// The questions not yet settled, by the item whose job asked them: what a row's badge reads, against the clock, to say
// whether its job stands still behind one.
const askedOf = computed(() => {
  const asked = new Map<number, JobQuestion[]>();

  for (const question of questions.value) {
    if (question.settledAt === null) asked.set(question.todoId, [...(asked.get(question.todoId) ?? []), question]);
  }

  return asked;
});
const sections = computed(() => todoSections(t, shownBoard.value, view.value, hasPhrase.value));

// Where each row on the screen matched the phrase it was found with, read once as the answer arrives: a wait line is
// matched as it read in that second, so the clock redraws no row for it. An item a re-read kept as it was, found by the
// same phrase against the same rooms, keeps where it was found, so its row is handed nothing new.
let matchesBefore: { query: string; rooms: RoomSummary[] | null | undefined; found: WeakMap<TodoItem, SearchMatch | null> } = {
  query: "",
  rooms: null,
  found: new WeakMap()
};
const rowMatches = computed(() => {
  const matches = new Map<number, SearchMatch | null>();

  if (searched.value === "") {
    return matches;
  }

  const at = toUnixSeconds(Date.now());
  const same = matchesBefore.query === searched.value && matchesBefore.rooms === rooms.value;
  const kept = same ? matchesBefore.found : new WeakMap<TodoItem, SearchMatch | null>();

  for (const item of sections.value.flatMap((section) => section.items)) {
    const match = kept.has(item) ? kept.get(item)! : matchFields(todoSearchFields(t, item, rooms.value ?? [], at), searched.value);

    kept.set(item, match);
    matches.set(item.id, match);
  }

  matchesBefore = { query: searched.value, rooms: rooms.value, found: kept };

  return matches;
});

// The tab is what the list is: a search or a condition narrows the same list, and its rows move within it, while
// another tab is another list.
const listKey = computed(() => view.value.filter);
const filterIndex = computed(() => todoFilters().indexOf(view.value.filter));

// The titles that stand while the board is still being read, with how many placeholder rows go
// under each.
const waitingSections = computed(() => todoWaitingSections(t, view.value, hasPhrase.value));
const doneTailLine = computed(() =>
  doneTail(t, { shown: board.value.done.length, total: board.value.doneTotal, searching: hasPhrase.value })
);
// How many rows the search and the conditions found, once the answer stands.
const searchTallyLine = computed(() =>
  (hasPhrase.value || conditionsSet.value > 0) && loaded.value && !pending.value ? searchTally(t, board.value) : null
);
const queueRows = computed(() => sections.value.find((section) => section.key === "queue")?.items ?? []);
const summary = computed(() => todoSummary(t, shownBoard.value));

// Dragging the edge: leftward widens, and the width is written down as it settles.
function onDragStart(event: PointerEvent): void {
  if (event.button > 0) {
    return;
  }

  // Without this the drag takes the text beside it with it.
  event.preventDefault();

  const handle = event.currentTarget as HTMLElement;
  const startX = event.clientX;
  const startWidth = width.value;

  dragging.value = true;

  try {
    handle.setPointerCapture(event.pointerId);
  } catch {
    // A pointer the browser will not let us hold is still one we can follow while it is down.
  }

  const onMove = (moved: PointerEvent): void => {
    width.value = clampPanelWidth(startWidth + (startX - moved.clientX));
  };

  const onUp = (): void => {
    dragging.value = false;
    setWidth(width.value);
    handle.removeEventListener("pointermove", onMove);
    handle.removeEventListener("pointerup", onUp);
    handle.removeEventListener("pointercancel", onUp);
  };

  handle.addEventListener("pointermove", onMove);
  handle.addEventListener("pointerup", onUp);
  handle.addEventListener("pointercancel", onUp);
}

// One read of the whole board. The finished list comes as far back as it is asked for, and what
// is being searched for goes with it: the search reaches the archive, not the rows in hand, so
// a row still in the queue is found as readily as one finished months ago.
async function read(limit: number, more = false): Promise<void> {
  const generation = ++boardGeneration;
  const query = search.value.trim();
  const conditions = view.value.conditions;
  pending.value = !more;
  loadingMore.value = more;
  failure.value = null;
  boardFailure.value = "";
  try {
    const answer = await $fetch<TodoBoard>("/api/todos", {
      query: { done: limit, ...(query === "" ? {} : { q: query }), ...conditionQuery(conditions) }
    });
    if (generation !== boardGeneration || query !== search.value.trim() || conditions !== view.value.conditions) return;
    // Every item that came back as it was stays the one its row was drawn from.
    board.value = sameItemsKept(board.value, answer);
    searched.value = query;
    loaded.value = true;
  } catch (error) {
    if (generation === boardGeneration && query === search.value.trim() && conditions === view.value.conditions) boardFailure.value = failureText(error, t("todo.error.load_failed"));
  } finally {
    if (generation === boardGeneration) {
      pending.value = false;
      loadingMore.value = false;
    }
  }
}

async function reload(): Promise<void> {
  await read(keptDoneLimit(board.value.done.length));
}

// The lines of the items a word named, put in where they stand. A search or a condition narrows the board by what a
// line holds, and a line that left its list or was never on the page changes which lines the board holds, so either
// reads the whole board instead. A whole read begun meanwhile is newer than this one, which then puts nothing in.
async function readRows(ids: number[]): Promise<void> {
  if (searched.value !== "" || conditionsSet.value > 0) return await reload();

  const generation = boardGeneration;

  try {
    const rows = await $fetch<TodoBoardRow[]>("/api/todos/rows", { query: { ids: ids.join(",") } });

    if (generation !== boardGeneration) return;

    const next = rows.length === ids.length ? patchedBoard(board.value, rows) : null;

    if (next === null) return await reload();

    board.value = next;
  } catch {
    await reload();
  }
}

const boardRead = useReadFailure({ failed: () => boardFailure.value !== "", reading: () => pending.value, reread: () => void reload() });

// The next page of finished items, asked for as he reaches the end of the ones he has. One read
// at a time: the sentinel at the foot of the list can come into view again while a read for it
// is still going, and asking twice for the same page would only answer the same thing twice.
async function loadMore(): Promise<void> {
  const next = nextDoneLimit(board.value.done.length, board.value.doneTotal);

  // Nothing is fetched while a row is in the air or an order is on its way: rows arriving below
  // would move the ground under a drag, and the read would race the order being saved.
  if (next === null || loadingMore.value || pending.value || held.value !== null || saving.value) {
    return;
  }

  await read(next, true);
}

// What he is looking for. Every keystroke would be a read of the archive, so it waits for him to
// stop typing; the list goes back to the first page each time, since the run he had scrolled
// through belongs to what he was looking at before.
function onSearch(phrase: string): void {
  search.value = phrase;
  boardGeneration++;
  pending.value = true;
  loadingMore.value = false;
  if (searching !== null) {
    clearTimeout(searching);
  }

  searching = setTimeout(() => {
    searching = null;
    void reloadFromTop();
  }, SEARCH_SETTLE_MS);
}

async function reloadFromTop(): Promise<void> {
  await read(DONE_PAGE_SIZE);
}

// A change of conditions is a different list, so it is read from the first page like a new search.
watch(
  () => view.value.conditions,
  () => {
    boardGeneration++;
    void reloadFromTop();
  }
);

// Opening an item brings up whatever word is already on it, so saving does not wipe it by
// accident and closing it leaves nothing behind.
function toggle(id: number): void {
  const open = opened.value === id;

  opened.value = open ? null : id;

  // A row the reader closed is not opened again by going back onto an address that names it.
  if (open) todoClosed(id);

  // Closing the row it was sent to takes the address back to the room, so a reload does not open
  // it again after he has done with it.
  if (open && todoOfQuery(route.query.todo) === id) {
    void router.replace({ query: { ...route.query, todo: undefined } });
  }

  notice.value = null;
  noticeTodo.value = null;
  detail.value?.toggled(id, open, itemOf(id)?.note ?? "");
}

// However the dialog was dismissed — the close button, the backdrop, the escape key or the back
// gesture — it lets go of the row through the same toggle the row's own press uses.
function dismiss(): void {
  if (opened.value !== null) {
    toggle(opened.value);
  }
}

function itemOf(id: number): TodoItem | undefined {
  return boardItem(id) ?? (stray.value?.id === id ? stray.value : undefined);
}

function boardItem(id: number): TodoItem | undefined {
  return [...board.value.queue, ...board.value.pending, ...board.value.held, ...board.value.merged, ...board.value.done].find(
    (item) => item.id === id
  );
}

// A row opened by a link that the board in hand does not carry — a finished item further back
// than the page — read on its own, so the link opens it all the same.
const stray = ref<TodoItem | null>(null);

async function fetchStray(id: number): Promise<void> {
  if (itemOf(id) !== undefined) {
    return;
  }

  await readStray(id);
}

async function readStray(id: number): Promise<void> {
  try {
    stray.value = await $fetch<TodoItem>(`/api/todos/${id}`);
  } catch (error) {
    failure.value = failureText(error, t("todo.error.item_read_failed", { id }));
  }
}

// The dialog the open row is read in, and what it acts through: which row is open, the buttons
// waiting on the bot, the line under the list, the board and the clock, and the panel's one road
// to the bot, so a change made in the dialog is the one the row beside it shows.
const detail = useTemplateRef<{
  toggled: (id: number, closed: boolean, word: string) => void;
  asked: (id: number, word: string) => Promise<void>;
  reread: (id: number) => void;
}>("detail");
const shared = { opened, busy, failure, notice, noticeTodo, board, questions, now, rooms, act, reload, fetchStray };

// What the open item shows that the board does not bring back: the words added to it, and the
// item itself where a link opened one further back than the page. Either can be what the bot's
// word that the queue moved was about.
function rereadOpened(): void {
  if (opened.value !== null) {
    detail.value?.reread(opened.value);
  }

  if (stray.value !== null && boardItem(stray.value.id) === undefined) {
    void readStray(stray.value.id);
  }
}

// What the panel does goes through the bot, and the bot's own event brings the new list back.
// The reload here is what makes it immediate for the one who pressed the button. A press that fails
// says so in the words of what was pressed where it names them, and in the general line otherwise.
async function act(id: number, action: TodoAction, fields: TodoActFields = {}, failureKey = "todo.error.change_failed"): Promise<void> {
  const key = busyKey(id, action, fields.direction);

  busy.value.add(key);

  try {
    await $fetch("/api/todos", { method: "POST", body: { action, id, ...fields } });
    failure.value = null;
    await reload();
  } catch (error) {
    failure.value = failureText(error, t(failureKey));
  } finally {
    busy.value.delete(key);
  }
}

// The model an item's jobs go out on, written to its labels; nothing else about the row moves, and a job already
// running keeps its road.


// The auto-progression stopped or started again. The press goes to the bot, which writes the
// switch and — on a resume — looks at the queue in the same breath; the board is read again after
// it, so the strip and the button say what is now true. Every other screen hears the same news
// through the queue event the bot raises, which this panel already re-reads on.
async function switchPause(paused: boolean): Promise<void> {
  switching.value = true;

  try {
    const answer = await $fetch<QueuePauseChanged>("/api/queue-pause", { method: "POST", body: { paused } });

    failure.value = null;
    await reload();
    // A resume lets go of his pause alone; a deployment's hold still standing is said with what it
    // waits for, since nothing will move until it goes.
    notice.value = paused
      ? t("todo.message.auto_paused")
      : answer.deployHold && holdSummary.value !== ""
        ? t("todo.message.auto_resumed_hold_stands", { hold: holdSummary.value })
        : t("todo.message.auto_resumed");
  } catch (error) {
    failure.value = failureText(error, t("todo.error.auto_change_failed"));
  } finally {
    switching.value = false;
  }
}

// The deployment's hold, apart from his pause: the band says which Jobs' end the batch goes up
// after, and pressing it opens the title bar's deployment popover, which shows the hold whole and
// lets it go. A panel that stands as a drawer over the screen steps aside for the popover.
const island = useIsland(t);
const askFirst = useConfirm();
const deployOpen = useState<boolean>("deploy-open", () => false);
const todoOpen = useState<boolean>("todo-open", () => false);
const holdSummary = computed(() => {
  const hold = board.value.deployHold;

  return hold === null ? "" : `${t("deploy.status.hold")} · ${holdWaits(t, hold)}`;
});

function openDeploy(): void {
  if (props.place === "drawer") {
    todoOpen.value = false;
  }

  deployOpen.value = true;
}

// ---- A row's own menu ---------------------------------------------------------------------------

// What each act of the menu is called and wears, and what the line under the list says once it
// went through. Throwing out, a job's log and adding words say their own.
const ROW_VERBS: Record<RowVerb, { label: string; icon: string; done?: string }> = {
  log: { label: "todo.action.job_log", icon: "i-material-symbols-engineering-outline" },
  approve: { label: "todo.action.approve", icon: "i-material-symbols-check", done: "todo.message.approved" },
  unapprove: { label: "todo.action.unapprove", icon: "i-material-symbols-undo", done: "todo.message.unapproved" },
  hold: { label: "todo.title.section_held", icon: "i-material-symbols-pause", done: "todo.message.held" },
  release: { label: "todo.action.unhold", icon: "i-material-symbols-play-arrow", done: "todo.message.unheld" },
  top: { label: "todo.action.move_top", icon: "i-material-symbols-keyboard-double-arrow-up" },
  done: { label: "todo.action.mark_done", icon: "i-material-symbols-task-alt", done: "todo.message.marked_done" },
  append: { label: "todo.title.notes", icon: "i-material-symbols-add-comment-outline" },
  drop: { label: "todo.action.discard", icon: "i-material-symbols-delete-outline" }
};

// The list's one menu, drawn apart from the list: a press on a row hands it that row's acts and the point pressed,
// so nothing the list draws reads the menu, and opening it, closing it or asking it over another row draws no row
// again (docs/web.md, 「Floating things」).
const menuSurface = useTemplateRef<HTMLElement>("menuSurface");
const rowMenu = useTemplateRef<{ openAt: (acts: ContextMenuItem[][], at: { x: number; y: number }) => void }>("rowMenu");
// The row whose approval the menu was asked to take back, waiting on the question it grew.
const unapproving = ref<number | null>(null);

// A right press over the list, or the held finger's: never the browser's own menu, and the row's menu where the
// press landed on a row something can be done to. A press over no row opens none, nor does a finger resting on a
// row's handle, which is carrying the row rather than asking about it. A press already turned away, the browser's
// own long press under a finger, is left alone.
function askRowMenu(event: MouseEvent): void {
  if (event.defaultPrevented) return;

  event.preventDefault();

  const target = event.target as Element | null;
  const id = Number(target?.closest("[data-todo-id]")?.getAttribute("data-todo-id") ?? Number.NaN);
  const item = Number.isInteger(id) ? itemOf(id) : undefined;

  if (item === undefined || target?.closest("[data-drag-handle]") != null) return;

  const acts = rowActs(item);

  if (acts.length > 0) rowMenu.value?.openAt(acts, { x: event.clientX, y: event.clientY });
}

// The acts of one row's menu, in their groups.
function rowActs(item: TodoItem): ContextMenuItem[][] {
  const verbs = rowVerbs(item, board.value.queue);
  const entry = (verb: RowVerb): ContextMenuItem => ({
    label: t(ROW_VERBS[verb].label),
    icon: ROW_VERBS[verb].icon,
    ...(verb === "drop" ? { color: "error" as const } : {}),
    onSelect: () => void runRowVerb(item, verb)
  });
  // What takes something away stands apart at the end, never next to an act that only reads.
  const takesAway = (verb: RowVerb): boolean => verb === "drop" || verb === "unapprove";

  return [
    verbs.filter((verb) => verb === "log"),
    verbs.filter((verb) => verb !== "log" && !takesAway(verb)),
    verbs.filter(takesAway)
  ]
    .filter((group) => group.length > 0)
    .map((group) => group.map(entry));
}

// A held finger opens the menu through the console's one long press; the finger's lift that follows
// is not also a press on the row under it.
useHoldMenu({ surface: () => menuSurface.value });

const AFTER_MENU_MS = 1500;
let menuHeldAt = 0;
let pressedBy = "mouse";

function notePointer(event: PointerEvent): void {
  pressedBy = event.pointerType;
}

function onRowMenu(open: boolean): void {
  if (open && pressedBy === "touch") menuHeldAt = Date.now();
}

function swallowLift(event: MouseEvent): void {
  if (Date.now() - menuHeldAt < AFTER_MENU_MS) {
    event.preventDefault();
    event.stopPropagation();
    menuHeldAt = 0;
  }
}

// The log of the job running a row, the agent it is the log of and the run to open at. The state is the tab's,
// so the panel a person is reading draws the dialog whichever panel took the press; only that one has its dialog
// mounted.
const logOpen = useState<boolean>("todo-job-log-open", () => false);
const logAgent = useState<string | null>("todo-job-log-agent", () => null);
const logPlace = useState<LogPlace | null>("todo-job-log-place", () => null);

// The row says a job runs it, or ran it; which agent that job is and the run to follow, the live picture of runs
// says, and where no run of the item is live, the item's runs name its latest job. A job that cannot be found has
// no log to open, so the press answers with the message pill rather than leaving only a line under the list.
async function openJobLog(item: TodoItem): Promise<void> {
  try {
    const { live } = await $fetch<StatusView>("/api/status");
    const run = live.find((one) => one.kind === "worker" && one.todoId === item.id);
    const place = run === undefined ? (await $fetch<ItemRuns>(`/api/todos/${item.id}/runs`)).latest : { agent: run.agent, run: run.unit ?? String(run.id) };

    if (place === null) {
      island.say({ tone: "warning", title: t("todo.error.job_ended", { id: item.id }) });

      return;
    }

    logAgent.value = place.agent;
    logPlace.value = { run: place.run, only: true };
    logOpen.value = true;
  } catch (error) {
    island.fail(error, t("todo.error.job_read_failed", { id: item.id }));
  }
}

// Words added from the menu.
const appendOpen = ref(false);
const appendItem = ref<TodoItem | null>(null);
const appendText = ref("");
const appendFailure = ref<string | null>(null);
const appending = ref(false);

async function runRowVerb(item: TodoItem, verb: RowVerb): Promise<void> {
  if (verb === "log") {
    await openJobLog(item);

    return;
  }

  if (verb === "append") {
    appendItem.value = item;
    appendText.value = "";
    appendFailure.value = null;
    appendOpen.value = true;

    return;
  }

  // Throwing a row out is the one act here that cannot be taken back, so it is asked once more.
  if (verb === "drop") {
    const sure = await askFirst({
      title: t("todo.message.discard_confirm", { id: item.id }),
      item: item.title,
      effect: t("todo.message.discard_effect"),
      confirm: t("todo.action.discard")
    });

    if (!sure) return;

    await act(item.id, "drop");

    if (failure.value === null) notice.value = t("todo.message.discarded", { id: item.id });

    return;
  }

  // Taking an approval back stops the item between its steps, so it is asked once more too, as a
  // step the row grows.
  if (verb === "unapprove") {
    unapproving.value = item.id;

    return;
  }

  await act(item.id, verb);

  const said = ROW_VERBS[verb].done;

  if (failure.value === null && said !== undefined) notice.value = t(said, { id: item.id });
}

// The question stands until the press it started comes back, its button wearing the spinner.
async function unapprove(item: TodoItem): Promise<void> {
  await act(item.id, "unapprove");
  unapproving.value = null;

  if (failure.value === null) notice.value = t("todo.message.unapproved", { id: item.id });
}

async function sendAppend(): Promise<void> {
  const item = appendItem.value;
  const said = appendText.value.trim();

  if (item === null || said === "") return;

  appending.value = true;

  try {
    await $fetch("/api/todos", { method: "POST", body: { action: "append", id: item.id, text: said } });
    appendOpen.value = false;
    failure.value = null;
    notice.value = t("todo.message.note_added", { id: item.id });
    await reload();
  } catch (error) {
    // Nothing was written, so what he typed stays in the box to send again.
    appendFailure.value = failureText(error, t("todo.error.note_send_failed"));
  } finally {
    appending.value = false;
  }
}

// Carrying a row by its handle. It is one press for the mouse, the pen and the finger alike:
// the browser's own drag-and-drop never fires for a touch, so nothing here is built on it. The
// press is held until it has travelled far enough to be a drag, so a tap on a handle is a tap.
function onHandleDown(id: number, event: PointerEvent): void {
  if (!startsRowDrag(event)) {
    return;
  }

  // Without this the press takes the text beside it with it, and a mouse starts selecting.
  event.preventDefault();

  const handle = event.currentTarget as HTMLElement;
  const from = { x: event.clientX, y: event.clientY };

  press = { id, pointer: event.pointerId, from, at: from, handle };

  try {
    // Held on the handle, so a drag that wanders off it — over the rows, out of the panel — goes
    // on being reported to the handle rather than to whatever it is passing over.
    handle.setPointerCapture(event.pointerId);
  } catch {
    // A pointer the browser will not let us hold is still one we can follow while it is down.
  }

  handle.addEventListener("pointermove", onHandleMove);
  handle.addEventListener("pointerup", onHandleUp);
  handle.addEventListener("pointercancel", onHandleCancel);
}

function onHandleMove(event: PointerEvent): void {
  if (press === null || event.pointerId !== press.pointer) {
    return;
  }

  press.at = { x: event.clientX, y: event.clientY };

  if (held.value === null && !movedEnoughToDrag(press.from, press.at)) {
    return;
  }

  held.value = press.id;
  over.value = rowAtPoint(queueBoxes(), press.at.y);
  creep();
}

// A queue longer than the panel is walked through by carrying a row to an edge and holding it
// there, the way a list scrolls under a drag anywhere else. The row under the pointer is asked
// again on every step, since it is the rows that are moving and not the hand.
function creep(): void {
  const root = listRoot.value;

  if (root === null || press === null) {
    return;
  }

  const box = root.getBoundingClientRect();
  const step = edgeScrollStep(box, press.at.y);

  if (step === 0) {
    stopCreep();

    return;
  }

  if (drift !== null) {
    return;
  }

  drift = setInterval(() => {
    if (press === null || held.value === null || listRoot.value === null) {
      stopCreep();

      return;
    }

    const now = edgeScrollStep(listRoot.value.getBoundingClientRect(), press.at.y);

    if (now === 0) {
      stopCreep();

      return;
    }

    listRoot.value.scrollTop += now;
    over.value = rowAtPoint(queueBoxes(), press.at.y);
  }, EDGE_STEP_MS);
}

function stopCreep(): void {
  if (drift !== null) {
    clearInterval(drift);
    drift = null;
  }
}

// Letting go on a row is the drop. A press that never became a drag lets go of nothing, and a
// pointer the browser takes away — a gesture the system claimed, a window that went — is the
// same as letting go over nothing.
function onHandleUp(event: PointerEvent): void {
  const dragged = held.value;
  const onto = dragged === null ? null : rowAtPoint(queueBoxes(), event.clientY);

  endPress();

  if (dragged !== null && onto !== null && onto !== dragged) {
    void saveOrder(dragged, onto);
  }
}

function onHandleCancel(): void {
  endPress();
}

function endPress(): void {
  const current = press;

  stopCreep();
  press = null;
  held.value = null;
  over.value = null;

  if (current === null) {
    return;
  }

  current.handle.removeEventListener("pointermove", onHandleMove);
  current.handle.removeEventListener("pointerup", onHandleUp);
  current.handle.removeEventListener("pointercancel", onHandleCancel);

  if (current.handle.hasPointerCapture(current.pointer)) {
    current.handle.releasePointerCapture(current.pointer);
  }
}

// Where this panel's queue rows stand at this moment. Its own rows alone: the drawer and the
// column beside the room are the same panel twice over, and both are in the page at once.
function queueBoxes(): RowBox[] {
  const root = listRoot.value;

  if (root === null) {
    return [];
  }

  const shown = new Set(queueRows.value.map((item) => item.id));
  const boxes: RowBox[] = [];

  for (const row of root.querySelectorAll<HTMLElement>("[data-todo-id]")) {
    const id = Number(row.dataset.todoId);

    if (shown.has(id)) {
      const box = row.getBoundingClientRect();

      boxes.push({ id, top: box.top, bottom: box.bottom });
    }
  }

  return boxes;
}

// What the screen says while a row is in the air: the row being carried, and the row it would
// drop onto.
function rowMark(id: number): string {
  if (held.value === id) {
    return "border-dashed border-primary opacity-50";
  }

  return over.value === id && held.value !== null ? "border-primary bg-primary/10" : "border-default";
}

// Dropping on a row puts the dragged one ahead of it coming up and behind it going down. The
// whole new order is what the bot is asked for, the rows stand in it at once, and a refusal —
// the queue having moved under the drag — puts them back exactly where they were. A drop that
// leaves the rows standing as they already stood saves nothing, so a stored priority only ever
// moves when the owner has actually moved a row.
async function saveOrder(dragged: number, onto: number): Promise<void> {
  // The whole queue, whatever the tab hides of it: the order the bot is asked to write is the
  // whole of its queue, and the waiting tab leaves out rows that are still part of it.
  const rows = queueSection(board.value);
  const order = reorderedQueue(rows, dragged, onto);
  const before = board.value;

  if (sameOrder(order, queueOrder(rows))) {
    return;
  }

  board.value = boardInOrder(before, order);
  saving.value = true;
  notice.value = null;
  noticeTodo.value = null;

  try {
    await $fetch("/api/todos", { method: "POST", body: { action: "reorder", id: dragged, order } });
    failure.value = null;
    await reload();
  } catch (error) {
    board.value = before;
    failure.value = failureText(error, t("todo.error.order_save_failed"));
  } finally {
    saving.value = false;
  }
}

function sameOrder(left: number[], right: number[]): boolean {
  return left.length === right.length && left.every((id, at) => id === right[at]);
}

// The queue and the questions are read together, because the bot announces both as one piece of
// news: a row approved, moved or dropped, a request filed from another room, a job marking its
// item done, a question asked and a question settled. A work order moving a step on is news for
// the same rows, since a running row says how far its order has come. A re-read that nobody asked
// for waits while a row is in the air or an order is on its way; the button and the change that
// has just been made read whenever they like.
// A word naming the one item it moved reads that item's line alone and puts it in where it stands; a word naming none,
// a burst one of whose words named none, and a stream that came back read the whole board (docs/web.md, the TODO panel's
// section).
let namedItems = new Set<number>();
let namedAll = false;

useBotEvents((event) => {
  if (event.type !== "todo" && event.type !== "work-order" && event.type !== "worker-run") return;

  if (event.todoId === undefined) {
    namedAll = true;
  } else {
    namedItems.add(event.todoId);
  }
});

useLiveRefresh(
  (cause) => {
    const named = namedItems;
    const whole = namedAll || cause !== "event" || named.size === 0;

    namedItems = new Set();
    namedAll = false;

    if (whole) {
      void reload();
      rereadOpened();

      return;
    }

    void readRows([...named]);

    if (opened.value !== null && named.has(opened.value)) detail.value?.reread(opened.value);
    if (stray.value !== null && named.has(stray.value.id) && boardItem(stray.value.id) === undefined) void readStray(stray.value.id);
  },
  {
    // A job the agency ends takes a reporting row to the finished ones, so its end is news for the rows too.
    on: ["todo", "work-order", "worker-run"],
    busy: () => held.value !== null || saving.value
  }
);

// A notification about one item opens that item. The number rides in the address, so the press
// lands on the row itself rather than on a list to search through, and it stays there for as
// long as the row is open: the panel stands twice on this page — beside the room on a wide
// screen and in a drawer on a narrow one — and both read the same address, so taking it off
// would leave whichever of them read it second with nothing to open.
const askedTodo = useAskedTodo();

async function openAsked(): Promise<void> {
  const asked = askedTodo();

  if (asked === null || opened.value === asked) {
    return;
  }

  await fetchStray(asked);

  opened.value = asked;
  await detail.value?.asked(asked, itemOf(asked)?.note ?? "");
}

// The address is read again whenever it moves, not only when the page is first drawn. A press on
// a notification lands here while the console is already open, and so does a press on the line
// that says which row was just raised: both change the address and nothing else, and this is
// what turns that into the row opening.
watch(() => route.query.todo, () => void openAsked());

// The foot of the list coming into view is what asks for the next page. It is watched rather
// than measured on every scroll, and it is watched inside the list's own box, so a panel that
// scrolls its rows without the page moving still reaches its end.
function watchFoot(): void {
  const foot = footOf();

  watcher?.disconnect();

  if (foot === null || listRoot.value === null) {
    return;
  }

  watcher = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void loadMore();
      }
    },
    // A page ahead of the end, so the next one is already coming as he reaches the last rows.
    { root: listRoot.value, rootMargin: "200px" }
  );
  watcher.observe(foot);
}

// The foot is rendered inside a list the sections loop over, so what the template hands back is
// whatever that loop made of it.
function footOf(): HTMLElement | null {
  const held = listFoot.value as HTMLElement | HTMLElement[] | null;

  return Array.isArray(held) ? (held[0] ?? null) : held;
}

onMounted(() => {
  void reload().then(openAsked);

  // The foot appears with the finished section and goes when a filter hides it, so the watch is
  // set again whenever the list is redrawn around it.
  watch(
    () => [footOf(), listRoot.value] as const,
    () => watchFoot(),
    { flush: "post" }
  );
  void nextTick(watchFoot);

  onScopeDispose(() => {
    watcher?.disconnect();

    if (searching !== null) {
      clearTimeout(searching);
    }

    stopCreep();
  });
});
</script>
