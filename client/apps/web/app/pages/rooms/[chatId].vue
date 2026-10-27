<template>
  <!-- Whatever moves on this screen follows the reader's motion setting. -->
  <MotionConfig reduced-motion="user">
  <!-- The top bar and the input bar lie over the conversation, which runs to the panel's top and
       foot underneath them (docs/web.md, 「The top bar and the input bar lie over the conversation」).
       What each takes is measured and handed to the conversation as room at its top and foot and as
       the scroll padding a held row and the end are kept clear of. -->
  <UDashboardPanel
    id="room"
    :ui="{
      body: `p-0 sm:p-0 pt-(--room-head) pb-[calc(var(--room-foot)+var(--bmo-foot-lift,0px))] sm:pt-(--room-head) sm:pb-[calc(var(--room-foot)+var(--bmo-foot-lift,0px))] ${barGrown ? 'scroll-pt-[calc(var(--room-head)+var(--room-choose))]' : 'scroll-pt-(--room-head)'} scroll-pb-[calc(var(--room-foot)+var(--bmo-foot-lift,0px))] overscroll-none ${STABLE_GUTTER} ${TRACK_BETWEEN_BARS}`
    }"
    :style="{ '--room-head': `${headHeight}px`, '--room-choose': `${chooseHeight}px`, '--room-foot': `${footHeight}px`, '--feed-gutter': `${feedGutter}px` }"
    @dragover.prevent="dragging = !madeForCompanions"
    @dragleave="dragging = false"
    @drop.prevent="onDrop"
  >
    <template #header>
      <!-- The bars run to the panel's edges, so their lines meet the line beside the panel, and the
           scrollbar runs between them rather than under them. The top bar is every page's top bar —
           its height, padding, title and mark size — on the translucent ground only this room's
           bars wear. The ground and the edge are the whole bar's, so the choosing row unfolding
           under the navbar grows the bar itself; and the ground fades out a short way under the
           edge, so words passing under the bar read as going under it rather than cut.
           The bar grows by moving, never by changing size: the row stands laid out under the navbar
           all along, and the ground, its edge and its fade slide down over it from where they rest at
           the navbar's foot, by the row's own height, inside the bar's clip, which hides what stands
           above the panel and keeps the fade's room under the bar. Only a transform moves, so the
           growing is the compositor's, and of the conversation under it only the day marks stepping
           down with it are laid out again. Where the bar does not stand, nothing of it takes a
           press. -->
      <div
        ref="roomHead"
        class="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col overflow-clip pb-3"
      >
        <div ref="roomNavbar" class="pointer-events-auto relative z-10">
          <ConsoleTitleBar
            :title="title"
            :ui="{ root: 'border-b-0' }"
          >
            <!-- The room's picture opens whole when pressed, as a face beside a bubble does; a room
                 standing as its letter has nothing to open. It stands where every other page's mark
                 stands, at that mark's size. -->
            <template #leading>
              <button
                v-if="roomAvatar.src"
                type="button"
                class="me-1.5 flex shrink-0 cursor-zoom-in rounded-full transition-shadow hover:ring-2 hover:ring-primary/40 active:ring-2 active:ring-primary/60"
                :aria-label="$t('room.aria.avatar_enlarge', { name: title })"
                @click="roomFaceOpen = true"
              >
                <UAvatar v-bind="roomAvatar" size="2xs" />
              </button>
              <UAvatar v-else v-bind="roomAvatar" size="2xs" class="me-1.5" />
              <ImageViewer v-if="roomAvatar.src" v-model:open="roomFaceOpen" :src="roomAvatar.src" :title="$t('room.label.avatar_of', { name: title })" />
              <RoomPictureViewer ref="pictureViewer" :chat-id="chatId" @show="showPictureMessage" />
            </template>

            <!-- What acts on this room alone stands beside its name; the right end keeps what every
                 screen carries. The menu's dots stand as far from the name as the name stands from
                 the picture, 12px: the dots are a narrow mark in the middle of the button, so the
                 button is drawn back under the name's end by the room its icon keeps either side. -->
            <template #trailing>
              <UDropdownMenu :items="menuItems" :content="{ align: 'start' }">
                <UTooltip :text="$t('common.action.more')">
                  <UButton icon="i-material-symbols-more-vert" color="neutral" variant="ghost" class="-ms-2" :aria-label="$t('common.action.more')" />
                </UTooltip>
              </UDropdownMenu>
              <!-- How long the chat agent's window here has left, for as long as it is open, whether a
                   turn runs or the listening row stands (docs/web.md, 「The window's time left stands in
                   the top bar」). -->
              <RoomWindowClock v-if="listeningWindow !== null" :closes-at="listeningWindow.closesAt" />
              <RoomCompanionTools v-if="companionsHere.length > 0" ref="companionTools" :chat-id="chatId" />
              <RoomProvidersDialog v-if="administrator" v-model:open="providersOpen" :chat-id="chatId" :title="title" />
              <RoomRemovalDialog v-if="administrator" v-model:open="removalOpen" :chat-id="chatId" :title="title" />
            </template>
          </ConsoleTitleBar>
        </div>

        <!-- While messages are being picked the bar grows downward and the choosing row unfolds in
             it (docs/web.md, 「The top bar and the input bar lie over the conversation」): the bar lies
             over the conversation, which keeps only the resting
             bar's room, so no message moves as it grows or folds. The row stands in the same column
             the feed reads in, its checkbox hanging outside it by what a row's own mark hangs out by,
             so the select-all checkbox and the marks down the rows stand on one vertical line, and
             everything in it stands on one centre line. The bar grows as the rows' choosing column
             opens and folds as it closes, one movement on the one choosing motion, so neither is
             seen waiting for the other (docs/web.md, 「Motion」). -->
        <div ref="chooseRow" class="relative" data-choose-row>
          <!-- The bar's ground, edge and fade, reaching up behind the navbar to the bar's top. The
               box moving it is the row's own height, so it rests folded at the navbar's foot by that
               height from the first frame drawn, measured by nothing. -->
          <div
            :class="[
              'absolute inset-0 transition-[translate]',
              choosingMotion,
              barGrown ? '' : '-translate-y-full'
            ]"
          >
            <div class="absolute inset-x-0 bottom-0 top-[calc(var(--ui-header-height)*-1)] border-b border-default bg-default/75 backdrop-blur-md after:absolute after:inset-x-0 after:top-full after:h-3 after:bg-[linear-gradient(to_bottom,color-mix(in_oklab,var(--ui-bg)_75%,transparent),transparent)]" />
          </div>

          <div class="relative overflow-clip">
            <div
              :class="[
                'pe-(--feed-gutter) transition-[translate,visibility]',
                choosingMotion,
                barGrown ? 'pointer-events-auto' : 'invisible -translate-y-full'
              ]"
            >
              <!-- The find row stands where the choosing row does, the bar growing by it the same way (docs/web.md,
                   the room screen's find). -->
              <UContainer v-if="finding" class="flex min-w-0 flex-col gap-1 py-2" data-find-row>
                <div class="flex min-w-0 items-center gap-2">
                  <UInput
                    ref="findBox"
                    v-model="findQuery"
                    icon="i-material-symbols-search"
                    size="sm"
                    class="min-w-0 flex-1"
                    :placeholder="$t('room.label.find_box')"
                    :aria-label="$t('room.label.find_box')"
                    @keydown.enter.exact.prevent="stepFound(-1)"
                    @keydown.enter.shift.prevent="stepFound(1)"
                    @keydown.esc.prevent="closeFind"
                  />
                  <span class="shrink-0 text-sm text-muted tabular-nums" data-find-count :data-find-shown="foundAt === null ? undefined : ''">{{ findCount }}</span>
                  <UTooltip :text="$t('room.action.find_previous')">
                    <UButton size="sm" color="neutral" variant="ghost" icon="i-material-symbols-keyboard-arrow-up" :aria-label="$t('room.action.find_previous')" :disabled="foundAt === null || foundAt === 0" @click="stepFound(-1)" />
                  </UTooltip>
                  <UTooltip :text="$t('room.action.find_next')">
                    <UButton size="sm" color="neutral" variant="ghost" icon="i-material-symbols-keyboard-arrow-down" :aria-label="$t('room.action.find_next')" :disabled="foundAt === null || foundAt === found.length - 1" @click="stepFound(1)" />
                  </UTooltip>
                  <UTooltip :text="$t('common.action.close')">
                    <UButton size="sm" color="neutral" variant="ghost" icon="i-material-symbols-close" :aria-label="$t('common.action.close')" @click="closeFind" />
                  </UTooltip>
                </div>
                <p v-if="findQuery.trim() !== '' && roomFeed.older.value" class="flex min-w-0 flex-wrap items-center gap-x-2 text-sm text-muted">
                  <span>{{ $t("room.status.find_loaded_only") }}</span>
                  <UButton size="sm" color="neutral" variant="link" class="px-0" :label="$t('room.action.find_older')" :loading="roomFeed.loadingOlder.value" @click="findOlder" />
                </p>
              </UContainer>
              <UContainer v-else class="flex min-w-0 items-center gap-2 py-2">
                <!-- The count follows the checkbox's cell straight on: the cell already keeps room
                     past the box, which is all the step the two need. -->
                <span class="flex min-w-0 items-center">
                  <ChooseAll :class="CHOOSE_GUTTER" :keys="itemKeys" :selected="selected" @choose="chooseAll" />
                  <RollingSentence class="min-w-0 truncate text-sm text-muted" :keypath="'room.status.selected_count'" :figures="{ n: selected.size }" />
                </span>
                <span class="ms-auto flex shrink-0 items-center gap-2">
                  <UButton size="sm" icon="i-material-symbols-content-copy-outline" :label="$t('common.action.copy')" :disabled="selected.size === 0" @click="copySelected" />
                  <UButton size="sm" color="neutral" variant="ghost" :label="$t('common.action.cancel')" @click="stopSelecting" />
                </span>
              </UContainer>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #body>
      <!-- The conversation is a layer of its own, and a message flying to its place flies in it: over
           the rows, under the bars and everything else laid over the conversation (docs/web.md,
           「What arrives comes in at the end」). -->
      <UContainer ref="feed" data-flight-layer class="relative isolate flex-1 flex flex-col gap-4 sm:gap-6 py-4 sm:py-6">
        <!-- Messages chosen one after another stand on one band painted across the conversation's
             whole width, from the panel's edge to the scrollbar, its ground running across the room
             between them, with no room added round a bubble. The bands lie behind the rows and are
             measured off them, so a run joining or parting moves nothing. -->
        <div
          v-for="box in choiceBoxes"
          :key="box.key"
          aria-hidden="true"
          data-choice-box
          class="pointer-events-none absolute -z-10 bg-primary/10"
          :style="{ top: `${box.top}px`, left: `${box.left}px`, width: `${box.width}px`, height: `${box.height}px` }"
        />
        <UAlert v-if="roomFeed.failure.value" color="error" variant="subtle" :description="roomFeed.failure.value" />

        <ContentSkeleton v-if="roomFeed.loadingOlder.value" listClass="flex flex-col gap-(--chat-message-gap)" :label="$t('room.status.earlier_loading')">
          <RoomMessageSkeleton />
        </ContentSkeleton>
        <p v-else-if="!roomFeed.older.value && days.length > 0" class="text-center text-sm text-dimmed">
          {{ $t("room.status.start_of_talk") }}
        </p>

        <ContentSkeleton
          v-if="(roomFeed.loading.value || !opened) && roomFeed.messages.value.length === 0"
          :rows="5"
          listClass="flex flex-col gap-(--chat-message-gap)"
          :label="$t('room.status.talk_loading')"
        >
          <RoomMessageSkeleton />
        </ContentSkeleton>
        <p v-else-if="days.length === 0 && !roomFeed.failure.value" class="text-center text-sm text-muted">{{ $t("room.status.no_messages") }}</p>

        <!-- The way down floats over the conversation above the input (below, outside the
             scroll); the list's own way down is not used. -->
        <UChatMessages
          :should-scroll-to-bottom="false"
          :auto-scroll="false"
          :class="{ invisible: !opened }"
          :ui="{ root: 'px-0 gap-0' }"
        >
          <!-- Each day, as its senders' runs. Each turn still running is a row of its speaker's
               run at the foot, in the day its answer will be dated, drawn by the very component the
               messages are drawn by: it stands where its own answer will stand, because that is one
               and the same place. It rises in as any row arriving at the end does. -->
          <template v-for="entry in dayRuns" :key="entry.key">
            <!-- The date mark holds to the top under the top bar: the conversation's own top padding
                 is the bar's room, which what holds to the top already keeps clear of, and it steps
                 down with the bar's foot, on the bar's motion, while choosing grows the bar. The mark keeps the
                 same room above and below it, so it stands centred between the bubbles on either side, a run's
                 own room round its rows counted in (docs/web.md, 「The conversation's measures」). -->
            <div
              data-day-mark
              :class="[
                'sticky z-10 my-7 self-center transition-[top]',
                choosingMotion,
                barGrown ? 'top-[calc(var(--spacing)*3+var(--room-choose))]' : 'top-3'
              ]"
            >
              <RoomDayPicker :label="entry.day.label" :day="entry.day.key" @pick="jumpToDay" />
            </div>

            <template v-for="run in entry.runs" :key="run.key">
              <RoomSenderRun :side="run.side" :sender-name="run.senderName" :avatar="run.notice ? undefined : run.avatar" :selecting="selecting">
                <RoomMessage
                  v-for="(item, at) in run.rows"
                  :key="item.life ?? item.key"
                  :item="item"
                  :day="entry.day.key"
                  :place="runPlace(at === 0, at === run.rows.length - 1)"
                  :arriving="arrivals.has(item.key)"
                  :judging="judged.has(item.messageId)"
                  :chat-id="chatId"
                  :selecting="selecting"
                  :selected="selected.has(item.key)"
                  :flashed="flashKey === item.key"
                  :roving="item.key === rovingKey"
                  @select="startAt"
                  @pick="pick"
                  @reply="startReply"
                  @copy="copyOne"
                  @copy-body="copyBody"
                  @copy-ref="copyRef"
                  @jump="jumpTo"
                  @focused="focusedKey = $event"
                  @move="moveFocus"
                  @retry="retry"
                  @discard="discard"
                />
              </RoomSenderRun>

              <!-- A turn the chat agent passed the run's last message over in stays as a line under it, worded
                   and placed like the passing reason at the foot: centred, with no photo, so the chat agent is
                   not seen to have said anything. It is not a row, so nothing chooses, copies or
                   focuses it. It ends the run, and stands between it and the next. -->
              <p v-if="lastOf(run).skipped > 0" class="my-4 self-center text-sm text-muted" :data-skipped="lastOf(run).key">
                {{ skippedLine(t, lastOf(run).skipped) }}
              </p>
            </template>
          </template>

          <ContentSkeleton v-if="roomFeed.loadingNewer.value" listClass="flex flex-col gap-(--chat-message-gap)" :label="$t('room.status.later_loading')">
          <RoomMessageSkeleton />
          </ContentSkeleton>

          <!-- A passing word about the turn stands over the running work, which stays at the foot
               for as long as it runs. The word and the work are no messages, so each keeps room of
               its own from the conversation above it. -->
          <p v-if="passing !== null" class="mt-4 self-center text-sm text-muted">{{ outcomeLine(t, passing) }}</p>

          <RoomWork class="mt-7":lines="workLines" :rooms="rooms ?? []" />
        </UChatMessages>

        <!-- Where a flight is put: the layer's last child, of no box of its own, so a flight coming
             and going leaves every row where it stood among its siblings. -->
        <div data-flight-host class="contents" />
      </UContainer>
    </template>

    <template #footer>
      <!-- The way to the end stands a small step above the input bar's top edge, its trailing edge on
           the send button's, and moves with that edge as the bar grows (docs/web.md, 「The way
           down」). It stands only while the reader stands away from the end and is not scrolling up:
           it slides up from under the bar's edge once they scroll down short of the end, and slides
           back down as they reach it, or as they scroll up again. A glide that carries the reader
           down to what arrived is not the reader standing back. It counts what arrived at the end
           while the reader stood away. The way down goes to the room's end, which a feed standing
           back in the room reads first rather than paging down to it. -->
      <div
        class="pointer-events-none absolute z-10 flex overflow-hidden px-(--chat-face-gap) pt-(--chat-face-gap) pb-(--chat-face-gap)"
        :style="{ bottom: 'calc(var(--room-foot) + var(--bmo-foot-lift, 0px))', insetInlineEnd: `calc(${feedGutter + wayDownEnd}px - var(--chat-face-gap))` }"
      >
        <Transition
          enter-active-class="transition-transform duration-(--bmo-motion-pop) ease-(--bmo-ease-enter) motion-reduce:transition-none"
          leave-active-class="transition-transform duration-(--bmo-motion-pop) ease-(--bmo-ease-exit) motion-reduce:transition-none"
          enter-from-class="translate-y-[calc(100%+var(--chat-face-gap))]"
          leave-to-class="translate-y-[calc(100%+var(--chat-face-gap))]"
        >
          <UChip v-if="wayDownShown" :show="unseen > 0" size="3xl" color="primary" class="pointer-events-auto">
            <template #content><RollingNumber :value="unseen" /></template>
            <UTooltip :text="$t('room.action.to_latest')">
              <UButton
                icon="i-material-symbols-arrow-downward"
                color="neutral"
                variant="outline"
                class="shadow-sm"
                :aria-label="$t('room.action.to_latest')"
                @click="scrollToBottom"
              />
            </UTooltip>
          </UChip>
        </Transition>
      </div>

      <!-- The foot of the room is a column that can be squeezed, and what gives way in it is the
           question stack rather than the box they type in: the foot takes whatever the conversation
           above it does not need, and on a phone with the keyboard up that can be less than the
           cards would like. It is a bar along the panel's foot, its full width with its edge over it,
           on the translucent ground the room's top bar wears, and the conversation runs on under it. It
           stands at the foot of the shell, which stands by what is visible, so a keyboard re-places it
           with the shell; while nothing overlays the window it keeps the phone's gesture bar's height
           under its padding, so its box stands above that bar and its ground runs under it (docs/web.md,
           「What floats over the screen keeps clear of the bars a phone lays over it」). -->
      <div
        v-if="administrator"
        ref="composerFoot"
        data-screen-foot
        class="absolute inset-x-0 bottom-[var(--bmo-foot-lift,0px)] z-20 flex max-h-[calc(100%-var(--room-head))] min-h-0 flex-col border-t border-default pt-(--chat-bar-pad) pe-(--feed-gutter) backdrop-blur-md"
        :class="[dragging ? 'bg-elevated/75' : 'bg-default/75', overlaid ? 'pb-(--chat-bar-pad)' : 'pb-[calc(var(--chat-bar-pad)+var(--bmo-safe-bottom))]']"
      >
        <UContainer class="flex min-h-0 flex-col">
          <!-- What a job stopped to ask the owner, over the box they answer everything else in. It is
               their own chat that a question is put to, so it stands here and only here: the queue
               beside this room is where the work is read, and answering is a thing they do in the
               conversation. -->
          <QuestionAsk v-if="ownsTodo" />

          <!-- The words they type run the box's whole width and keep each line written while they
               writes (docs/web.md, 「The top bar and the input bar lie over the conversation」). -->
          <ChatComposer
            ref="composer"
            kind="room"
            :draft-id="chatId"
            split
            inline
            :attachable="!madeForCompanions"
            :label="$t('room.label.messages')"
            :placeholder="reachable ? (dragging ? $t('room.placeholder.drop_here') : $t('room.label.messages')) : controlLine($t, controlState)"
            @escape="onEscape"
            @submit="send"
          >
            <!-- What the next message answers: who said it and how it began, until it is sent or
                 dropped. -->
            <template v-if="replyTarget !== null" #lead>
              <div data-reply-bar class="flex min-w-0 items-center gap-2 rounded-sm border-s-2 border-primary bg-elevated/60 py-1 ps-2 pe-1">
                <UIcon name="i-material-symbols-reply" class="size-5 shrink-0 text-primary" />
                <span class="shrink-0 text-sm font-medium text-highlighted">{{ replyLine.name }}</span>
                <span class="min-w-0 flex-1 truncate text-sm text-muted">{{ replyLine.words }}</span>
                <UTooltip :text="$t('room.action.cancel_reply')">
                  <UButton
                    icon="i-material-symbols-close"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    :aria-label="$t('room.action.cancel_reply')"
                    @click="cancelReply"
                  />
                </UTooltip>
              </div>
            </template>
          </ChatComposer>
        </UContainer>
      </div>
    </template>
  </UDashboardPanel>
  </MotionConfig>

  <USlideover v-model:open="statsOpen" :title="$t('room.title.session_info')" :description="title">
    <template #close="{ ui }">
      <ShellClose :class="ui.close()" @close="statsOpen = false" />
    </template>

    <template #body>
      <!-- The block draws itself either way: every name in it is the screen's own and stands from
           the first frame, and only the figures beside them are waited for. -->
      <SkeletonStatus v-if="!statsLoaded && statsPending" as="div" :label="$t('room.status.session_loading')">
        <RoomStats :stats="null" />
      </SkeletonStatus>

      <ReadFailure :failure="statsRead" :message="statsError" :reading="statsPending" @retry="openStats()" />
      <RoomStats v-if="statsLoaded" :stats="stats" />
    </template>
  </USlideover>


</template>

<script setup lang="ts">
import { MotionConfig } from "motion-v";

import { countText } from "~/domain/numbers";
import { useAdministrator } from "~/domain/access";
import { useInitialRead } from "bmo-ui/app/domain/loading";
import { POLL_INTERVAL_MS } from "#shared/config";
import { controlLine, useControlStatus } from "~/domain/control";
import { messageOfQuery } from "#shared/paths";
import { screenKey } from "~/domain/route-key";
import { agentLabel, companionOf, roomTitle } from "~/domain/agents";
import { attachmentBody } from "~/domain/attachments";
import { useAgentAvatars } from "~/domain/agent-face";
import { avatarFor } from "~/domain/avatars";
import { followBottom } from "~/domain/bottom";
import { flightTiming, riseOutOf, settleInto } from "~/domain/flight";
import { measurePicture, messagePicture, releaseStandIn, rememberShape, shapeOf, standIn } from "~/domain/picture-shapes";
import { readsFromFirstLine } from "~/domain/first-line";
import { loadMarkdownRenderer } from "~/domain/markdown-load";
import { useFootInView, useOverlaid } from "~/domain/overlay";
import { keepPlace } from "bmo-ui/app/domain/fullscreen";
import { useReadMarks } from "~/domain/read-marks";
import { useNewestReads } from "~/domain/room-list";
import { removedRoom } from "~/domain/room-removal";
import { copyText } from "~/domain/copy";
import { bodyOf, copyChipsOf, messageRef, reportOf } from "~/domain/room-copy";
import { failureText } from "bmo-ui/app/domain/errors";
import { TURN_ENDED, useBotEvents, useLiveRefresh, useReadFailure, useRoomRun } from "~/domain/events";
import { useDragSelect } from "bmo-ui/app/domain/dragselect";
import { useIsland } from "bmo-ui/app/domain/island";
import { judgedNow, judgementsByMessage } from "~/domain/judgements";
import { CHOOSE_GUTTER, chosenRuns } from "bmo-ui/app/domain/chooseall";
import { NARROW_MAX_PX, STABLE_GUTTER, useScrollGutter } from "bmo-ui/app/domain/screen";
import { stepsLanded, useBackClose } from "bmo-ui/app/domain/layers";
import { ROOM_PICTURES } from "~/domain/gallery";
import { isBackEscape } from "bmo-ui/app/domain/overlays";
import {
  echoedKeys,
  graceEndsAt,
  heldMessages,
  keyChecks,
  landedPictures,
  nextSend,
  OUTBOX_SAY_CALL_MS,
  outboxOf,
  overdueChecks,
  overdueWaits,
  previewsOf,
  restored,
  sendOutcome,
  sendRetryMs,
  settledKeys,
  standingKeys,
  withChecking,
  withFailed,
  withKeyOutcome,
  withResending,
  withSent,
  withWaiting,
  without
} from "~/domain/outbox";
import { outboxStore } from "~/domain/outbox-store";
import { emptyRoomStats } from "~/domain/roomstats";
import {
  archivedRows,
  atFoot,
  agentAvatar,
  botAvatar,
  botSpeaker,
  bubbleLook,
  choosingMotion,
  copyItemOf,
  groupDays,
  keptRows,
  pendingItems,
  quoteText,
  runItem,
  runPlace,
  senderRuns,
  settledAnswers,
  skippedLine,
  turnAnswer,
  useHandOver,
  useRoomFeed,
  withLives
} from "~/domain/room";
import { SCROLL_BOTTOM_THRESHOLD_PX, SCROLL_TOP_THRESHOLD_PX, usePolling } from "~/domain/polling";
import { formatClock, toUnixSeconds } from "bmo-ui/app/domain/time";
import { imageUrl } from "~/domain/urls";
import { outcomeLine, roomRuns } from "~/domain/working";
import { groupRoom, listeningRuns, shownOutcome, useRoomWindow } from "~/domain/room-window";
import { clearFound, foundMessages, markFound, steppedHit } from "~/domain/room-find";
import { scrollWithin } from "bmo-ui/app/domain/scroll-within";

import type {
  ArchivedMessage,
  Judgement,
  RoomStats,
  ListedRoom,
  LiveRun,
  LiveSnapshot,
  OwnerChat,
  QueuedMessage,
  ReplyQuote,
  RoomDayStart,
  SendOutcomeRecord,
  SentAttachments,
  SentMessage,
  StatusView,
  WatchView
} from "#shared/types";
import type { DropdownMenuItem } from "@nuxt/ui";
import type { ComposedMessage, PickedFile } from "~/domain/attachments";
import type { AvatarIndex } from "~/domain/avatars";
import type { RunState } from "~/domain/events";
import type { LandedPicture, OutboxItem, SendOutcome } from "~/domain/outbox";
import type { DayGroup, FeedItem, SenderRun, Speaker, StoodTurn } from "~/domain/room";
import type { Point, Rect } from "~/domain/flight";

// Another room is another screen; the rest of the address is not the room's, and a message it names is
// gone to where the room stands (docs/web.md, 「Room screen」).
definePageMeta({ key: (route) => screenKey(route, []), member: true });

const feedRef = useTemplateRef<{ $el?: HTMLElement }>("feed");

// What keeps the reader at the end of the feed when the feed's end moves under them.
let bottom: ReturnType<typeof followBottom> | null = null;
// What hands the feed's own place to the full screen hold for as long as the room stands.
let releaseFullscreen: (() => void) | null = null;

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const island = useIsland(t);

// A member reads the conversation; writing to it, its session information and the bar's tools are the
// administrator's (docs/web.md, 「Access」).
const administrator = useAdministrator();

const chatId = Number(route.params.chatId);
const roomFeed = useRoomFeed(t, chatId);

const { data: listedRooms, status: roomsStatus } = useFetch<ListedRoom[]>("/api/rooms", {
  key: "rooms",
  lazy: true,
  server: false,
  default: () => []
});
// The counts as the sidebar shows them, so the room opens at the first message unread by the newest count.
const rooms = useNewestReads(listedRooms);

const { control, link: controlState, reachable, read: readControl } = useControlStatus();

// Whose room this is and whose senders are the signed-in person's own, answered by this app itself and carried in the
// page's own payload, so a refresh has them before the first render rather than a round trip later: the side every
// message stands on hangs on it.
const { data: owner } = useFetch<OwnerChat>("/api/owner", {
  key: "owner",
  default: () => ({ chatId: null, senderId: null, senders: [], administrator: false })
});
// What has been handed to the bot and is not standing in the archive yet: it is in the feed
// from the moment send is pressed, marked as on its way.
const outbox = ref<OutboxItem[]>([]);
// The same lines kept in this browser, so a reload or a closed tab loses none of them (docs/web.md,
// the room screen's section on what the browser keeps). Every change of the lines is written there; nothing is kept for a member, who
// sends nothing.
const keptOutbox = outboxStore();

watch(outbox, (items) => {
  if (administrator.value) {
    void keptOutbox.save(chatId, items);
  }
});
// Whether something is being dragged over the room. The box itself holds the words and files.
const dragging = ref(false);
const selecting = ref(false);
const selected = ref<Set<string>>(new Set());
// Where a range starts: the last message picked up by hand.
const anchor = ref<string | null>(null);
// The message the next send answers, and the row a pressed quote has just brought into view.
const replyTarget = ref<ReplyQuote | null>(null);
const replyLine = computed(() => (replyTarget.value === null ? { name: "", words: "" } : quoteText(t, replyTarget.value)));
const flashKey = ref<string | null>(null);
const composer = useTemplateRef<{ focus: () => void; attach: (files: File[]) => void; clear: (options?: { keepPreviews?: boolean }) => void }>("composer");
const composerFoot = useTemplateRef<HTMLElement>("composerFoot");

// The input bar holds itself inside what is visible, whatever the browser lays over the page's foot (docs/web.md,
// 「Layout fundamentals」).
useFootInView(composerFoot);
const roomHead = useTemplateRef<HTMLElement>("roomHead");
const roomNavbar = useTemplateRef<HTMLElement>("roomNavbar");

// Whether a keyboard overlays the foot of the window, where the input bar keeps no room for the gesture
// bar the keyboard stands over.
const overlaid = useOverlaid();

// What the bars floating over the conversation take of its top and foot, which the conversation
// keeps as room at its top and foot and as the scroll padding a held row and the end keep clear of.
const headHeight = ref(0);
const footHeight = ref(0);
const chooseRow = useTemplateRef<HTMLElement>("chooseRow");
const chooseHeight = ref(0);

// Whether the reader stands away from the room's end — scrolled back, held at a long answer's first
// line, or reading a stretch of the room that stops short of its end — which is when the way down
// stands. The follower says so for the scroll, and never while its own glide is carrying the reader.
const awayFromEnd = ref(false);
const standingAway = computed<boolean>(() => awayFromEnd.value || roomFeed.newer.value);

// Which way the reader last scrolled, and the way down stands only while they are not going up:
// it goes as they scroll up and comes back as they scroll down short of the end. A reader who has
// not scrolled since standing away — brought there by a quote or a date — sees it at once.
const scrolledUp = ref(false);
const wayDownShown = computed<boolean>(() => standingAway.value && !scrolledUp.value);

// How many messages arrived at the end while the reader stood away, counted on the way down.
const unseen = ref(0);

watch(standingAway, (away) => {
  if (!away) {
    scrolledUp.value = false;
    unseen.value = 0;
  }
});

// How far the send button's trailing edge stands in from the panel's, which the way down's own
// trailing edge keeps; a room with no input keeps the container's own side room.
const wayDownEnd = ref(16);

// The owner's words standing as the input box stood, for the frame before their row takes its box
// over; and the rows flying out of the input box, with how they fly.


// The rows that have just arrived at the end of the room being read, which come in rising. Nothing
// stands as arrived before the room has taken its opening place (opened, below).
const arrivals = ref<ReadonlySet<string>>(new Set());
const ARRIVALS_AT_ONCE = 5;

// The room the feed's scrollbar takes, kept at the bar's trailing edge as well, so the column the
// bar's contents stand in is the column the feed's rows stand in and the choosing marks line up.
const feedGutter = useScrollGutter(scroller);

// The bars run over the gutter to the panel's edge, so the scrollbar's track is shortened by each
// bar's height and runs between them. Only a scrollbar drawn from the WebKit parts has a track to
// shorten, and those parts are drawn only where the standard scrollbar properties stand at auto, so
// they are reset in the browsers that have the parts and nowhere else, as important since the
// console's own setting of them stands outside every layer; the parts wear the console's own thin
// look (main.css). A touch screen keeps its own scrollbar, which lies over the feed and takes no
// room, where the parts would draw one that takes a gutter.
const TRACK_BETWEEN_BARS = [
  "pointer-fine:supports-[selector(::-webkit-scrollbar)]:[scrollbar-width:auto]!",
  "pointer-fine:supports-[selector(::-webkit-scrollbar)]:[scrollbar-color:auto]!",
  "[&::-webkit-scrollbar-track]:mt-(--room-head)",
  "[&::-webkit-scrollbar-track]:mb-(--room-foot)"
].join(" ");

// How long a row a quote brought into view stays marked.
const FLASH_MS = 1600;
// Where the keyboard stands in the feed. The rows are peers, so the feed is one tab stop and
// the arrows walk it; with nothing focused yet that stop is the newest message.
const focusedKey = ref<string | null>(null);

// What else is running for this room — a search, a browse, a job, a watch's check. The picture
// arrives whole on the live event, as it does elsewhere. The standing watches do not ride that
// stream, so they are read beside it: a check's run says nothing about which watch it is a check of.
const live = ref<LiveRun[]>([]);
const watches = ref<WatchView[]>([]);
// The messages the bot holds queued for a turn of the chat agent's, which are waiting to be judged.
const queued = ref<QueuedMessage[]>([]);

// What the bot is doing in this room right now.
const { runs, outcome } = useRoomRun(chatId, {
  onJudgement: (judgement: Judgement) => roomFeed.addLiveJudgement(judgement),
  onSettled: () => settle(),
  // A turn that sent its answer stands its row until that answer is in the feed, found as its row finds it.
  answered: (run: RunState) => turnAnswer(run, (companionOf(run.speaker) ?? botSpeaker(roomFeed.messages.value)).id, roomFeed.messages.value) !== undefined,
  onLive: (picture: LiveSnapshot) => {
    live.value = picture.runs ?? [];
    queued.value = picture.queued ?? [];
  }
});

// The room's verdicts by the message they stand under.
const judgementIndex = computed(() => judgementsByMessage(roomFeed.judgements.value));

// Which messages of the room are being judged right now, which their verdict mark beats for: none that
// already holds a final verdict written since its judging began.
const judged = computed<Set<number>>(() => judgedNow(chatId, live.value, queued.value, runs.value, judgementIndex.value));

// The room's own name, from the one list every screen takes a room's name from, and the
// picture Telegram shows for it.
const roomsInitial = useInitialRead(roomsStatus);
const title = computed<string>(() => roomsInitial.value ? t("room.status.room_loading") : roomTitle(t, rooms.value, chatId));
// A room made for companions takes words alone (docs/companions.md), so nothing is offered to attach.
const madeForCompanions = computed(() => (rooms.value ?? []).some((room) => room.chatId === chatId && room.madeForCompanions === true));
// The index names every room and person, so a member's feed draws its faces by their initials.
const avatars = administrator.value ? useAgentAvatars() : computed<AvatarIndex>(() => new Map());
const roomAvatar = computed(() => avatarFor(avatars.value, "room", chatId, title.value));
const roomFaceOpen = ref(false);

// Every picture of the feed opens in the room's own viewer, which walks the whole room's pictures.
const pictureViewer = useTemplateRef<{ show: (messageId: number, title: string) => Promise<void> }>("pictureViewer");

provide(ROOM_PICTURES, {
  open: (messageId: number, named: string) => void pictureViewer.value?.show(messageId, named)
});

// The viewer's show-in-message: the message the picture went out in, once the viewer's own step in
// the history has been taken back, brought into view and marked as a quote's is.
async function showPictureMessage(messageId: number): Promise<void> {
  await nextTick();
  await stepsLanded();
  await jumpTo(messageId);
}


// Whether this room is a group, where the chat agent listens through its window and passes turns over without
// a word (docs/web.md, 「The listening row」). The owner's chat is this app's own answer, or the bot's
// for a reader this app does not answer it for.
const group = computed<boolean>(() => groupRoom(chatId, owner.value.chatId ?? control.value?.ownerChatId ?? null));
const listeningWindow = useRoomWindow(chatId, () => group.value);
const passing = computed(() => shownOutcome(outcome.value, group.value));

// Asking a worker a question remains available in the owner room.
const ownsTodo = computed<boolean>(() => owner.value.chatId === chatId);


// The companions answering here, whose settings and reset the menu offers the administrator alone
// (docs/web.md, the room screen's section on resetting a companion and its model); a room with more than one names each.
const companionsHere = computed<string[]>(() => (owner.value.administrator ? (rooms.value ?? []).find((room) => room.chatId === chatId)?.companions ?? [] : []));
const companionTools = useTemplateRef<{ labelOf: (agent: string) => string; settings: (agent: string) => void; reset: (agent: string) => void }>("companionTools");

function companionItems(): DropdownMenuItem[] {
  const named = (action: string, agent: string): string => (companionsHere.value.length > 1 ? t("room.action.of_companion", { action, name: companionTools.value?.labelOf(agent) ?? agent }) : action);

  return companionsHere.value.flatMap((agent) => [
    { label: named(t("room.action.companion_settings"), agent), icon: "i-material-symbols-tune", onSelect: () => companionTools.value?.settings(agent) },
    { label: named(t("room.action.companion_reset"), agent), icon: "i-material-symbols-restart-alt", onSelect: () => companionTools.value?.reset(agent) }
  ]);
}

const menuItems = computed<DropdownMenuItem[][]>(() => [
  [
    ...(administrator.value ? [{ label: t("room.title.session_info"), icon: "i-material-symbols-bar-chart", onSelect: openStats }] : []),
    { label: t("room.action.find"), icon: "i-material-symbols-search", onSelect: openFind },
    { label: t("room.action.choose_messages"), icon: "i-material-symbols-checklist", onSelect: startSelecting },
    { label: t("room.action.copy_all"), icon: "i-material-symbols-content-copy-outline", onSelect: () => void copyAll() },
    // The pinned order is one list for every reader, so only the administrator sets it (docs/web.md, the room
    // screen's pin).
    ...(administrator.value ? [pinned.value
      ? { label: t("room.action.unpin"), icon: "i-material-symbols-keep-off-outline", onSelect: () => void pin(false) }
      : { label: t("room.action.pin"), icon: "i-material-symbols-keep-outline", onSelect: () => void pin(true) }] : []),
    // Which providers the room is on is a setting of its registration, the administrator's (docs/web.md, the room
    // screen's chat providers).
    ...(administrator.value ? [{ label: t("room.action.providers"), icon: "i-material-symbols-hub-outline", onSelect: () => { providersOpen.value = true; } }] : [])
  ],
  ...(companionsHere.value.length === 0 ? [] : [companionItems()]),
  // Removing the room's registration stands last, in a group of its own (docs/web.md, the room
  // screen's registration removal).
  ...(administrator.value ? [[{ label: t("room.action.remove_registration"), icon: "i-material-symbols-delete-outline", color: "error" as const, onSelect: () => { removalOpen.value = true; } }]] : [])
]);
// Whether the room stands in the pinned order, as the room list read it.
const pinned = computed(() => listedRooms.value.some((room) => room.chatId === chatId && room.pinned));

// The room pinned or let go; the receiver writes the order, and every room list reads it again from there.
async function pin(on: boolean): Promise<void> {
  try {
    await $fetch(`/api/rooms/${chatId}/pin`, { method: "POST", body: { pinned: on } });
    await refreshNuxtData("rooms");
  } catch (error) {
    island.fail(error, t(on ? "room.error.pin_failed" : "room.error.unpin_failed"));
  }
}

const providersOpen = ref(false);
const removalOpen = ref(false);
// The room's registration was removed while this screen's own removal dialog stood open.
const removed = ref(false);

// A room whose registration was removed — from this dialog or from another device — is gone, so its
// screen goes home and says why; where this screen's removal dialog is open, once that is closed,
// so what the removal took stays to be read.
function leaveRemoved(): void {
  island.say({ title: t("room.message.room_removed"), tone: "warning" });
  void router.replace("/");
}

useBotEvents((event) => {
  if (removedRoom(event) !== chatId) return;

  if (removalOpen.value) {
    removed.value = true;
  } else {
    leaveRemoved();
  }
});

watch(removalOpen, (open) => {
  if (!open && removed.value) leaveRemoved();
});

// What this room adds up to. It is counted when it is asked for, so opening the panel again
// after a while shows the room as it stands rather than as it stood.
const statsOpen = ref(false);
const statsLoaded = ref(false), statsPending = ref(false), statsError = ref("");
let statsGeneration = 0;
onScopeDispose(() => { statsGeneration++; });
const stats = ref<RoomStats>(emptyRoomStats(chatId));

async function openStats(): Promise<void> {
  const mine = ++statsGeneration;
  statsOpen.value = true;
  statsPending.value = true;
  statsError.value = "";

  try {
    const answer = await $fetch<RoomStats>(`/api/rooms/${chatId}/stats`);
    if (mine !== statsGeneration) return;
    stats.value = answer;
    statsLoaded.value = true;
  } catch (error) {
    if (mine !== statsGeneration) return;
    statsError.value = failureText(error, t("room.error.session_failed"));
  } finally {
    if (mine === statsGeneration) statsPending.value = false;
  }
}

// Reading again opens the panel, so the read the bot's return brings is made only while it stands.
const statsRead = useReadFailure({
  failed: () => statsOpen.value && statsError.value !== "",
  reading: () => statsPending.value,
  reread: () => void openStats()
});

// Whom the console speaks as here: the owner, under the sender and the name their own messages are archived
// with, so a message on its way reads as the one that replaces it.
const speaker = computed<Speaker>(() => {
  const own = owner.value.senderId;
  const said = [...roomFeed.messages.value].reverse().find((message) => message.senderId === own);

  return { id: own, name: said?.senderName ?? t("room.label.me") };
});

const workLines = computed(() => roomRuns(t, live.value, chatId, rooms.value, watches.value));

// The mode the screen goes into to pick messages is a layer of the back gesture like anything
// floating over the room, which registers on its own: one press apiece, and only when none of
// them stands does a press leave the room.
useBackClose(selecting, () => stopSelecting());

// What the row waiting on the chat agent wears: the picture the chat agent's own answer will wear in this room.
const botFace = computed(() => botAvatar(roomFeed.messages.value, avatars.value));

// The turns still running, each as a row of this conversation. A row is built the way every other
// row is and handed to the same component, which is what keeps the answer's own coordinates from
// moving when it takes the row's place. A companion's turn wears the companion's own name and
// picture, which its answer will wear too, and stands beside the chat agent's where both answer at once; its name
// is the label the agents table gives it. While the chat agent only listens in a group room its row stands holding
// no turn.
const turnRows = computed<FeedItem[]>(() =>
  [...runs.value, ...listeningRuns(runs.value, listeningWindow.value)].map((run) => {
    const companion = companionOf(run.speaker);

    if (companion === undefined) return runItem(run, botSpeaker(roomFeed.messages.value), botFace.value);

    const shown = { id: companion.id, name: agentLabel(t, companion.name) };

    // The companion's own face, the one its answers wear, whatever number its words stand under here.
    return runItem(run, shown, agentAvatar(avatars.value, companion.name));
  })
);
// A row gives its place to its turn's answer the moment the answer is in the feed, by whichever read.
const runRows = useHandOver(turnRows, roomFeed.messages);

// The key each message the owner sent stands under for its whole life: the key of the line that stood for it while
// it went, taken the moment the message takes that line's place and kept after the line is let go, so the message is
// the one row it already was and is never drawn again (docs/web.md, the room screen's section on a message being
// sent). It is read before the feed is drawn, so no frame stands the message under a key of its own.
const lives = shallowRef<ReadonlyMap<number, string>>(new Map());

watch(
  () => [outbox.value, roomFeed.messages.value, speaker.value.id] as const,
  ([items, messages, speakerId]) => {
    const found = [...standingKeys(items, messages, speakerId)].filter(([messageId]) => !lives.value.has(messageId));

    if (found.length > 0) lives.value = new Map([...lives.value, ...found]);
  },
  { immediate: true }
);
// The archived messages the feed stands: all of them but the ones a line on its way still stands for, a photo's
// message whose picture the archive has not kept yet among them (docs/web.md, the room screen's section on a
// message being sent).
const shownMessages = computed<ArchivedMessage[]>(() => {
  const held = heldMessages(outbox.value, roomFeed.messages.value, speaker.value.id);

  return held.size === 0 ? roomFeed.messages.value : roomFeed.messages.value.filter((message) => !held.has(message.messageId));
});
// The archive's rows, kept apart from the messages on their way, so sending one, its being sent and
// its being checked hand every row already standing the same row and draw none of them again; a read
// of the archive hands back the same row for every message it left as it was (docs/web.md, 「What
// arrives comes in at the end」).
const archived = computed<FeedItem[]>((standing) =>
  keptRows(
    standing,
    withLives(archivedRows(
      shownMessages.value,
      judgementIndex.value,
      imageUrl,
      avatars.value,
      // Which senders the feed reads as the signed-in person's own, and so which rows stand on the right
      // (docs/web.md, 「Which messages stand on the right」). It is this app's own answer rather than the bot's,
      // because the side a message stands on is decided as the row is drawn and a screen that waited on the bot would
      // lay the whole room out on one side and turn it over seconds later, or never while the bot is down.
      owner.value.senders,
      !group.value
    ), lives.value)
  )
);
// The messages on their way, as the rows they stand as: the pictures of one press are one row. A line whose message the
// archive already carries stands no longer, even while its send is still out, so the archived message takes its place
// rather than standing beside it (docs/web.md, the room screen's section on a message being sent).
const pendingRows = computed<FeedItem[]>(() => {
  const echoed = echoedKeys(outbox.value, roomFeed.messages.value, speaker.value.id);

  return pendingItems(outbox.value.filter((held) => !echoed.has(held.key)), speaker.value, avatars.value);
});
// A line on its way stands at the foot, in the last day where its own is earlier (docs/web.md, 「The line's
// day」).
const days = computed<DayGroup[]>(() => atFoot(t, groupDays(t, archived.value), pendingRows.value));

// The days as the feed stands them, each as its senders' runs (docs/web.md, 「One sender's run is one
// block」). Each turn still running stands at the foot as a row of its speaker's run, in the day its
// answer will be dated, so the answer that takes its place stands in the same run under the same date
// mark. A feed standing back in the room stands none of them.
const dayRuns = computed<{ key: string; day: DayGroup; runs: SenderRun[] }[]>(() =>
  atFoot(t, days.value, roomFeed.newer.value ? [] : runRows.value).map((day) => ({ key: day.key, day, runs: senderRuns(day.items, `day:${day.key}`) }))
);

function lastOf(run: SenderRun): FeedItem {
  return run.rows[run.rows.length - 1]!;
}

// Which rows arrive, read off the rows standing before and after each change (docs/web.md, 「What
// arrives comes in at the end」). Only rows standing after the last row already there are new at the
// end; rows read in by paging, by opening the room or by going to a message, and the rows of a
// stretch read back down to the end, come in still. A row taking the place of the owner's message
// on its way is that message, and comes in still; one of theirs flying out of the input box flies. An
// answer taking the place of the turn that ran for it settles out of where that turn's words stood.
watch(
  () => ({
    keys: dayRuns.value.flatMap((entry) => entry.runs.flatMap((run) => run.rows.map((row) => row.key))),
    pending: pendingRows.value.map((row) => row.key),
    running: runRows.value.map((row): StoodTurn => ({ key: row.key, senderId: row.senderId, senderName: row.senderName })),
    back: roomFeed.newer.value
  }),
  (now, last) => {
    const before = last ?? { keys: [], pending: [], running: [], back: false };

    if (!opened.value || before.back || now.back) {
      return;
    }

    // A room with nothing in it yet takes its first rows as arrivals; any other takes only what
    // stands after the last row it already had.
    const known = new Set(before.keys);
    const after = now.keys.findLastIndex((key) => known.has(key));
    const fresh = before.keys.length === 0 ? now.keys : after === -1 ? [] : now.keys.slice(after + 1).filter((key) => !known.has(key));
    const pending = new Set(now.pending);
    const handedOver = before.pending.some((key) => !now.keys.includes(key));
    const rows = new Map(dayRuns.value.flatMap((entry) => entry.runs.flatMap((run) => run.rows)).map((row) => [row.key, row]));
    const settling = fresh.length > ARRIVALS_AT_ONCE ? new Map<string, Rect>() : settlings(before.running.filter((turn) => !now.keys.includes(turn.key)), fresh, rows);
    const rising = fresh.filter((key) => !pending.has(key) && !settling.has(key) && !(handedOver && rows.get(key)?.look.side === "right"));

    // More rows at once than a turn says is the room being read back — a page landing after a read
    // that failed, a stream that came back — and nothing of it rises.
    if ((rising.length === 0 && settling.size === 0) || fresh.length > ARRIVALS_AT_ONCE) {
      return;
    }

    arrivals.value = new Set([...arrivals.value, ...rising]);
    void settleAnswers(settling);

    // A message arriving while the reader stands away is counted on the way down.
    if (awayFromEnd.value) {
      unseen.value += [...rising, ...settling.keys()].filter((key) => rows.get(key)?.run === null).length;
    }

    // A row rises once, as it first stands.
    setTimeout(() => {
      arrivals.value = new Set([...arrivals.value].filter((key) => !rising.includes(key)));
    }, 1000);
  }
);

// Every row the feed is showing, in the order they stand.
const rowKeys = computed<string[]>(() => days.value.flatMap((day) => day.items).map((item) => item.key));

const rovingKey = computed<string | null>(() => {
  const held = focusedKey.value;

  return held !== null && rowKeys.value.includes(held) ? held : (rowKeys.value[rowKeys.value.length - 1] ?? null);
});

async function moveFocus(key: string, delta: number): Promise<void> {
  const next = rowKeys.value[rowKeys.value.indexOf(key) + delta];

  if (next === undefined) {
    return;
  }

  focusedKey.value = next;
  await nextTick();
  document.querySelector<HTMLElement>(`[data-message="${next}"]`)?.focus();
}

// Choosing and copying are about what the room holds, so a message still on its way is not in
// this list.
const items = computed<FeedItem[]>(() =>
  days.value.flatMap((day) => day.items).filter((item) => item.pending === null)
);
const itemKeys = computed<string[]>(() => items.value.map((item) => item.key));

// How far the reader has read, told to the server as messages come into sight, which moves the
// room's unread count in the sidebar (docs/web.md, 「Sidebar」). Nothing is marked until the room has
// taken its opening place, so the end it passes on the way to the first unread message is not read.
const opened = ref(false);
// The opening view is never animated: the end is pinned at once until the reader first touches the
// page, and only then do arriving rows glide as they otherwise would.
let opening = true;

useReadMarks({
  chatId,
  viewport: scroller,
  messages: roomFeed.messages,
  rows: () => new Set(items.value.map((item) => item.messageId)),
  newer: roomFeed.newer,
  away: awayFromEnd,
  settled: opened
});

// The first message the reader has not read, as the room list last said; null where it says none.
function firstUnread(): number | null {
  return rooms.value.find((room) => room.chatId === chatId)?.firstUnread ?? null;
}

// The room list carries the reader's own read mark, and the room opens at the first message it
// leaves unread; the list is waited for before that place is chosen, so a lazy read does not open the
// room at its end as though everything were read.
async function roomsSettled(): Promise<void> {
  if (roomsStatus.value !== "pending") {
    return;
  }

  await new Promise<void>((settle) => {
    const stop = watch(roomsStatus, (state) => {
      if (state !== "pending") {
        stop();
        settle();
      }
    });
  });
}

// The first unread message where it stands out of view with the feed at the room's end; null where
// the room opens at its end.
function firstUnreadOutOfView(): number | null {
  const first = firstUnread();
  const element = scroller();
  const row = first === null ? null : rowOf(rowLine(first));

  if (first === null || element === null) {
    return null;
  }

  // A row the end's page does not hold is further back than the end's view reaches.
  return row === null || row.getBoundingClientRect().top < element.getBoundingClientRect().top ? first : null;
}

// The room opened at its end with its first unread message in the same page: that message is brought
// to the middle of the view where it stands out of view at the end, and the end is left.
function standAtFirstUnread(): void {
  const first = firstUnreadOutOfView();
  const row = first === null ? null : rowOf(rowLine(first));

  if (row !== null) {
    scrollWithin(row, "center");
    bottom?.release();
  }
}

// An archived message that arrives takes the place of the row that was standing for it. The
// feed is re-read on its own timer as well as after a send, so this is where a row goes.
watch(() => roomFeed.messages.value, settleOutbox);

function settleOutbox(): void {
  const handed = handOverPictures(landedPictures(outbox.value, roomFeed.messages.value, speaker.value.id));

  drop(settledKeys(outbox.value, roomFeed.messages.value, speaker.value.id, toUnixSeconds(Date.now())), handed);
}

// The pictures of the rows going because the archive carries them: each archived message keeps the
// shape its preview measured and draws that preview until its own copy has loaded, so the picture
// neither moves nor goes blank as it takes the row's place. The previews handed over are no longer
// the rows' to let go of.
const handedPictures = new Set<string>();

function handOverPictures(landed: readonly LandedPicture[]): Set<string> {
  for (const { messageId, previewUrl } of landed) {
    const key = messagePicture(messageId);
    const shape = shapeOf(previewUrl);

    if (shape !== null) {
      rememberShape(key, shape);
    }

    standIn(key, previewUrl);
    handedPictures.add(key);
  }

  return new Set(landed.map((one) => one.previewUrl));
}

onScopeDispose(() => {
  for (const key of handedPictures) {
    releaseStandIn(key);
  }
});

// A row whose message went and never came back leaves once its grace is out, whether or not the
// archive was read again by then.
let graceTimer: ReturnType<typeof setTimeout> | null = null;

watch(() => graceEndsAt(outbox.value), (ends) => {
  if (graceTimer !== null) {
    clearTimeout(graceTimer);
  }

  graceTimer = ends === null ? null : setTimeout(settleOutbox, Math.max(0, ends * 1000 - Date.now()) + 500);
});

onScopeDispose(() => {
  if (graceTimer !== null) {
    clearTimeout(graceTimer);
  }
});

// The panel scrolls its own body; the container this page fills it with sits inside it.
function scroller(): HTMLElement | null {
  return feedRef.value?.$el?.parentElement ?? null;
}

// The row an address names, brought into view. A row the feed holds is scrolled to; any other is
// read with the stretch of the room around it, which takes the feed away from the room's end until
// it is read back down to it — so a message from months ago costs three reads, not every page
// between it and today.
async function scrollToMessage(messageId: number): Promise<boolean> {
  await nextTick();

  if (rowOf(rowLine(messageId)) === null) {
    if (!(await roomFeed.loadAround(messageId))) {
      return false;
    }

    bottom?.release();
    await nextTick();
  }

  const row = rowOf(rowLine(messageId));

  if (row === null) {
    return false;
  }

  scrollWithin(row, "center");
  bottom?.release();

  return true;
}

// The room's opening at a message: the stretch around it read as the first read, and the rows
// scrolled in the same moment they are laid out, so the first frame drawn already stands there. The
// first unread message opens the room there only where it would stand out of view at the room's end
// (docs/web.md, 「Room screen」); a message the address names is always gone to.
async function openAt(messageId: number, asked: boolean): Promise<boolean> {
  if (!(await roomFeed.loadAround(messageId))) {
    return false;
  }

  await nextTick();

  if (!asked && !roomFeed.newer.value) {
    bottom?.jump();

    if (firstUnreadOutOfView() === null) {
      return true;
    }
  }

  const row = rowOf(rowLine(messageId));

  if (row === null) {
    return false;
  }

  scrollWithin(row, "center");
  bottom?.release();

  return true;
}

// The row a message stands in, which is where a jump to it lands. A voice briefing of a line stands
// on that line rather than as a row — the island's own press is a jump to one — and a picture of an
// album stands in the album's row.
function rowLine(messageId: number): number {
  const briefs = roomFeed.messages.value.find((message) => message.messageId === messageId)?.briefs;

  if (briefs != null) {
    return briefs;
  }

  return items.value.find((item) => item.album?.some((picture) => picture.messageId === messageId))?.messageId ?? messageId;
}

function rowOf(messageId: number): HTMLElement | null {
  return scroller()?.querySelector<HTMLElement>(`[data-message="m${messageId}"]`) ?? null;
}

// A day chosen from a day heading's calendar: the first thing said that day or after it, and a day
// with nothing after it says so.
async function jumpToDay(day: string): Promise<void> {
  try {
    const found = await $fetch<RoomDayStart>(`/api/rooms/${chatId}/day`, { query: { date: day } });

    if (found.start === null) {
      island.say({ title: t("room.status.nothing_after") });

      return;
    }

    await jumpTo(found.start.messageId);
  } catch (error) {
    island.fail(error, t("room.error.jump_failed"));
  }
}

// A pressed quote: the message it answers, brought into view and marked for a moment.
async function jumpTo(messageId: number): Promise<void> {
  if (!(await scrollToMessage(messageId))) {
    island.say({ title: t("room.error.message_not_found"), tone: "warning" });

    return;
  }

  const key = `m${rowLine(messageId)}`;

  flashKey.value = key;
  setTimeout(() => {
    if (flashKey.value === key) {
      flashKey.value = null;
    }
  }, FLASH_MS);
}

// The menu's reply: the next send answers this message, and the keyboard goes to the box.
function startReply(key: string): void {
  const item = items.value.find((held) => held.key === key);

  if (item === undefined) {
    return;
  }

  replyTarget.value = {
    messageId: item.messageId,
    senderName: item.senderName,
    text: item.text,
    pictured: item.imageUrl !== null,
    attachment: item.attachments?.[0] ?? null
  };
  void nextTick(() => composer.value?.focus());
}

function cancelReply(): void {
  replyTarget.value = null;
}

// Esc in the box drops the reply, when there is one to drop.
function onEscape(event: KeyboardEvent): void {
  if (replyTarget.value === null) {
    return;
  }

  event.preventDefault();
  cancelReply();
}

// The room's end. A feed standing back in the room reads its end first.
async function scrollToBottom(): Promise<void> {
  if (roomFeed.newer.value) {
    await roomFeed.load();
  }

  await nextTick();

  bottom?.jump();
}

// Render first, then follow only if the reader still stands at the end. The resize observer
// covers later image loads and streaming growth as well as changes to the viewport itself.
async function followAfterRender(): Promise<void> {
  await nextTick();
  bottom?.follow();
}

// Reading upward: the older page is prepended, so the row the reader sees is put back where it
// stood. That row is read as the page lands rather than when it was asked for, since a jump — a
// quote, a picture's show-in-message — may have taken the feed elsewhere in the meantime; and the
// row is put back by where it now stands rather than by what grew, since the browser has already
// held it in place itself wherever the feed was not at its very top. Reading downward in a feed
// standing back in the room: the newer page is appended under the reader, who stays where they are.
// How far the feed must move before its direction is read, and where it stood when it was last read.
const SCROLL_TURN_PX = 4;
let lastScrollTop = 0;

async function onScroll(): Promise<void> {
  const element = scroller();

  if (element === null) {
    return;
  }

  // The way the reader is going, read off a move of more than a few pixels so a pixel's settling
  // does not turn it about.
  const moved = element.scrollTop - lastScrollTop;

  if (Math.abs(moved) > SCROLL_TURN_PX) {
    scrolledUp.value = moved < 0;
    lastScrollTop = element.scrollTop;
  }

  if (roomFeed.newer.value && element.scrollHeight - element.scrollTop - element.clientHeight < SCROLL_BOTTOM_THRESHOLD_PX) {
    await roomFeed.loadNewer();

    return;
  }

  if (element.scrollTop > SCROLL_TOP_THRESHOLD_PX) {
    return;
  }

  const held: { place: { putBack: () => void } | null } = { place: null };
  // Runs before the page is drawn, while the rows standing are still the ones the reader sees.
  const stop = watch(
    () => roomFeed.messages.value,
    () => {
      held.place ??= feedPlace(element, firstMessageInView(element));
    },
    { flush: "pre" }
  );
  const added = await roomFeed.loadOlder();

  stop();

  if (added === 0) {
    return;
  }

  await nextTick();
  held.place?.putBack();
}

// The menu's select starts choosing, with the message it was opened on already picked.
function startAt(key: string): Promise<void> {
  return keepFeedStill(() => {
    selecting.value = true;
    selected.value = new Set([key]);
    anchor.value = key;
  }, key);
}

// Entering choosing and leaving it are meant to move no row: the bar grows over the feed rather than
// taking its room, and the messages only slide aside. The feed is held through the change all the
// same, so nothing the change draws can carry the reader off: the message named — the one a finger
// holds — or else the first one in view stays where it stood, and a reader at the room's end stays at
// the end.
async function keepFeedStill(change: () => void, key: string | null = null): Promise<void> {
  const element = scroller();

  if (element === null) {
    change();

    return;
  }

  const place = feedPlace(element, key);

  change();
  await nextTick();
  place.putBack();
}

// Where the reader stands in the feed, and what puts them back there once the rows around them
// have moved: at the room's end, or the message named — else the first one in view — at the height
// it stood. Putting back lands in the same place however often it runs.
function feedPlace(element: HTMLElement, key: string | null = null): { atEnd: boolean; putBack: () => void } {
  const atEnd = key === null && !roomFeed.newer.value && element.scrollHeight - element.scrollTop - element.clientHeight <= 1;
  const held = key ?? firstMessageInView(element);
  const rowTop = (): number | null => (held === null ? null : (element.querySelector(`[data-message="${held}"]`)?.getBoundingClientRect().top ?? null));
  const was = rowTop();

  return {
    atEnd,
    putBack() {
      if (atEnd) {
        bottom?.jump();

        return;
      }

      const now = rowTop();

      if (was !== null && now !== null) {
        element.scrollTop += now - was;
      }
    },
  };
}

// A video taken full screen takes the feed's end with it, and the bottom test reads a reader in the
// middle as standing at the end; one who was not there is let go of following once put back.
function fullscreenPlace(element: HTMLElement): () => void {
  const place = feedPlace(element);

  return () => {
    place.putBack();

    if (!place.atEnd) {
      bottom?.release();
    }
  };
}

function firstMessageInView(element: HTMLElement): string | null {
  const top = element.getBoundingClientRect().top;

  for (const row of element.querySelectorAll<HTMLElement>("[data-message]")) {
    if (row.getBoundingClientRect().bottom > top) {
      return row.getAttribute("data-message");
    }
  }

  return null;
}

function pick(key: string, range: boolean): void {
  const keys = items.value.map((item) => item.key);
  const from = anchor.value === null ? -1 : keys.indexOf(anchor.value);
  const to = keys.indexOf(key);

  if (range && from !== -1 && to !== -1) {
    const next = new Set(selected.value);

    for (const between of keys.slice(Math.min(from, to), Math.max(from, to) + 1)) {
      next.add(between);
    }

    selected.value = next;

    return;
  }

  const next = new Set(selected.value);

  if (!next.delete(key)) {
    next.add(key);
  }

  selected.value = next;
  anchor.value = key;
}

// A finger held on a message chooses it — the room goes into choosing if it was not — and a finger
// that goes on to move chooses every message it passes, scrolling the feed while it stands at an
// edge. The gesture itself is the console's own, shared with every other list that chooses more
// than one row; what this room says of it is which presses are its to read — a finger on a chosen
// message is left to the browser, whose hold there selects the words — and what a hold means here.
useDragSelect({
  surface: () => feedRef.value?.$el ?? null,
  scroller,
  rowMark: "data-message",
  choosableMark: "data-choosable",
  keys: () => items.value.map((item) => item.key),
  selected,
  press: (key) => (selecting.value && selected.value.has(key) ? "browser" : "hold"),
  // The held message stays under the finger while choosing opens around it.
  hold: (key) => {
    if (!selecting.value) {
      return startAt(key);
    }

    return keepFeedStill(() => {
      selected.value = new Set([...selected.value, key]);
      anchor.value = key;
    }, key);
  }
});

// Finding a phrase in the room (docs/web.md, the room screen's find): the messages loaded that hold it, oldest first, the one
// shown among them, and the marks on what stands on the screen. The bar grows by the find row as it does for
// choosing, and the two never stand at once.
const finding = ref(false);
const findQuery = ref("");
const findShown = ref<number | null>(null);
const findBox = useTemplateRef<{ inputRef?: HTMLInputElement }>("findBox");
const barGrown = computed(() => selecting.value || finding.value);
const found = computed(() => (finding.value ? foundMessages(roomFeed.messages.value, findQuery.value) : []));
const foundAt = computed(() => {
  const at = findShown.value === null ? -1 : found.value.indexOf(findShown.value);

  return at === -1 ? null : at;
});
const findCount = computed(() =>
  findQuery.value.trim() === ""
    ? ""
    : found.value.length === 0
      ? t("room.status.find_none")
      : t("room.status.find_count", { at: (foundAt.value ?? found.value.length - 1) + 1, n: found.value.length })
);

useBackClose(finding, () => closeFind());

function openFind(): void {
  if (selecting.value) stopSelecting();

  finding.value = true;
  void nextTick(() => findBox.value?.inputRef?.focus());
}

function closeFind(): void {
  finding.value = false;
  findQuery.value = "";
  findShown.value = null;
  clearFound();
}

// A step to the hit before or after the one shown, which is brought into view and marked for a moment. A step pressed
// while the phrase is still being typed shows the newest hit first, as the typing would have.
async function stepFound(by: -1 | 1): Promise<void> {
  if (typed !== null) {
    clearTimeout(typed);
    typed = null;
    findShown.value = null;
  }

  const at = steppedHit(found.value.length, foundAt.value, by);

  if (at === null) return;

  findShown.value = found.value[at]!;
  await jumpTo(findShown.value);
}

// The next page further back, searched too; the hit shown stays the one shown.
async function findOlder(): Promise<void> {
  await roomFeed.loadOlder();
}

// A phrase typed shows its newest hit, a moment after the typing stops.
let typed: ReturnType<typeof setTimeout> | null = null;

watch(findQuery, () => {
  if (typed !== null) clearTimeout(typed);

  typed = setTimeout(() => {
    typed = null;
    findShown.value = null;
    if (found.value.length > 0) void stepFound(-1);
  }, 300);
});

// The marks follow the phrase, the hit shown and every row that comes or goes.
watch(
  () => [finding.value, findQuery.value, findShown.value, items.value.length] as const,
  async () => {
    await nextTick();

    if (!finding.value) {
      clearFound();

      return;
    }

    const shown = findShown.value === null ? null : `m${rowLine(findShown.value)}`;

    markFound(scroller(), findQuery.value, (row) => row.getAttribute("data-message") === shown);
  },
  { flush: "post" }
);

onBeforeUnmount(clearFound);

// The box they write in stands through the mode, so entering and leaving it touch neither the box
// nor where the keyboard is.
function startSelecting(): void {
  closeFind();
  void keepFeedStill(() => {
    selecting.value = true;
    selected.value = new Set();
    anchor.value = null;
  });
}

function stopSelecting(): void {
  void keepFeedStill(() => {
    selecting.value = false;
    selected.value = new Set();
    anchor.value = null;
  });
}

// One band to each run of messages chosen one after another, from the top of its first row to the
// foot of its last and across the whole of the scrolling panel but its scrollbar, measured off the
// rows and the panel as they stand inside the feed. It is measured again as
// the choice changes and as the feed changes size — a picture landing, the window narrowing.
interface ChoiceBox {
  key: string;
  top: number;
  left: number;
  width: number;
  height: number;
}

const choiceBoxes = ref<ChoiceBox[]>([]);

function measureChoice(): void {
  const content = feedRef.value?.$el;

  if (!selecting.value || content === undefined || selected.value.size === 0) {
    choiceBoxes.value = [];

    return;
  }

  const origin = content.getBoundingClientRect();
  const panel = scroller();
  const left = panel === null ? 0 : panel.getBoundingClientRect().left - origin.left;
  const width = panel?.clientWidth ?? origin.width;
  const rowOf = (key: string) => content.querySelector(`[data-row="${CSS.escape(key)}"]`)?.getBoundingClientRect() ?? null;

  choiceBoxes.value = chosenRuns(itemKeys.value, selected.value).flatMap((run) => {
    const first = rowOf(run[0]!);
    const last = rowOf(run[run.length - 1]!);

    return first === null || last === null
      ? []
      : [{ key: run[0]!, top: first.top - origin.top, left, width, height: last.bottom - first.top }];
  });
}

watch([selecting, selected, itemKeys], () => measureChoice(), { flush: "post" });

let choiceSizes: ResizeObserver | null = null;

watch(
  selecting,
  (on) => {
    choiceSizes?.disconnect();
    choiceSizes = null;

    const content = feedRef.value?.$el;

    if (on && content !== undefined) {
      choiceSizes = new ResizeObserver(() => measureChoice());
      choiceSizes.observe(content);
    }
  },
  { flush: "post" }
);

onBeforeUnmount(() => choiceSizes?.disconnect());

// The whole choice is taken or given up at once, which is what the toolbar's checkbox stands for.
function chooseAll(all: boolean): void {
  selected.value = all ? new Set(itemKeys.value) : new Set();
  anchor.value = null;
}

// What is copied is the whole record of those messages — every judgement, whatever the
// screen is showing — under the room it came from.
async function copyReport(chosen: FeedItem[]): Promise<void> {
  if (chosen.length === 0) {
    return;
  }

  // What a chip reads only when opened is read for the copy, every message at once.
  const items = await Promise.all(chosen.map(async (item) => ({ ...copyItemOf(item), chips: await copyChipsOf(chatId, item) })));
  const done = await copyText(reportOf(t, title.value, chatId, items));

  island.say(
    done
      ? { title: t("room.message.messages_copied", { n: countText(chosen.length) }), tone: "success" }
      : { title: t("common.error.copy_failed"), tone: "error" }
  );
}

async function copyOne(key: string): Promise<void> {
  const item = items.value.find((held) => held.key === key);

  if (item === undefined) {
    return;
  }

  await copyReport([item]);
}

// The menu's copy-conversation-number: which room and which message, for the chat agent to find it by.
async function copyRef(key: string): Promise<void> {
  const item = items.value.find((held) => held.key === key);

  if (item === undefined) {
    return;
  }

  const done = await copyText(messageRef(t, title.value, chatId, item.messageId));

  island.say(
    done
      ? { title: t("room.message.id_copied"), tone: "success" }
      : { title: t("common.error.copy_failed"), tone: "error" }
  );
}

// The menu's copy-text-only: the words alone, with none of the record around them.
async function copyBody(key: string): Promise<void> {
  const item = items.value.find((held) => held.key === key);

  if (item === undefined) {
    return;
  }

  const done = await copyText(bodyOf(item));

  island.say(
    done
      ? { title: t("room.message.text_copied"), tone: "success" }
      : { title: t("common.error.copy_failed"), tone: "error" }
  );
}

// Copying is what a selection is for, so a copy ends the selection.
async function copySelected(): Promise<void> {
  if (selected.value.size === 0) {
    return;
  }

  await copyReport(items.value.filter((item) => selected.value.has(item.key)));
  stopSelecting();
}

async function copyAll(): Promise<void> {
  await copyReport(items.value);
}

function onDrop(event: DragEvent): void {
  dragging.value = false;
  composer.value?.attach([...(event.dataTransfer?.files ?? [])]);
}

// The rows still standing hold the previews the tray handed them.
function release(): void {
  for (const url of previewsOf(outbox.value, outbox.value.map((held) => held.key))) {
    URL.revokeObjectURL(url);
  }
}

onScopeDispose(release);

// Pressing send puts the words and the files in the feed at once and hands them to the bot
// afterwards, so nothing waits on the round trip. The box and the tray are emptied here
// because what was in them is standing in the conversation now.
async function send(message: ComposedMessage): Promise<void> {
  const fresh = outboxOf(message.text, message.files, toUnixSeconds(Date.now()), replyTarget.value);

  if (fresh.length === 0) {
    return;
  }

  // A feed standing back in the room reads its end first; one already there takes what is sent as
  // the new part, read from its first line.
  const back = roomFeed.newer.value;

  // A picture keeps the room its shape asks for from its first drawing, so its bubble neither jumps
  // when it loads nor rises at one size and lands at another.
  await Promise.all(
    fresh.map(async (held) => {
      const preview = held.file?.previewUrl ?? null;
      const shape = preview === null ? null : await measurePicture(preview);

      if (preview !== null && shape !== null) {
        rememberShape(preview, shape);
      }
    })
  );

  // Where each message rises from, read while the input box still holds it.
  const starts = back ? [] : riseStarts(fresh);

  if (!back) {
    bottom?.catchUp();
  }

  outbox.value = [...outbox.value, ...fresh];
  composer.value?.clear({ keepPreviews: true });
  replyTarget.value = null;

  if (back) {
    await scrollToBottom();
  } else {
    void riseInto(fresh, starts);
  }

  await pump();
}

// Where each message just sent rises from (docs/web.md, 「What arrives comes in at the end」): the place
// its first part stood in the input box — the preview of its file, or the first line of its words. A
// reader who asked for less movement sees each arrive at once.
function riseStarts(fresh: readonly OutboxItem[]): (Point | null)[] {
  const form = composerFoot.value?.querySelector("form");

  if (form === null || form === undefined || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return fresh.map(() => null);
  }

  const previews = [...form.querySelectorAll("[data-picked]")];
  const words = form.querySelector("textarea");
  const wordsAt = words === null ? null : wordsOrigin(words);
  let picked = 0;

  return fresh.map((held) => {
    const preview = held.file === null ? null : previews[picked++];
    const at = held.file === null ? wordsAt : ((preview?.querySelector("img") ?? preview)?.getBoundingClientRect() ?? null);

    return at === null ? null : { x: at.left, y: at.top };
  });
}

// Where the first line of words stood in the box they were typed in: inside its own padding.
function wordsOrigin(words: HTMLTextAreaElement): { left: number; top: number } {
  const at = words.getBoundingClientRect();
  const style = getComputedStyle(words);

  return { left: at.left + Number.parseFloat(style.paddingLeft), top: at.top + Number.parseFloat(style.paddingTop) };
}

// Each message just sent rises into the bubble it now stands as, from the frame that bubble is put in
// the list: the flight is laid over it before that frame is painted, so the box emptying and the
// flight leaving it are one frame, with no frame of either the bubble standing in its place or of
// nothing at all.
async function riseInto(fresh: readonly OutboxItem[], starts: readonly (Point | null)[]): Promise<void> {
  const timing = flightTiming(document.documentElement);

  if (timing === null) {
    return;
  }

  await nextTick();

  await Promise.all(
    fresh.map((held, at) => {
      const start = starts[at] ?? null;
      const bubble = document.querySelector<HTMLElement>(`[data-row="${held.key}"] [data-bubble]`);

      if (start === null || bubble === null) {
        return undefined;
      }

      const landed = landedAs(held.key);

      return riseOutOf(bubble, start, timing, landed.bubble).finally(landed.stop);
    })
  );
}

// The bubble standing for a message on its way once the archived message has taken its row's place:
// the number the bot sent it as is noted while the row is still the outbox's, since the row goes
// with it, until `stop`.
function landedAs(key: string): { bubble: () => HTMLElement | null; stop: () => void } {
  let sentAs: number | null = null;

  const stop = watch(outbox, (items) => {
    sentAs = items.find((held) => held.key === key)?.messageId ?? sentAs;
  }, { flush: "sync" });

  return { bubble: () => (sentAs === null ? null : (rowOf(sentAs)?.querySelector<HTMLElement>("[data-bubble]") ?? null)), stop };
}

// The answers settling into the place of the turns gone in this change, each with the box its turn's
// words stood in. It is read before the change is drawn, while the turn's row still stands. A reader
// who asked for less movement sees each answer stand at once.
function settlings(gone: readonly StoodTurn[], fresh: readonly string[], rows: ReadonlyMap<string, FeedItem>): Map<string, Rect> {
  const froms = new Map<string, Rect>();

  if (gone.length === 0 || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return froms;
  }

  const answers = settledAnswers(gone, fresh.flatMap((key) => rows.get(key) ?? []));

  for (const [answer, turn] of answers) {
    const stood = document.querySelector<HTMLElement>(`[data-row="${turn}"] [data-bubble]`)?.getBoundingClientRect();

    if (stood !== undefined) {
      froms.set(answer, { left: stood.left, top: stood.top, width: stood.width, height: stood.height });
    }
  }

  return froms;
}

// Each answer settles into its bubble from the frame that bubble is put in, laid over it before that
// frame is painted, as a sent message's flight is.
async function settleAnswers(froms: ReadonlyMap<string, Rect>): Promise<void> {
  const timing = flightTiming(document.documentElement);

  if (timing === null || froms.size === 0) {
    return;
  }

  await nextTick();

  await Promise.all(
    [...froms].map(([key, from]) => {
      const bubble = document.querySelector<HTMLElement>(`[data-row="${key}"] [data-bubble]`);

      return bubble === null ? undefined : settleInto(bubble, from, timing);
    })
  );
}

// The sends go one at a time, in the order they were pressed (docs/web.md, the room screen's section on sending one line at a time): the
// next goes once the one before it has answered. A send that met no bot or no app waits, and the
// ones behind it wait behind it; it goes again after a rest that grows with each try, or at once when
// the bot is read answering again or the browser comes back online.
let pumping = false;
let waitingTries = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

async function pump(): Promise<void> {
  if (pumping) {
    return;
  }

  pumping = true;

  if (retryTimer !== null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }

  try {
    for (let batch = nextSend(outbox.value); batch.length > 0; batch = nextSend(outbox.value)) {
      if ((await deliver(batch)) === "waiting") {
        waitingTries += 1;
        retryTimer = setTimeout(() => void pump(), sendRetryMs(waitingTries));

        return;
      }

      waitingTries = 0;
    }
  } finally {
    pumping = false;
  }
}

watch(reachable, (now) => {
  if (now) {
    void pump();
  }
});

function onOnline(): void {
  void pump();
}

onMounted(() => window.addEventListener("online", onOnline));

onScopeDispose(() => {
  if (import.meta.client) {
    window.removeEventListener("online", onOnline);
  }

  if (retryTimer !== null) {
    clearTimeout(retryTimer);
  }
});

// The lines this browser kept for the room stand again where they stood, and what had not been
// answered goes on, its wait started afresh. A line whose send ran late has its key asked after at
// once; one already in the archive leaves at once.
async function restoreOutbox(): Promise<void> {
  const kept = await keptOutbox.load(chatId);
  const standing = new Set(outbox.value.map((held) => held.key));
  const back = kept.filter((held) => !standing.has(held.key));

  if (back.length === 0) {
    return;
  }

  outbox.value = [...restored(back), ...outbox.value];
  settleOutbox();
  void checkRound();
  void pump();
}

// Hands one send to the bot and writes on each row what came back: the words through the say
// route, the files through the attach route, which answers for each file on its own. Every try of
// one send carries its key, so the app hands it to the bot once however often it is tried.
async function deliver(batch: readonly OutboxItem[]): Promise<SendOutcome | "answered"> {
  const files = batch.filter((held) => held.file !== null);
  const first = batch[0];

  if (first === undefined) {
    return "answered";
  }

  try {
    if (files.length > 0) {
      const body = attachmentBody(first.text, files.map((held) => held.file as PickedFile), files[0]?.reply?.messageId ?? null);

      body.set("key", first.sendKey);

      const answer = await $fetch<SentAttachments>(`/api/rooms/${chatId}/attach`, { method: "POST", body });

      markFiles(files, answer);
    } else {
      const said = await $fetch<SentMessage>(`/api/rooms/${chatId}/say`, {
        method: "POST",
        body: { text: first.text, replyTo: first.reply?.messageId, key: first.sendKey },
        timeout: OUTBOX_SAY_CALL_MS
      });

      outbox.value = withSent(outbox.value, first.key, said.messageId);
    }
  } catch (error) {
    const outcome = sendOutcome(error);

    // Nothing went: the send waits for a bot and an app to answer, and goes again as it stands, until
    // it has waited out its bound and fails, letting the sends behind it go.
    if (outcome === "waiting") {
      const now = toUnixSeconds(Date.now());

      outbox.value = withWaiting(outbox.value, batch.map((held) => held.key), now);

      const given = overdueWaits(outbox.value, now);

      for (const key of given) {
        outbox.value = withFailed(outbox.value, key, t("room.error.send_not_taken"));
      }

      void readControl();

      return given.length > 0 ? "failed" : outcome;
    }

    // What the bot took and did not answer for in time may well be in the room already.
    if (outcome === "checking") {
      check(batch);
      await settle();
      settleOutbox();

      return outcome;
    }

    const reason = failureText(error, t("common.error.not_sent"));

    for (const held of batch) {
      outbox.value = withFailed(outbox.value, held.key, reason);
    }

    await readControl();

    return outcome;
  }

  // The archive is read again at once; the row stands until the message it stands for is in
  // it, or until it is plain that no message is coming — a file that is no message of its own.
  await settle();
  settleOutbox();

  return "answered";
}

// The attach route answers file by file, by name; each row takes its own answer.
function markFiles(batch: readonly OutboxItem[], answer: SentAttachments): void {
  const left = [...batch];
  const take = (name: string): OutboxItem | undefined => {
    const at = left.findIndex((held) => held.file?.file.name === name);

    return at === -1 ? undefined : left.splice(at, 1)[0];
  };

  for (const one of answer.sent) {
    const held = take(one.name);

    if (held !== undefined) {
      // The picture's shape follows it to the archived message that takes its row's place.
      const shape = shapeOf(held.file?.previewUrl);

      if (shape !== null && one.messageId !== null) {
        rememberShape(messagePicture(one.messageId), shape);
      }

      outbox.value = withSent(outbox.value, held.key, one.messageId);
    }
  }

  for (const failure of answer.failed) {
    const held = take(failure.name);

    if (held !== undefined) {
      outbox.value = withFailed(outbox.value, held.key, failure.reason);
    }
  }

  check(answer.checking.flatMap((one) => take(one.name) ?? []));

  // A file the answer does not name has no account of what became of it, and is not sent again
  // under a key that would only answer the same.
  for (const held of left) {
    outbox.value = withFailed(outbox.value, held.key, t("common.error.not_sent"));
  }
}

// Rows whose send ran late wait for the archive to carry them, and have their key asked after every
// few seconds for the message the send went out as, which a line the archive keeps as another
// speaker's is found by alone. The ones neither has settled once the watch is over are failed with a
// reason that sends them to the room before sending again (docs/web.md, the send checked after it ran
// late).
const CHECK_EVERY_MS = 5_000;
let checkTimer: ReturnType<typeof setTimeout> | null = null;
let checkingRound = false;
// Whether the screen has gone, so a round still answering leaves no timer behind it.
let checksOver = false;

function check(rows: readonly OutboxItem[]): void {
  if (rows.length === 0) {
    return;
  }

  const now = toUnixSeconds(Date.now());

  for (const held of rows) {
    outbox.value = withChecking(outbox.value, held.key, now);
  }

  watchChecks();
}

function watchChecks(): void {
  if (checksOver || checkTimer !== null || !outbox.value.some((held) => held.state === "checking")) {
    return;
  }

  checkTimer = setTimeout(() => {
    checkTimer = null;
    void checkRound();
  }, CHECK_EVERY_MS);
}

async function checkRound(): Promise<void> {
  if (checkingRound) {
    return;
  }

  checkingRound = true;

  try {
    const answered = await askKeys();

    for (const key of overdueChecks(outbox.value, toUnixSeconds(Date.now()))) {
      outbox.value = withFailed(outbox.value, key, t("room.error.send_unconfirmed"));
    }

    // A row the key answered for is the archived message by number, which the archive is read for.
    if (answered) {
      await settle();
    }

    settleOutbox();
  } finally {
    checkingRound = false;
    watchChecks();
  }
}

// Each checked row's key asked after, and what it came to written on the row; whether any came back
// as the message it went out as. A key that could not be asked is asked again next round.
async function askKeys(): Promise<boolean> {
  const outcomes = await Promise.all(
    keyChecks(outbox.value).map(async (held) => ({
      key: held.key,
      outcome: await $fetch<SendOutcomeRecord<SentMessage>>(`/api/rooms/${chatId}/sends/${held.sendKey}`).catch(() => null)
    }))
  );

  for (const { key, outcome } of outcomes) {
    if (outcome !== null) {
      outbox.value = withKeyOutcome(outbox.value, key, outcome);
    }
  }

  return outcomes.some(({ outcome }) => outcome?.state === "answered");
}

onScopeDispose(() => {
  checksOver = true;

  if (checkTimer !== null) {
    clearTimeout(checkTimer);
  }
});

// A row that failed goes again as it stands, words, file and all.
function retry(key: string): void {
  const held = outbox.value.find((one) => one.key === key);

  if (held === undefined || held.state !== "failed") {
    return;
  }

  outbox.value = withResending(outbox.value, key);

  void pump();
}

// A row the owner gives up on leaves the feed.
function discard(key: string): void {
  drop([key]);
}

// Rows the feed is done with: their previews go back to the browser with them, but for the ones
// handed to the archived messages taking their place.
function drop(keys: readonly string[], handed: ReadonlySet<string> = new Set()): void {
  if (keys.length === 0) {
    return;
  }

  for (const url of previewsOf(outbox.value, keys)) {
    if (!handed.has(url)) {
      URL.revokeObjectURL(url);
    }
  }

  outbox.value = without(outbox.value, keys);
}


// A run that ended wrote its message and its judgements; the archive is asked again at once,
// and once more a moment later for whatever landed just after.
//
// The first read is what this answers with, and the row standing for the turn waits on it: that
// row gives its place up only once the answer is in the feed to take it, so the conversation is
// never short by the row's height in between. Everything after that read — holding the feed at
// the bottom, and the second read — happens once the row has changed hands.
async function settle(): Promise<void> {
  await roomFeed.refresh();

  void follow();
}

async function follow(): Promise<void> {
  await followAfterRender();

  setTimeout(() => void roomFeed.refresh(), 2000);
}

// What is watched is the height of the feed itself rather than a list of the things that change
// it. A list has to be added to every time something new is put at the end of this feed, and
// nothing says so when it is not: the line that says a job is running was left out of one, and a
// reader who opened the room at the newest message was pushed that line's height off the end a
// moment later, for as long as they did not scroll. The height answers for all of them at once,
// including whatever is put here next.

// Every one of these is registered only while choosing. A registered shortcut takes its key
// from the page whether it does anything with it or not, so one standing all the time is one
// the browser never sees: Esc would be taken from the message menu — a menu that cannot be
// closed is a trap — and copy and select-all would be taken from the words on the screen, which
// is how a room full of text came to be uncopyable.
const whileChoosing = (run: () => void) => ({ usingInput: false, handler: run });

defineShortcuts(
  computed(() =>
    selecting.value
      ? {
          // An Esc that is the back gesture closing what floats over the room is that layer's alone.
          escape: () => {
            if (!isBackEscape()) {
              stopSelecting();
            }
          },
          meta_c: whileChoosing(() => void copySelected()),
          ctrl_c: whileChoosing(() => void copySelected()),
          meta_a: whileChoosing(() => chooseAll(true)),
          ctrl_a: whileChoosing(() => chooseAll(true))
        }
      : {}
  )
);

onMounted(async () => {
  const element = scroller();

  // Both boxes, because the end of the feed moves under the reader either way: the conversation
  // grows, or the window the conversation is read through gets shorter. A phone's keyboard does
  // the second — the shell is laid out from what is actually visible. The bars floating over the
  // conversation do it without either box changing size, so they are watched below.
  const content = feedRef.value?.$el;

  if (element !== null && content !== undefined) {
    // A conversation, not a log: a new part is read from its first line, and rises into view, while
    // what stood as the reader came to the end keeps them there however late it sizes itself.
    bottom = followBottom(element, content, {
      away: () => roomFeed.newer.value,
      ...readsFromFirstLine(scroller),
      smooth: () => !opening,
      onAway: (away) => {
        awayFromEnd.value = away;
      },
      // A message is what a reader opens, folds or loads a picture into (docs/web.md, 「Scroll anchoring」).
      anchorOf: (target) => (target instanceof Element ? target.closest("[data-row]") : null)
    });
    releaseFullscreen = keepPlace(element, fullscreenPlace);
    element.addEventListener("scroll", onScroll, { passive: true });

    const settled = (): void => {
      opening = false;
    };

    for (const kind of ["pointerdown", "wheel", "touchstart", "keydown"]) {
      element.addEventListener(kind, settled, { once: true, passive: true });
    }
  }

  // Whose room this is comes from the bot, and the queue's panel and the header's way into it
  // both hang on the answer, so it is asked for first and not waited on. Behind a hundred
  // messages the ask would otherwise leave the way in missing for as long as the room takes to
  // lay itself out, which on a phone is seconds. A member writes nothing here, so nothing asks.
  if (administrator.value) {
    void readControl();
  }

  // Where the room opens is settled before it is first drawn (docs/web.md, 「Room screen」): a room its
  // address opens at a message reads the stretch around it first. Any other room asks for its end at
  // once, beside the room list that carries the reader's read mark, and opens at its first unread
  // message in that page where the page holds it, around it where it does not, and at its end where
  // nothing is unread. The markdown renderer is fetched beside them, so no row is laid out as plain
  // text first. A message that cannot be read around opens the room at its end.
  const asked = messageOfQuery(route.query.at);
  const endRead = asked === null ? roomFeed.readEnd() : null;
  const renderer = loadMarkdownRenderer();
  // The opening position is set while the scroll container is unseen, so neither the rows nor the
  // bar's own thumb is seen moving from the top to the place the room opens at.
  const hidden = (on: boolean): void => {
    if (element !== null) {
      element.style.visibility = on ? "hidden" : "";
    }
  };

  let placed = false;

  if (endRead === null) {
    await renderer;
    hidden(true);
    placed = asked !== null && (await openAt(asked, true));
  } else {
    const [end] = await Promise.all([endRead.catch(() => null), roomsSettled(), renderer]);
    const first = firstUnread();

    if (first !== null && end?.messages.some((message) => message.messageId === first) !== true) {
      hidden(true);
      placed = await openAt(first, false);
    }
  }

  if (!placed) {
    hidden(true);
    await roomFeed.load(endRead ?? undefined);
    await scrollToBottom();

    if (asked === null) {
      standAtFirstUnread();
    }
  }

  opened.value = true;
  await nextTick();
  hidden(false);
  letGoOfAsked();

  if (administrator.value) {
    await restoreOutbox();
  }

  await readLive();
});

// A message the address comes to name while the room stands — the playing bar pressed in its own
// room — is gone to the way a pressed quote is. An address naming another room is that room's.
watch(
  () => (Number(route.params.chatId) === chatId ? route.query.at : undefined),
  async (at) => {
    const asked = messageOfQuery(at);

    if (asked === null || !opened.value) {
      return;
    }

    await jumpTo(asked);
    letGoOfAsked();
  }
);

// Once gone to, the message is taken off the address, so a reload, a tab the browser restores or a
// step back opens the room as any room opens rather than at a message long since read past.
function letGoOfAsked(): void {
  if (Number(route.params.chatId) === chatId && route.query.at !== undefined) {
    void router.replace({ query: { ...route.query, at: undefined } });
  }
}

// The standing watches do not ride the live stream, so they are read again on the two occasions
// they can have changed: something else started or stopped running here — the new run may be a
// check of a watch this screen has never seen — and, while a watch line actually stands, the pace
// the rest of the console keeps, since its last look and its deadline move on their own. A room
// with nothing running under it asks for nothing.
watch(
  () => workLines.value.map((line) => line.key).join(","),
  () => void readLive(),
);

usePolling(() => {
  if (workLines.value.some((line) => line.watch !== null)) {
    void readLive();
  }
}, POLL_INTERVAL_MS);

// A job beside the chat is the agency's, not the receiver's, so the live picture the receiver sends says nothing
// of one starting or ending. The agency's job events name it, and the board is read again when one comes.
useLiveRefresh(() => void readLive(), { on: ["worker-run"], everyMs: POLL_INTERVAL_MS });

async function readLive(): Promise<void> {
  // The work running anywhere is the administrator's to see.
  if (!administrator.value) {
    return;
  }

  try {
    const status = await $fetch<StatusView>("/api/status");

    live.value = status.live;
    watches.value = status.watches ?? [];
  } catch {
    // The room reads either way; without the picture it simply shows no other work.
  }
}

// The bars' heights, read whenever either changes size or comes and goes; a reader at the end stays
// at the end as they do, at once, since nothing new has arrived. The top bar's room is its resting
// height alone: the choosing row it grows by lies over the conversation, so the conversation keeps
// its place through choosing, and only what holds to the top steps down by the row. The row stands
// laid out whether choosing or not, and the bar grows by a transform, which changes no size: so
// these are read when the bars truly change size, never frame by frame as choosing opens or closes.
let barSizes: ResizeObserver | null = null;

function readBars(): void {
  headHeight.value = Math.ceil(roomNavbar.value?.getBoundingClientRect().height ?? 0);
  chooseHeight.value = chooseRow.value?.getBoundingClientRect().height ?? 0;
  footHeight.value = Math.ceil(composerFoot.value?.offsetHeight ?? 0);

  const foot = composerFoot.value;
  const send = foot?.querySelector("form [type='submit']")?.getBoundingClientRect();

  if (foot !== null && foot !== undefined && send !== undefined) {
    wayDownEnd.value = Math.round(foot.getBoundingClientRect().right - send.right);
  }

  void nextTick(() => bottom?.keep());
}

onMounted(() => {
  barSizes = new ResizeObserver(readBars);

  watch(
    [roomHead, composerFoot],
    (bars, before) => {
      for (const bar of before ?? []) {
        if (bar !== null && bar !== undefined) {
          barSizes?.unobserve(bar);
        }
      }

      for (const bar of bars) {
        if (bar !== null && bar !== undefined) {
          barSizes?.observe(bar);
        }
      }

      readBars();
    },
    { immediate: true, flush: "post" }
  );
});

onBeforeUnmount(() => {
  barSizes?.disconnect();
  const element = scroller();

  element?.removeEventListener("scroll", onScroll);
  releaseFullscreen?.();
  releaseFullscreen = null;
  bottom?.stop();
  bottom = null;
});

// A message landing in this room is the one thing the room learns of no other way. Its own run
// reads the feed back as it settles and a judgement arrives whole on the stream, but a message
// written into the archive — someone speaking here, or an answer sent from somewhere else — is
// news and nothing more.
//
// The news names the message, so news is answered by reading that message and not the end of the
// room again: a fast room said a hundred rows a minute at the screen for the sake of one. The
// other two causes are not news — a stream that came back missed whatever happened while it was
// down, and the clock only runs while there is no stream at all — so neither of them knows what
// it is missing, and both read the page.
useLiveRefresh(
  (cause, event) => void (cause === "event" ? catchUpFeed(event?.messageId ?? null) : refreshFeed()),
  {
    on: ["message"],
    where: (event) => event.chatId === chatId,
    everyMs: POLL_INTERVAL_MS
  }
);

// Whether the bot is there decides what this room may do. A turn that ended anywhere is the bot
// answering, so that is when it is asked again. It moves only the box a member is not given.
if (administrator.value) {
  useLiveRefresh(() => void readControl(), { on: TURN_ENDED, everyMs: POLL_INTERVAL_MS });
}

async function refreshFeed(): Promise<void> {
  await roomFeed.refresh();

  await followAfterRender();
}

// The same, for the news that named one message. A reader standing back in the room is left
// where they stand either way: what arrives is added at the end, and only a reader already at
// the end is carried along.
async function catchUpFeed(messageId: number | null): Promise<void> {
  await roomFeed.catchUp(messageId);

  await followAfterRender();
}
</script>
