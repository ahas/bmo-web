<template>
  <UContextMenu :items="menuItems" :disabled="menuOff" :content="menuContent">
    <!-- The reactions at the menu's head as the messenger offers them: a strip of emojis, the reader's own marked.
         Each is the library's square ghost button with the emoji at the icon's size, the reader's own pressed in
         the accent's soft wash; the strip is as wide as its buttons, one even gap apart. -->
    <template #reactions>
      <span data-reaction-strip class="flex items-center gap-1" role="group" :aria-label="$t('room.action.react')">
        <UButton
          v-for="choice in strip"
          :key="choice.emoji"
          color="neutral"
          variant="ghost"
          square
          :active="choice.mine"
          active-color="primary"
          active-variant="soft"
          :aria-pressed="choice.mine"
          @click="choice.press()"
        >
          <span class="grid size-5 place-items-center text-lg leading-none">{{ choice.emoji }}</span>
        </UButton>
      </span>
    </template>

    <!-- The row's own padding is breathing room for the box it becomes when it is hovered, chosen
         or brought into view, and nothing else: it is the same top and bottom so that box sits
         square around what it holds, and its side room stands outside the column the message reads
         in, so the words keep their full width and never touch the box's edge. The space between one message and
         the next is the feed's, not a tail hung under each row — a tail is drawn inside the row it
         belongs to, so a chosen message would light up the empty ground beneath it, and the reader
         reads the gap as belonging to the message above rather than lying between the two. What
         the message says of itself — its name, its time, its verdicts and what its turn did — stands
         inside its bubble. Half the step between two bubbles of a run is each row's own room, so
         the run's step is the conversation's measure.

         On a touch screen a held finger chooses messages rather than letters, so the words are
         not selectable there — except in a message already chosen, where holding them is the
         browser's own selection and copy.

         The feed reads a new part from its first row, which it never carries past the top. The
         row's scroll margin is the day mark held at that top, so the row's first line stands clear
         under it. -->
    <div
      class="group/row -mx-3 scroll-mt-10 rounded-lg px-3 py-[calc(var(--chat-message-gap)/4)] transition-colors"
      :class="[
        props.selecting ? 'cursor-pointer' : '',
        letters,
        props.flashed && !props.selected ? 'bg-primary/10 ring-1 ring-primary/40' : ''
      ]"
      :data-message="message ? props.item.key : undefined"
      :data-row="props.item.key"
      :data-mine="props.item.look.side === 'right' ? '' : undefined"
      :data-choosable="message && props.item.pending === null ? '' : undefined"
      :tabindex="message ? (props.roving ? 0 : -1) : undefined"
      :aria-haspopup="menuOff ? undefined : 'menu'"
      @pointerdown="onPointerDown"
      @contextmenu="onContextMenu"
      @focus="emit('focused', props.item.key)"
      @keydown.enter="onEnter"
      @keydown.up="onMove($event, -1)"
      @keydown.down="onMove($event, 1)"
      @click="onClick"
    >
      <div :class="props.selecting ? (textChoosable ? 'pointer-events-none pointer-coarse:pointer-events-auto' : 'pointer-events-none') : ''">
        <!-- Choosing opens a column of its own width at the leading edge, the same for every row
             (docs/web.md, the room screen's section on choosing and copying), and the mark stands in it beside the message rather
             than over it. It stands on the centre of the row's first line and keeps no room of its
             own above it, so a row of one line has it at its middle and a row of many lines keeps
             it beside its first line: its cell is one line of that line's own type tall, set where
             that line starts. It hangs out of the reading column by less than the row's own side
             padding, so it stays inside the box the row becomes. It slides in from past the
             column's edge as the message slides aside, in a cell that cuts it off there, so
             nothing fades while the row moves. The mark is a checkbox's own square, the shape the select-all checkbox
             over the list carries, so one list is not read as two ways of choosing, and it is what
             answers a pointer over the row and a press on it. It stands in every row all along,
             hidden past the cell's edge while nothing is being chosen, so opening and closing
             choosing makes and removes nothing in any row and only moves what is there. -->
        <div class="relative">
          <div v-if="message" class="absolute -start-(--chat-choose-hang) flex h-lh w-(--chat-choose-mark) items-center overflow-hidden" :class="markLine" aria-hidden="true">
            <span
              class="flex size-(--chat-choose-mark) items-center justify-center rounded-sm border transition-[translate,visibility]"
              :class="[
                choosingMotion,
                props.selecting ? '' : 'invisible -translate-x-(--chat-choose-room)',
                props.selected
                  ? 'border-primary bg-primary text-inverted group-hover/row:bg-primary/85 group-active/row:bg-primary/75'
                  : 'border-accented text-transparent group-hover/row:border-primary group-active/row:bg-primary/10'
              ]"
            >
              <UIcon name="i-material-symbols-check" class="size-3" />
            </span>
          </div>

          <!-- A message on the leading side slides aside by the column's width, by transform
               alone, so its bubble keeps its width and its lines; the bubble's widest keeps that
               much clear on its far side at all times, so it is never cut there. The owner's
               messages stay, the column already clear beside them, and a system line keeps it
               clear on both sides. -->
          <div :class="slide">
            <!-- A line the bot sent as the service stands as a system line, worded and placed like
                 the date mark: centred and muted, its time after it, with no photo, name line or
                 bubble, so the chat agent is not seen to have said it. It is still a message of the room, so
                 the row around it is chosen, copied and answered as any other. -->
            <p v-if="props.item.notice" :id="props.item.key" data-notice data-words class="px-(--chat-choose-room) text-center text-sm text-muted">
              {{ props.item.shownText }}
              <span class="ms-1 text-dimmed tabular-nums">{{ clock }}</span>
            </p>

            <UChatMessage
              v-else
              :id="props.item.key"
              :role="props.item.look.role"
              :side="props.item.look.side"
              variant="naked"
              :ui="sideLayout(props.item.look.side)"
              :parts="props.item.parts"
            >
              <!-- The photo is the run's, standing once beside its last bubble (RoomSenderRun);
                   every row keeps the photo's room, so the bubbles of a run start on one line. -->
              <template #leading>
                <span class="size-(--chat-face) shrink-0" aria-hidden="true" />
              </template>

              <template #content>
                <!-- Everything the message says of itself stands inside its bubble (docs/web.md,
                     「Every message is a bubble」): the run's name at its head, a quote, a picture
                     running to its edges, the words, and the meta line at its foot with whatever
                     its chips spread under it. The bubble keeps no inner room of its own, since a
                     picture runs to its edges: each part keeps the room itself, and the bubble cuts
                     what it holds at its own corners. Its tail hangs outside that cut. -->
                <!-- A message that has just arrived rises a short way into its place, and one the
                     owner has just sent rises out of the input bar (the room screen draws that rise
                     over this bubble): only the bubble moves, never the row the conversation
                     measures. -->
                <div
                  ref="bubble"
                  data-bubble
                  class="relative max-w-full"
                  :class="[bubbleClass, albumed ? 'w-80' : pictured ? 'w-fit max-w-80' : 'w-fit', props.arriving ? 'bubble-rise' : '']"
                >
                  <div class="relative flex flex-col overflow-hidden rounded-inherit">
                    <!-- The sender's name, once at the head of the run's first bubble, and the
                         message this one answers: a line pressed to go there, one the archive does
                         not hold going nowhere. -->
                    <div v-if="head" class="flex min-w-0 flex-col gap-(--chat-meta-gap) px-(--chat-pad-x) pt-(--chat-pad-y)" :class="pictured ? 'pb-(--chat-pad-y)' : ''">
                      <!-- A message the owner forwarded stands marked with who said the original, and a press opens it
                           there (docs/web.md, 「What was done to a message」). -->
                      <NuxtLink
                        v-if="props.item.forwarded !== undefined"
                        data-forwarded
                        :to="`/rooms/${props.item.forwarded.room}?at=${props.item.forwarded.messageId}`"
                        class="flex min-w-0 items-center gap-1 text-sm leading-(--chat-meta-line) text-dimmed hover:text-default"
                      >
                        <UIcon name="i-material-symbols-forward" class="size-3.5 shrink-0" aria-hidden="true" />
                        <span class="truncate">{{ $t("room.label.forwarded", { name: props.item.forwarded.senderName }) }}</span>
                      </NuxtLink>
                      <!-- A message stands under the name of whoever said it, and nothing beside it (docs/web.md, the
                           naming rule). -->
                      <span data-words v-if="named" data-name class="truncate text-sm leading-(--chat-meta-line) font-medium" :class="nameColour(props.item.senderId, props.item.senderName)">{{ props.item.senderName }}</span>
                      <RoomQuote
                        v-if="props.item.run === null && props.item.quote !== null"
                        :quote="props.item.quote"
                        :chat-id="props.chatId"
                        @jump="emit('jump', $event)"
                      />
                    </div>

                    <!-- The pictures of one send stand together as the album they went out as, a
                         mosaic filling the bubble's width; one picture stands alone. Either runs to the bubble's edges, and the
                         caption the send carried stands under it. -->
                    <AlbumMosaic
                      v-if="(props.item.album ?? []).length > 1"
                      :pictures="props.item.album!"
                      :sender-name="props.item.senderName"
                      :stamp="stamp"
                    />

                    <MessageImage
                      v-else-if="props.item.imageUrl !== null"
                      :src="props.item.imageUrl"
                      :message-id="props.item.pending === null ? props.item.messageId : undefined"
                      flush
                      :title="`${props.item.senderName} · ${stamp}`"
                    />

                    <!-- The time stands at the bubble's trailing foot: at the end of the words' last line
                         where that line leaves it room, or on a line of its own under them, the
                         words keeping a blank as wide as the line for it at their end. Over a
                         picture with nothing under it, it stands on the picture's foot instead. -->
                    <div
                      :class="bodyLook"
                      :data-meta-room="wordsLast && metaRoom !== null ? '' : undefined"
                      :style="wordsLast && metaRoom !== null ? { '--chat-meta-room': `${metaRoom}px` } : undefined"
                    >
                      <!-- A row standing for a turn still running holds what that turn is at; every
                           other row holds what was said. Nothing around the two differs, because
                           there is nothing around them but this one row. -->
                      <RunProgress v-if="props.item.run !== null" class="min-w-0 max-w-full grow" :run="props.item.run" />

                      <!-- What the room actually said is marked as words. With a mouse, dragging across
                           them selects them; with a finger, they are selected by holding them once their
                           message is chosen. They break between words, a Korean one included, and fold
                           anywhere only where a run of them is wider than the bubble. -->
                      <div
                        v-else-if="worded"
                        class="min-w-0 max-w-full grow"
                        :class="[wordsWrap, props.item.thinking ? 'text-muted' : '']"
                        :data-thinking="props.item.thinking ? '' : undefined"
                        data-words
                        @click.capture="pressLink"
                      >
                        <TelegramText v-if="props.item.shownText" :text="props.item.shownText" :expressions="props.item.expressions" :formats="props.item.formats" :markdown="props.item.look.markdown" :chat-id="props.chatId" :message-id="props.item.messageId" />

                        <!-- A file the browser cannot draw stands as its name while it goes. -->
                        <p v-if="props.item.fileName !== null" class="flex items-center gap-1 text-sm break-all">
                          <UIcon name="i-material-symbols-draft-outline" class="size-4 shrink-0 text-dimmed" />
                          {{ props.item.fileName }}
                        </p>

                        <!-- A deleted message keeps its place as one quiet line (docs/web.md, 「What was done to a message」);
                             one deleted on its messenger still holds its words, which a press on the line opens. -->
                        <template v-else-if="empty">
                          <button
                            v-if="props.item.deleted && props.item.deletedText"
                            type="button"
                            class="text-muted italic underline decoration-dotted underline-offset-2 hover:text-default"
                            data-deleted
                            :aria-expanded="showingDeleted"
                            @click.stop="showingDeleted = !showingDeleted"
                          >
                            {{ showingDeleted ? $t("room.label.deleted_message_hide") : $t("room.label.deleted_message_show") }}
                          </button>
                          <p v-else class="text-muted italic" :data-deleted="props.item.deleted ? '' : undefined">
                            {{ props.item.deleted ? $t("room.label.deleted_message") : $t("room.label.empty_message") }}
                          </p>
                          <p v-if="showingDeleted && props.item.deletedText" data-deleted-words class="mt-1 border-s-2 border-default ps-2 text-toned whitespace-pre-wrap break-words">
                            {{ props.item.deletedText }}
                          </p>
                        </template>
                      </div>

                      <!-- An agent's request for a secret stands under the words as a line of its own (docs/web.md,
                           the secret store section). -->
                      <div v-if="secretRequests.length > 0" class="flex basis-full flex-col gap-2" data-secret-requests>
                        <SecretRequestLine
                          v-for="request in secretRequests"
                          :key="request.name"
                          :request="request"
                          :chat-id="props.chatId"
                          :sent-at="props.item.sentAt"
                        />
                      </div>

                      <LinkPreviews
                        v-if="props.item.run === null && props.item.pending === null && links.length > 0"
                        class="basis-full"
                        :chat-id="props.chatId"
                        :message-id="props.item.messageId"
                        :text="props.item.text"
                      />

                      <!-- A file's line takes the bubble's whole width and no more: without its floor
                           at nought the player's own 320 px would push past a narrower bubble. -->
                      <!-- A sticker alone stands in a fixed box of its own, its time beside its foot. A
                           player keeps from whatever stands above it the room a picture keeps from its
                           caption. -->
                      <div
                        v-for="(attachment, index) in attachments"
                        :key="attachment.id"
                        class="flex min-w-0 flex-col gap-1 text-sm"
                        :class="[sticker ? 'shrink-0' : voiced ? '' : 'basis-full', heard(attachment) && (worded || links.length > 0 || index > 0) ? 'mt-(--chat-media-step)' : '']"
                      >
                        <TelegramAsset v-if="attachment.kind === 'sticker'" :class="sticker ? 'size-(--chat-sticker)' : ''" :attachment="attachment" :chat-id="props.chatId" :message-id="props.item.messageId" :fallback="$t('room.label.sticker_preview')" />
                        <!-- A sound the browser can play stands as the player, which carries its size and download
                             itself; a video stands as its player with its file line under it. -->
                        <!-- A sound stands as its player, the recording's length beside it and, on a voice note, the words
                             heard in it under them — or the one line that it could not be heard (docs/web.md, the room
                             screen's sound messages). -->
                        <div v-else-if="heard(attachment)" data-sound class="flex w-80 max-w-full min-w-full flex-col gap-1">
                          <div class="flex min-w-0 items-center gap-2">
                            <AudioPlayer
                              class="min-w-0 flex-1"
                              :src="`${mediaUrl(attachment.kind, props.chatId, props.item.messageId)}?item=${attachment.id}`"
                              :download="`${mediaUrl(attachment.kind, props.chatId, props.item.messageId)}?item=${attachment.id}&as=download`"
                              :name="attachment.name"
                              :size="attachment.bytes === null ? null : fileSizeText(attachment.bytes)"
                              :trail-room="playerLast && index === attachments.length - 1 ? metaRoom : null"
                            />
                            <span v-if="voiceSeconds !== null" data-voice-seconds class="shrink-0 text-xs tabular-nums text-dimmed">{{ playClock(voiceSeconds) }}</span>
                          </div>
                          <p v-if="transcript !== null" data-transcript class="min-w-0 text-sm break-words whitespace-pre-wrap text-toned">{{ transcript }}</p>
                          <p v-else-if="voiceFailed" data-voice-failed class="text-sm text-dimmed">{{ $t("room.label.voice_failed") }}</p>
                        </div>
                        <!-- An animation plays where it stands, over and over and without sound, as the messenger
                             shows one: no player and no file line (docs/web.md, the room screen's animations). -->
                        <MessageAnimation
                          v-else-if="attachment.kind === 'animation' && attachment.available"
                          :attachment="attachment"
                          :chat-id="props.chatId"
                          :message-id="props.item.messageId"
                        />
                        <MessageVideo
                          v-else-if="playable(attachment)"
                          class="self-start"
                          :attachment="attachment"
                          :chat-id="props.chatId"
                          :message-id="props.item.messageId"
                        />
                        <!-- A kept file stands as a line of its own: what it is, how large, and the way to
                             take it. The name wraps rather than being cut, since it is the file's own. -->
                        <div
                          v-if="attachment.kind !== 'sticker' && !(attachment.kind === 'animation' && attachment.available) && !heard(attachment)"
                          data-attachment
                          class="flex max-w-full items-center gap-2 rounded-md border border-default py-1 ps-2 pe-1"
                          :class="attachment.available ? '' : 'text-muted'"
                        >
                          <UIcon :name="attachment.kind === 'audio' ? 'i-material-symbols-audio-file-outline' : attachment.kind === 'video' ? 'i-material-symbols-video-file-outline' : 'i-material-symbols-draft-outline'" class="size-5 shrink-0 text-dimmed" />
                          <span class="min-w-0 flex-1 break-all">{{ attachment.name }}</span>
                          <span v-if="attachment.bytes !== null" class="shrink-0 text-muted tabular-nums">{{ fileSizeText(attachment.bytes) }}</span>
                          <UTooltip v-if="attachment.available" :text="$t('common.aria.download_named', { name: attachment.name })">
                            <UButton
                              size="sm"
                              color="neutral"
                              variant="ghost"
                              icon="i-material-symbols-download"
                              :to="`${mediaUrl(attachment.kind, props.chatId, props.item.messageId)}?item=${attachment.id}&as=download`"
                              external
                              download
                              :aria-label="$t('common.aria.download_named', { name: attachment.name })"
                              @click.stop
                            />
                          </UTooltip>
                          <span v-else class="shrink-0 pe-1 text-muted">{{ $t("room.label.unreceivable") }}</span>
                        </div>
                      </div>

                      <!-- Reactions where the meta line does not stand: on its own line, as the line would carry them. -->
                      <RoomReactions v-if="listening && reactions.length > 0" class="basis-full pt-(--chat-meta-gap)" :reactions="reactions" @react="emit('react', props.item.key, $event)" />

                      <!-- While the chat agent only listens there is nothing to count, and the time left stands
                           where the line would. -->
                      <JudgementChips
                        v-if="!listening"
                        :judgements="props.item.judgements"
                        :spend="props.item.spend"
                        :actions-at="props.item.actions"
                        :drafts="props.item.drafts"
                        :round-judgements="props.roundJudgements"
                        :round-situation="props.roundSituation"
                        :live="live"
                        :chat-id="props.chatId"
                        :message-id="props.item.messageId"
                        :briefing="props.item.briefing"
                        :figuring="props.item.figuring"
                        :sent-at="props.item.sentAt"
                        :judging="message && props.judging"
                        :over-picture="overPicture"
                        :beside-picture="sticker"
                        :clock="message"
                        :after-words="wordsLast || playerLast"
                        :answer="props.item.look.role === 'assistant'"
                        :thinking="props.item.thinking"
                        @room="metaRoom = $event"
                      >
                        <!-- How long the room waited for this answer; a message the archive holds no
                             measurement of says nothing at all. -->
                        <!-- Who reacted to the message stands at the line's leading end, the time at its trailing end, on one
                             line as the messenger lays them (docs/web.md, 「What was done to a message」). -->
                        <template v-if="reactions.length > 0" #lead>
                          <RoomReactions :reactions="reactions" @react="emit('react', props.item.key, $event)" />
                        </template>

                        <template v-if="props.item.answerSeconds !== null" #took>
                          <span data-took>{{ $t("room.label.answer_took", { time: spanClock($t, props.item.answerSeconds) }) }}</span>
                        </template>

                        <template #clock>
                          <!-- A pinned message wears the pin; an edited one says so, and when, in its tooltip. -->
                          <HintTip v-if="message && props.item.pinnedAt" :text="$t('room.label.pinned_at', { time: formatStamp(props.item.pinnedAt) })" class="inline-flex" data-pinned>
                            <UIcon name="i-material-symbols-keep" class="size-4" :aria-label="$t('room.label.pinned')" role="img" />
                          </HintTip>
                          <HintTip v-if="message && props.item.editedAt && !props.item.deleted" :text="$t('room.label.edited_at', { time: formatStamp(props.item.editedAt) })" data-edited>
                            {{ $t("room.label.edited") }}
                          </HintTip>
                          <span v-if="message" data-clock>{{ clock }}</span>
                          <!-- Where a message of the reader's own stands on its way, one mark in a column
                               of its own width beside the time, so a change of state changes the mark and
                               nothing beside or under it. A failed one is pressed for why and what next,
                               and one that waits for a bot or is being checked for deleting. -->
                          <span v-if="markShown" data-send-mark class="inline-flex size-5 items-center justify-center" @pointerdown.stop @click.stop>
                            <UDropdownMenu v-if="mark === 'failed'" :items="failedItems" :content="{ align: 'end' }">
                              <UTooltip :text="$t('room.status.not_sent')">
                                <UButton
                                  size="xs"
                                  color="error"
                                  variant="ghost"
                                  icon="i-material-symbols-error"
                                  class="size-5 justify-center p-0"
                                  :aria-label="$t('room.status.not_sent')"
                                />
                              </UTooltip>
                            </UDropdownMenu>
                            <UDropdownMenu v-else-if="mark === 'waiting' || mark === 'checking'" :items="heldItems" :content="{ align: 'end' }">
                              <UTooltip :text="markWord">
                                <UButton
                                  size="xs"
                                  color="neutral"
                                  variant="ghost"
                                  :icon="markIcon"
                                  class="size-5 justify-center p-0"
                                  :aria-label="markWord"
                                />
                              </UTooltip>
                            </UDropdownMenu>
                            <UTooltip v-else :text="markWord">
                              <UIcon :name="markIcon" class="size-4" :aria-label="markWord" role="img" />
                            </UTooltip>
                          </span>
                        </template>
                      </JudgementChips>
                    </div>
                  </div>

                  <!-- The run's last bubble hangs its tail off its foot on the photo's side, in the
                       bubble's own colour. -->
                  <BubbleTail v-if="tailed" :side="props.item.look.side" />
                </div>
              </template>
            </UChatMessage>
          </div>
        </div>
      </div>
    </div>
  </UContextMenu>
</template>

<script setup lang="ts">
import { messageLinks } from "#shared/links";
import { secretRequestOfLink } from "#shared/secret-kinds";

import { fileSizeText } from "~/domain/attachments";
import { keepFitted } from "~/domain/bubble-fit";
import { messageMenu, reactionStrip } from "~/domain/messagemenu";
import { mineReaction } from "~/domain/message-acts";
import { mediaUrl } from "~/domain/player";
import { asideSlide, bubbleLook, choosingMotion, nameColour, sendMark, sideLayout, wordsWrap } from "~/domain/room";
import { secretRequestsOf, useConsoleBases, useSecretRequest } from "~/domain/secret-form";
import { releaseFocusOutside } from "~/domain/tapfocus";
import { playClock } from "bmo-ui/app/domain/player";
import { clockUnder, formatStamp, spanClock } from "bmo-ui/app/domain/time";
import { countText } from "~/domain/numbers";
import { liveChip } from "~/domain/turns";

import type { ContextMenuItem, DropdownMenuItem } from "@nuxt/ui";
import type { Judgement, MessageAttachment, Situation } from "#shared/types";
import type { FeedItem, RunPlace, SendMark } from "~/domain/room";
import type { LiveTurn } from "~/domain/working";

interface Props {
  item: FeedItem;
  // Which room this row is in.
  chatId: number;
  selecting: boolean;
  selected: boolean;
  // Whether this row is the one a quote just brought into view, marked for a moment.
  flashed: boolean;
  // Whether this row is the one the feed hands the keyboard. The rows are peers: one of them
  // is the tab stop and the arrows move between them, rather than every message being a stop.
  roving: boolean;
  // Where the row stands in its sender's run: the first carries the name, the last the tail.
  place: RunPlace;
  // Whether the row has just arrived at the end of the room being read, and comes in rising.
  arriving?: boolean;
  // Whether the message is being judged right now.
  judging?: boolean;
  // The day the row stands under, where it stands under one: a row standing at the foot under a later
  // day than its own reads its time with its date.
  day?: string;
  // Whether the reader is the platform administrator, whose delete the record takes on any message.
  administrator?: boolean;
  // Whether the reader may write to the room: the answer and the acts on a message follow it.
  writable?: boolean;
  // The round's whole record as the page reads it, for the answer's one record press: the gates that read the
  // person's message and the send and checks of the answer alike (docs/web.md, the room screen's chip line).
  roundJudgements?: Judgement[];
  // The room's situation note as that round read it.
  roundSituation?: Situation | null;
}

const props = withDefaults(defineProps<Props>(), { arriving: false, judging: false, administrator: false, writable: false, roundJudgements: () => [], roundSituation: null });

// Whether this row holds one of the room's own messages. The other kind holds the turn still
// running: it is a row like any other and wears everything a row wears — the side, the picture,
// the header, the column the words read in, the chip line under them — but nothing is said to it,
// because there is no message there yet to choose, copy, answer or walk to with the arrows.
const message = computed<boolean>(() => props.item.run === null);
// Whether the row is the chat agent only listening, which holds no turn (docs/web.md, 「The listening row」).
const listening = computed<boolean>(() => props.item.run?.listening !== undefined);

// What the chip line is handed while the turn runs: what the turn has done so far and what it has
// spent so far, both of which it carries itself. A row that is a message leaves both in the
// record and the line reads them from there.
const live = computed<LiveTurn | null>(() => {
  const run = props.item.run;

  if (run === null) {
    return null;
  }

  return {
    actions: run.progress?.actions ?? [],
    dropped: run.progress?.droppedActions ?? 0,
    droppedContext: run.progress?.droppedContext ?? 0,
    chip: liveChip(t, run.progress)
  };
});

const links = computed(() => messageLinks(props.item.text));

// The requests for a secret the words carry, each pressed in place rather than followed (docs/web.md, the secret
// store section).
const consoleBases = useConsoleBases();
const secretRequests = computed(() =>
  props.item.run === null && props.item.pending === null ? secretRequestsOf(props.item.text, props.item.formats, consoleBases.value) : []
);
const requestSecret = useSecretRequest();

function pressLink(event: MouseEvent): void {
  const link = event.target instanceof Element ? event.target.closest("a") : null;
  const href = link?.getAttribute("href") ?? null;
  const request = href === null ? null : secretRequestOfLink(href, consoleBases.value);

  if (request === null) return;

  event.preventDefault();
  event.stopPropagation();
  requestSecret(request, props.chatId, props.item.sentAt);
}
const reactions = computed(() => (props.item.deleted ? [] : (props.item.reactions ?? [])));

// A message that said nothing and carried nothing says that it is empty, in the place its words
// would have stood; one that carried a picture or a file is that picture or that file alone.
// Whether the words a message deleted on its messenger still holds stand opened under its line.
const showingDeleted = ref(false);

const empty = computed<boolean>(
  () => !props.item.shownText && props.item.imageUrl === null && (props.item.attachments ?? []).length === 0
);
const worded = computed<boolean>(() => props.item.shownText !== "" || props.item.fileName !== null || empty.value);

// Whether the words are the last thing before the meta line, with no card or file between them, so
// the line may stand at the end of their last line; and how wide it stands there, which the words
// keep blank.
const wordsLast = computed<boolean>(
  () =>
    props.item.run === null &&
    worded.value &&
    !(props.item.pending === null && links.value.length > 0) &&
    (props.item.attachments ?? []).length === 0 &&
    reactions.value.length === 0
);
const metaRoom = ref<number | null>(null);

// Whether the bubble holds a sound player, which sets its width (docs/web.md, the room screen's sound section); and whether
// that player is the last thing before the meta line, so the line may stand at the end of the player's
// own meta line, which keeps the blank for it there.
const voiced = computed<boolean>(() => (props.item.attachments ?? []).some(heard));
const playerLast = computed<boolean>(() => {
  const last = (props.item.attachments ?? []).at(-1);

  return props.item.run === null && last !== undefined && heard(last) && reactions.value.length === 0;
});

// The times a row shows, read once per message rather than on every redraw: choosing redraws every
// row as it opens and closes, and reading a time in the owner's zone is among the costliest parts of a row's drawing.
const clock = computed<string>(() => clockUnder(props.item.sentAt, props.day));
const stamp = computed<string>(() => formatStamp(props.item.sentAt));

// How the row's message moves as choosing opens and closes its column: a system line and the
// owner's own messages stand still, everything on the leading side takes the slide its run's photo
// takes, so the two move as one.
const slide = computed<string>(() => {
  if (props.item.notice || props.item.look.side === "right") {
    return "";
  }

  return asideSlide(props.selecting);
});

// Whether a finger held on this row's words selects them: only in a message already chosen.
const textChoosable = computed<boolean>(() => props.selecting && props.selected);

// Who may select the letters. A mouse may, except while choosing, when a press is the choosing; a
// finger may only in a chosen message, and its hold never brings up the browser's link menu
// elsewhere.
const letters = computed<string>(() => {
  if (!props.selecting) {
    return "pointer-coarse:select-none pointer-coarse:[-webkit-touch-callout:none]";
  }

  return textChoosable.value ? "select-none pointer-coarse:select-text" : "select-none [-webkit-touch-callout:none]";
});

const { t } = useI18n();

// The bubble's ground and corners, and whether it carries the tail. A turn still running stands
// its words where the answer's will stand but on no ground and with no tail, and its answer's ground
// grows round them as it takes the place (docs/web.md, the room screen's section on what is being done now).
const bubbleClass = computed<string>(() => (message.value ? bubbleLook(props.item.look, props.place) : ""));
const tailed = computed<boolean>(() => message.value && props.item.look.variant === "soft" && props.place.last);

const attachments = computed<MessageAttachment[]>(() => props.item.attachments ?? []);

// Whether the bubble names its sender: the head of a run of someone else's, since the right side is
// the reader's own and needs no name.
const named = computed<boolean>(() => props.place.first && props.item.look.side === "left" && props.item.look.variant === "soft");

// What stands at the bubble's head, over a picture or the words: the name, the quote, and where a forwarded message
// came from.
const head = computed<boolean>(
  () => named.value || (props.item.run === null && props.item.quote !== null) || (props.item.run === null && props.item.forwarded !== undefined)
);

// Where the choosing mark's cell starts and the type its one line is measured in: the row's first
// line (docs/web.md, the section on choosing and copying). A system line starts the row; a bubble's first line starts
// under its inner room, the quote's own a step further in its box; a bubble that opens on no line
// keeps the words' line.
const markLine = computed<string>(() => {
  if (props.item.notice) {
    return "top-0 text-sm";
  }

  if (named.value) {
    return "top-(--chat-pad-y) text-sm leading-(--chat-meta-line)";
  }

  if (head.value) {
    return "top-[calc(var(--chat-pad-y)+var(--spacing))] text-sm";
  }

  return "top-(--chat-pad-y)";
});

// Whether the row is a sticker alone, standing as Telegram stands it: no bubble, name line or tail.
const sticker = computed<boolean>(() => props.item.look.variant === "naked");

// Whether the bubble holds a picture or an album, which runs to its edges. An album's mosaic fills a
// picture's width; one picture stands at its own width, the bubble as wide as the picture and no wider.
const albumed = computed<boolean>(() => (props.item.album ?? []).length > 1);
const pictured = computed<boolean>(() => albumed.value || props.item.imageUrl !== null);

// A picture with nothing under it carries the meta line over its own foot.
const overPicture = computed<boolean>(
  () => pictured.value && props.item.run === null && !worded.value && attachments.value.length === 0 && links.value.length === 0
);

// The words and the meta line under a head or a picture: in the bubble's inner room, a small step
// under a head and the full room under a picture or at the top. A bubble-less row keeps no room and
// stands its meta line beside the sticker's foot, and a meta line over a picture is laid over it rather
// than under it. A bubble holding a sound player stands its parts in one column, so it asks for the
// width of its widest part, the player's or the words', rather than for all of them side by side.
const bodyLook = computed<string>(() => {
  if (overPicture.value) {
    return "contents";
  }

  const flow = voiced.value ? "relative flex flex-col gap-y-(--chat-meta-gap)" : "relative flex flex-wrap items-end gap-x-2 gap-y-(--chat-meta-gap)";

  if (sticker.value) {
    return "relative flex flex-wrap items-end gap-x-1 gap-y-(--chat-meta-gap)";
  }

  return `${flow} px-(--chat-pad-x) pb-(--chat-pad-y) ${head.value && !pictured.value ? "pt-(--chat-meta-gap)" : "pt-(--chat-pad-y)"}`;
});

// A bubble of words is held to the widest line they and its meta line stand on, so wrapping leaves no
// blank at its trailing side (docs/web.md, 「A bubble is as wide as its widest line」). It is fitted in
// the update that puts in what it holds, so a sent bubble's flight copies it at its fitted width, and
// again whenever the room round it or what it holds changes size.
const bubble = useTemplateRef<HTMLElement>("bubble");
const fitted = computed<boolean>(() => message.value && !pictured.value && wordsLast.value);
let fitting: ReturnType<typeof keepFitted> | null = null;

onMounted(() => {
  if (bubble.value !== null) {
    fitting = keepFitted(bubble.value, () => fitted.value);
    fitting.fit();
  }
});

onBeforeUnmount(() => fitting?.stop());

watch([fitted, metaRoom, () => props.item, clock], () => fitting?.fit(), { flush: "post" });


const mark = computed<SendMark | null>(() => sendMark(props.item));

// Every message carries its own time and sent mark, wherever it stands in its run (docs/web.md, the room screen's meta line section):
// a line that lands right after another of the same sender is still read for when it came.
const markShown = computed<boolean>(() => mark.value !== null);
const markIcon = computed<string>(() => (mark.value === "sent" ? "i-material-symbols-check" : "i-material-symbols-schedule-outline"));
const MARK_WORDS: Record<Exclude<SendMark, "failed">, string> = {
  sending: "room.status.sending",
  waiting: "room.status.waiting",
  checking: "room.status.checking",
  sent: "room.status.sent"
};
const markWord = computed<string>(() => t(mark.value === null || mark.value === "failed" ? "room.status.sending" : MARK_WORDS[mark.value]));

// A failed message is pressed for why it did not go, and sent again or dropped from there.
const failedItems = computed<DropdownMenuItem[][]>(() => [
  [{ type: "label", label: props.item.pending?.reason ?? t("common.error.not_sent") }],
  [
    { label: t("room.action.resend"), icon: "i-material-symbols-undo", onSelect: () => emit("retry", props.item.key) },
    { label: t("common.action.delete"), icon: "i-material-symbols-delete-outline", onSelect: () => emit("discard", props.item.key) }
  ]
]);

// A message that waits for a bot to take it, or is being checked, waits however long that takes, and is
// pressed for what it waits on and deleted from there where the owner no longer wants it.
const heldItems = computed<DropdownMenuItem[][]>(() => [
  [{ type: "label", label: markWord.value }],
  [{ label: t("common.action.delete"), icon: "i-material-symbols-delete-outline", onSelect: () => emit("discard", props.item.key) }]
]);

// Whether a kept file stands as its player: a video or a sound, received, of a type the browser
// plays. Anything else is its file line alone.
function playable(attachment: MessageAttachment): boolean {
  return (attachment.kind === "video" || attachment.kind === "audio") && attachment.available && attachment.type?.startsWith(`${attachment.kind}/`) === true;
}

// Whether a kept file stands as the sound player, which is its file line as well.
function heard(attachment: MessageAttachment): boolean {
  return attachment.kind === "audio" && playable(attachment);
}

// What the record heard in a voice note: the words, how long the recording ran in seconds, and whether it could be
// heard at all (the receiver's `docs/messages.md`). All nothing on a sound that is not a voice note.
const transcript = computed<string | null>(() => ((props.item.transcript ?? "").trim() === "" ? null : props.item.transcript!));
const voiceSeconds = computed<number | null>(() => props.item.voiceSeconds ?? null);
const voiceFailed = computed<boolean>(() => props.item.voiceState === "failed");

const emit = defineEmits<{
  // What the menu on this message offers, and what a plain tap does while choosing.
  select: [key: string];
  pick: [key: string, range: boolean];
  reply: [key: string];
  copy: [key: string];
  copyBody: [key: string];
  copyRef: [key: string];
  // A quote pressed: the message it names is wanted in view.
  jump: [messageId: number];
  // Where the keyboard is in the feed, and where it is asked to go next.
  focused: [key: string];
  move: [key: string, delta: number];
  // A message that failed to go: sent once more as it stands, or given up on.
  retry: [key: string];
  discard: [key: string];
  // The owner's forward of the message into another room.
  forward: [key: string];
  // The reader's own acts on the message: a reaction by its emoji, a pin set or taken off, an edit of their own
  // message, and a delete of it.
  react: [key: string, emoji: string];
  pin: [key: string, on: boolean];
  edit: [key: string];
  remove: [key: string];
}>();

// Where a menu opened from the keyboard stands: just inside the row it belongs to.
const MENU_INSET_PX = 16;

// A message on its way is not one of the room's own yet — there is nothing to copy and
// nothing to choose — and while choosing, the tap on a row is the choosing itself. A row standing
// for a running turn holds no message at all, so it offers nothing either.
const menuOff = computed<boolean>(() => !message.value || props.selecting || props.item.pending !== null);

// A menu holds the keyboard while it is open and gives it back to the row it was opened on as it
// closes, which is right for everything it offers but reply: that one hands the keyboard to the box
// the answer is typed in. So the reply is started once the menu has let go, in place of the
// hand-back.
let replying = false;

const menuContent = {
  onCloseAutoFocus: (event: Event) => {
    if (replying) {
      replying = false;
      event.preventDefault();
      emit("reply", props.item.key);
    }
  }
};

// Whether the message is one of the reader's own: the side the room stands it on, which is the senders the signed-in
// person acts under (docs/web.md, 「Which messages stand on the right」).
const mine = computed<boolean>(() => props.item.look.side === "right");

const menuItems = computed<ContextMenuItem[][]>(() =>
  messageMenu(
    t,
    {
      text: props.item.text,
      deleted: props.item.deleted === true,
      mine: mine.value,
      administrator: props.administrator,
      writable: props.writable,
      pinned: props.item.pinnedAt != null,
      reaction: mineReaction(props.item)
    },
    {
      reply: () => {
        replying = true;
      },
      forward: () => emit("forward", props.item.key),
      react: (emoji: string) => emit("react", props.item.key, emoji),
      pin: (on: boolean) => emit("pin", props.item.key, on),
      edit: () => emit("edit", props.item.key),
      remove: () => emit("remove", props.item.key),
      copy: () => emit("copy", props.item.key),
      copyBody: () => emit("copyBody", props.item.key),
      copyRef: () => emit("copyRef", props.item.key),
      select: () => emit("select", props.item.key)
    }
  )
);

// The emojis at the menu's head, the reader's own marked; each pressed reacts as the menu's act does.
const strip = computed(() => reactionStrip(mineReaction(props.item), (emoji) => emit("react", props.item.key, emoji)));

// Whether the press now under way came from a finger, and whether the click it ends in was already
// spent opening the menu.
let touched = false;
let held = false;

// Every way in ends here: the menu is the trigger's own and opens where the right button
// would have opened it, so a tap, a modifier click and the keyboard say the same thing to it as
// a right click does.
function openMenu(element: HTMLElement, at: { x: number; y: number }): void {
  element.dispatchEvent(
    new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y })
  );
}

// What a press on the row leaves to itself: a link, a button, a picture, a card.
function onControl(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("button, a, [role='button']") !== null;
}

function onPointerDown(event: PointerEvent): void {
  // Cleared first: a menu opened by the right button or the keyboard leaves this standing
  // with no click of its own to spend it, and the next press must not be the one that pays.
  held = false;
  touched = event.pointerType === "touch";

  // A finger held on a row chooses it, which the feed does; the menu's own hold is kept from
  // opening the menu as well. A chosen message's words are left to the browser's own hold.
  if (touched && !textChoosable.value) {
    event.preventDefault();
  }
}

// The trigger opens the menu itself and keeps the browser's own menu away with it. A finger held
// on a row is choosing, not asking for the menu, so the browser's hold is turned away too — except
// on the words of a chosen message, where the hold is the browser's selection and copy.
function onContextMenu(event: MouseEvent): void {
  if (event.isTrusted && touched) {
    if (!textChoosable.value) {
      event.preventDefault();
    }

    event.stopPropagation();

    return;
  }

  // A right press is held to the message itself; the menu a tap or the keyboard opens arrives here
  // already decided, sent to the row by openMenu.
  if (menuOff.value || (event.isTrusted && !onMessageItself(event.target))) {
    event.preventDefault();

    return;
  }

  held = true;
}

// The menu answers a press on the message itself — its bubble, a picture standing with no bubble,
// or the line a notice stands as — and never the empty row beside it (docs/web.md, the room screen's message menu section).
function onMessageItself(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("[data-bubble], [data-notice]") !== null;
}

// Enter on the row itself — not on a button inside it — is the keyboard's way in: the menu
// where there is one, and the pick while choosing.
function onEnter(event: KeyboardEvent): void {
  const row = event.currentTarget as HTMLElement;

  if (event.target !== row) {
    return;
  }

  event.preventDefault();

  if (props.selecting) {
    if (message.value && props.item.pending === null) {
      emit("pick", props.item.key, event.shiftKey);
    }

    return;
  }

  if (menuOff.value) {
    return;
  }

  const box = row.getBoundingClientRect();

  openMenu(row, { x: box.left + MENU_INSET_PX, y: box.top + MENU_INSET_PX });
}

// The rows are a list to walk with the arrows: the feed decides which one is next and puts
// the keyboard on it.
function onMove(event: KeyboardEvent, delta: number): void {
  if (event.target !== event.currentTarget) {
    return;
  }

  event.preventDefault();
  emit("move", props.item.key, delta);
}

function onClick(event: MouseEvent): void {
  // The click that ends a press is the press's own; it must not count as a tap as well.
  if (held) {
    held = false;
    event.preventDefault();
    event.stopPropagation();

    return;
  }

  if (props.selecting) {
    if (message.value && props.item.pending === null) {
      emit("pick", props.item.key, event.shiftKey);
    }

    return;
  }

  // A finger's tap on a control here takes the focus off the input box, which the press turned
  // away from the browser could not.
  if (touched && onControl(event.target)) {
    releaseFocusOutside(event.currentTarget as HTMLElement);

    return;
  }

  // Any other tap is a finger's way into the menu, on the message itself.
  if (touched && !menuOff.value && onMessageItself(event.target)) {
    event.preventDefault();
    openMenu(event.currentTarget as HTMLElement, { x: event.clientX, y: event.clientY });

    return;
  }

  // A mac sends a context menu of its own for this and has opened the menu already; nowhere
  // else does, so the same click opens it here.
  if (
    !menuOff.value &&
    (event.ctrlKey || event.metaKey) &&
    !(event.target as HTMLElement).closest("button, a")
  ) {
    event.preventDefault();
    openMenu(event.currentTarget as HTMLElement, { x: event.clientX, y: event.clientY });
  }
}
</script>

<style>
/* The blank the words keep for a meta line standing at the end of their last line (docs/web.md,
   the room screen's meta line section), as wide as the line and the step before it. Where the words end in a line of text — a
   paragraph or a heading — the blank closes that line: it stays on it where
   the line has room, and the meta line laid over it reads as the line's end; where it has none, the
   blank goes to a line of its own and the meta line stands there. The blank floats at the line's end
   rather than standing in it, since the browser offers no break between a letter and a box laid in
   the line after it, and such a box takes the line's last letter, or its last word, down with it.
   Words ending in any other block — a list, a code block, a table, a quote — keep a line of the meta
   line's height under them instead. These read words another part draws, so they are not held to
   this part's own elements. */
[data-meta-room] > [data-words] > :last-child:not(.markdown)::after,
[data-meta-room] > [data-words] > .markdown:last-child > :is(p, h1, h2, h3, h4, h5, h6):last-child::after {
  content: "";
  float: inline-end;
  width: calc(var(--chat-meta-room) + var(--spacing) * 2);
  height: 1lh;
}

[data-meta-room]
  > [data-words]:not(
    :has(
      > :last-child:not(.markdown),
      > .markdown:last-child > :is(p, h1, h2, h3, h4, h5, h6):last-child
    )
  )::after {
  content: "";
  display: block;
  height: calc(var(--chat-meta-gap) + var(--chat-meta-line));
}
</style>

<style scoped>
/* A message arriving at the end of the room rises a short way into its place, up the same axis the
   conversation glides along, and never fades: an item of a list does not (docs/web.md, 「Motion」).
   The shared length and easing are the page's own motion tokens, and a reader who asked for less
   movement sees it stand at once. */
.bubble-rise {
  animation: bubble-rise var(--bmo-motion-pop) var(--bmo-ease-enter) both;
}

@keyframes bubble-rise {
  from {
    transform: translateY(0.75rem);
  }
}

@media (prefers-reduced-motion: reduce) {
  .bubble-rise {
    animation: none;
  }
}
</style>
