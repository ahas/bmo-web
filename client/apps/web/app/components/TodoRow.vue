<template>
  <!-- What one row of the TODO panel's list holds, laid in the row's two columns: the handle's own, and the content.
       The row itself is the panel's, the moving list's own item, so this part is drawn again only when what it is
       handed changed (docs/web.md, the TODO panel's section). -->
  <div class="row-span-6 flex justify-center">
    <!-- The handle is the only thing that starts a drag: a press anywhere else on the row opens it, and a touch
         anywhere else on the panel scrolls it. The handle alone takes the browser's own touch gestures off, so a
         finger that starts here carries the row instead of scrolling. The arrows in the opened row do the same
         thing by keyboard. -->
    <span
      v-if="draggable"
      data-drag-handle
      class="mt-0.5 shrink-0 cursor-grab touch-none select-none text-muted hover:text-highlighted active:text-primary"
      role="img"
      :aria-label="$t('todo.aria.drag_reorder')"
      @pointerdown="emit('handle-down', item.id, $event)"
    >
      <UIcon name="i-material-symbols-drag-indicator" class="size-4" />
    </span>
  </div>

  <!-- A press opens the row's detail over the list, so the mark is the one every row that opens a dialog in this
       console carries, and it says the same thing whichever row is open. The keyboard reaching it rings the whole
       row in the row's own corners, while a press is still taken by the title alone. -->
  <!-- The title gives way and wraps, so however long it is the mark stays at the row's end and the panel never
       scrolls sideways. -->
  <button
    type="button"
    class="flex min-w-0 items-start gap-2 text-start after:pointer-events-none after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:outline-solid focus-visible:after:outline-offset-(--bmo-focus-gap)"
    @click="emit('open', item.id)"
  >
    <span class="flex min-w-0 flex-1" :class="narrow ? 'flex-col' : 'items-start gap-2'">
      <SearchText class="shrink-0 text-sm text-muted tabular-nums" :text="`#${item.id}`" :query="query" />
      <SearchText class="min-w-0 flex-1 text-sm text-highlighted [overflow-wrap:anywhere]" :text="item.title" :query="query" />
    </span>
    <UIcon name="i-material-symbols-chevron-right" class="mt-0.5 size-4 shrink-0 text-muted" />
  </button>

  <!-- The lines a row says in words stand under its title, and its chips stand last, at the row's foot. The lines
       are a moving list of their own, so one that comes unfolds its height under the title and one that goes
       folds it, each holding the space above it as its own top padding so that space folds with it (docs/web.md,
       「Motion」). -->
  <MovingList tag="div" class="flex flex-col" data-item-lines>
    <!-- A long wait the running job marked for itself, which reads the panel's clock on its own. -->
    <TodoWaitLine v-if="item.waiting !== null" key="waiting" :item="item" :query="query" />

    <!-- The job's own command in the testbed's queue, holding a seat or waiting its place: a line of the row like
         the wait above, with no hover or press of its own. The place turns as the line moves up, and the command
         is machine text. -->
    <p v-if="testbedTurn !== null" key="testbed" class="flex items-start gap-1 pt-1 text-sm break-words text-muted tabular-nums" data-item-testbed>
      <UIcon name="i-material-symbols-science-outline" class="mt-0.5 size-4 shrink-0" />
      <i18n-t :keypath="testbedLineKey(testbedTurn)" tag="span" class="min-w-0" scope="global">
        <template #command><span class="font-mono [overflow-wrap:anywhere]">{{ testbedTurn.command }}</span></template>
        <template #n><RollingNumber :value="testbedTurn.place ?? 0" /></template>
      </i18n-t>
    </p>

    <!-- A backlog deployment holding the queue until this job ends: a line of the row like the wait above, with
         no hover or press of its own. -->
    <p v-if="deployWaitsLine($t, item) !== null" key="deploy-waits" class="flex items-start gap-1 pt-1 text-sm break-words text-muted">
      <UIcon name="i-material-symbols-rocket-launch-outline" class="mt-0.5 size-4 shrink-0 text-info" />
      <SearchText class="min-w-0" :text="deployWaitsLine($t, item) ?? ''" :query="query" />
    </p>

    <!-- A stopped order at the head of its worker's queue says its turn alone, one short line; what stopped it and
         why it waits stand whole in the item's detail, and how many times it failed is a badge below. -->
    <p v-if="stoppedLine($t, item) !== null" key="stopped" class="pt-1 text-sm break-words text-warning">
      <SearchText :text="stoppedLine($t, item) ?? ''" :query="query" />
    </p>

    <!-- A finished row that was merged says where its work was done; an open one says it in its badge. -->
    <p v-if="item.done && item.mergedInto !== null" key="merged" class="pt-1 text-sm text-muted">
      <SearchText :text="$t('todo.label.field_merged_into', { id: item.mergedInto })" :query="query" />
    </p>

    <!-- An order holding its worker's checkout and unable to use it: what is in the way, in the runner's own
         words. The same line `bun scripts/running.ts` prints. -->
    <p v-if="item.holding !== null" key="holding" class="pt-1 text-sm break-words text-muted">
      <SearchText :text="$t('todo.label.field_checkout_reason', { reason: item.holding })" :query="query" />
    </p>
  </MovingList>

  <div class="mt-1 flex flex-wrap items-center gap-1">
    <!-- Where the item's work stands on its way live — waiting for its batch, waiting its turn in the deployment
         line, being put live, or its deployment failed — is what its state chip says while it applies, in the colour
         of that phase, with the unit whose deployment it stands in, as the title bar names it. -->
    <UBadge
      v-if="wayLive !== null"
      :color="ITEM_DEPLOY_COLOURS[wayLive.phase]"
      variant="subtle"
      size="sm"
      icon="i-material-symbols-rocket-launch-outline"
      data-item-deploy
    ><SearchText :text="itemWayLiveLabel($t, wayLive)" :query="query" /></UBadge>
    <UBadge v-else :color="stateColour(item)" variant="subtle" size="sm" :icon="stateIcon(item)"><SearchText :text="stateLabel($t, item)" :query="query" /></UBadge>

    <!-- A job standing still behind a question it asked, which reads the panel's clock on its own. -->
    <TodoQuestionBadge v-if="questions !== null" :questions="questions" />

    <!-- The chat agent's recommendation stands apart from approval: the row still waits on the owner. -->
    <UBadge v-if="item.recommended && item.awaitingApproval" color="info" variant="subtle" size="sm" icon="i-material-symbols-thumb-up-outline" data-recommended>{{ $t("todo.label.approval_recommended") }}</UBadge>

    <!-- The model this item's work will go out on, short, with its whole name on hover, and whom its work runs on:
         the running job's own agent while one is under way, else the agent the item names, else the role whose
         free agent on its model takes it at the launch (docs/web.md, the TODO panel's section). -->
    <ItemModelChip :item="item" :query="query" press />
    <UBadge v-if="itemAgent(item) !== null" color="neutral" variant="subtle" size="sm" icon="i-material-symbols-smart-toy-outline" data-item-agent-named>{{ itemAgent(item) }}</UBadge>
    <HintTip v-else-if="itemFreeAgent(item) !== null" :text="freeAgentWords($t, itemFreeAgent(item)!).tip" press>
      <UBadge color="neutral" variant="subtle" size="sm" icon="i-material-symbols-groups-outline" data-item-agent-free>{{ freeAgentWords($t, itemFreeAgent(item)!).label }}</UBadge>
    </HintTip>
    <!-- How many times the item's review sent its work back, while it was sent back at all. -->
    <UBadge v-if="item.rejections > 0" color="warning" variant="subtle" size="sm" icon="i-material-symbols-undo" data-item-rejections>{{ $t("todo.label.rejections", { n: countText(item.rejections) }) }}</UBadge>

    <UBadge v-if="(item.stopped?.failures ?? 0) > 0" color="warning" variant="subtle" size="sm">{{ $t("todo.label.stop_failures", { n: countText(item.stopped!.failures) }) }}</UBadge>

    <!-- Which worker is to do it. Only an assignment of his own stands here: a row that names none goes to the
         built-in worker, and saying so on every row would be a badge on nearly all of them. -->
    <UBadge v-if="item.worker !== null" color="info" variant="outline" size="sm">
      <SearchText :text="item.worker" :query="query" />
    </UBadge>

    <UIcon v-if="item.note !== null" name="i-material-symbols-format-quote-outline" class="size-4 text-primary" />

    <!-- An item says at a glance that it left an account of itself — how many, where more than one — and that it
         left something undone; the accounts themselves are read by opening the row. -->
    <UTooltip v-if="item.reports.length > 0" :text="reportsTip($t, item.reports)">
      <span class="flex items-center gap-0.5 text-sm text-success tabular-nums" :aria-label="reportsTip($t, item.reports)" data-report-mark>
        <UIcon name="i-material-symbols-description-outline" class="size-4" />
        <template v-if="item.reports.length > 1">{{ countText(item.reports.length) }}</template>
      </span>
    </UTooltip>

    <!-- An outstanding note that has been resolved still stands on the row and still says what was left; it is no
         longer one of the leftovers, and the badge reads that way. -->
    <UBadge
      v-if="unfinishedLabel($t, item) !== null"
      :color="canResolve(item) ? 'warning' : 'neutral'"
      variant="subtle"
      size="sm"
    >
      <SearchText :text="unfinishedLabel($t, item) ?? ''" :query="query" />
    </UBadge>

    <SearchText
      v-if="todoState(item) === 'pending'"
      class="text-sm text-muted"
      :text="requesterLine(item, rooms ?? [])"
      :query="query"
    />
  </div>

  <!-- Where the search found this row, when it is in nothing the row shows. -->
  <SearchHit class="mt-1" :match="match" :query="query" />
</template>

<script setup lang="ts">
// What one row of the TODO panel's list holds, drawn from what it is handed alone, so a panel drawn again draws again
// only the rows handed something new (docs/web.md, the TODO panel's section).
import { countText } from "~/domain/numbers";
import { ITEM_DEPLOY_COLOURS, itemWayLiveLabel } from "~/domain/deploy";
import {
  canResolve,
  deployWaitsLine,
  freeAgentWords,
  itemAgent,
  itemFreeAgent,
  reportsTip,
  requesterLine,
  stateColour,
  stateIcon,
  stateLabel,
  stoppedLine,
  testbedLineKey,
  todoState,
  unfinishedLabel
} from "~/domain/todos";

import type { ItemTestbedTurn, JobQuestion, RoomSummary, TodoItem } from "#shared/types";
import type { ItemWayLive } from "~/domain/deploy";
import type { SearchMatch } from "bmo-ui/shared/search";

defineProps<{
  item: TodoItem;
  // The phrase the list was found with, which the row's marks are drawn from.
  query: string;
  // Whether the row stands its number on a line of its own above the title.
  narrow: boolean;
  // Whether its handle can carry it.
  draggable: boolean;
  wayLive: ItemWayLive | null;
  testbedTurn: ItemTestbedTurn | null;
  // The questions its job asked and has not had settled.
  questions: JobQuestion[] | null;
  // Where the search found it, when it is in nothing the row shows.
  match: SearchMatch | null;
  // The rooms a request may have come from, by which its line names the room; none until they are read.
  rooms: RoomSummary[] | null | undefined;
}>();

// Every press is the panel's to act on, which knows the board, the menu and the drag.
const emit = defineEmits<{
  open: [id: number];
  "handle-down": [id: number, event: PointerEvent];
}>();
</script>
