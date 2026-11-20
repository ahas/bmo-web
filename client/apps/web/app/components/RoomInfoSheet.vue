<template>
  <!-- The room information the room's name opens (docs/web.md, the room screen's room information): its head the room's
       picture and name, and under it one row of tabs over what the room is and what it holds. A side sheet on a wide
       screen and a drawer from the bottom on a narrow one, at one height whichever tab stands. A tab reads what it
       shows the first time it is shown in an opening and keeps it while the view stays open. A drawer dragged away
       slides off before any refusal could hold it, so while a change waits it holds itself, standing still under a
       drag, and hands each refused close to the guard, which asks; the sheet stays where the guard refuses, and is
       left to dismiss itself. -->
  <component
    :is="narrow ? UDrawer : USlideover"
    :open="open"
    :title="props.title"
    :description="$t('room_info.title.sheet')"
    :ui="narrow ? DRAWER_UI : SHEET_UI"
    :dismissible="narrow ? guard.dismissible.value : true"
    data-room-info
    @update:open="(standing: boolean) => (standing ? (open = true) : void guard.leave())"
    @close:prevent="void guard.leave()"
  >
    <template #title>
      <span class="flex min-w-0 items-center gap-3">
        <button
          v-if="props.avatar.src"
          type="button"
          class="flex shrink-0 cursor-zoom-in rounded-full transition-shadow hover:ring-2 hover:ring-primary/40 active:ring-2 active:ring-primary/60"
          :aria-label="$t('room.aria.avatar_enlarge', { name: props.title })"
          data-room-info-picture
          @click="emit('enlarge')"
        >
          <UAvatar v-bind="props.avatar" size="md" />
        </button>
        <UAvatar v-else v-bind="props.avatar" size="md" />
        <span class="min-w-0 truncate">{{ props.title }}</span>
      </span>
    </template>

    <template #actions>
      <IconButton
        v-if="props.manages"
        icon="i-material-symbols-add-photo-alternate-outline"
        :label="$t('room_info.action.picture')"
        data-room-info-set-picture
        @click="pictureOpen = true"
      />
    </template>

    <template #close="{ ui }">
      <!-- Pressed, it reaches the guard through the sheet's own close alone, so it asks only once. -->
      <ShellClose :class="ui.close()" />
    </template>

    <template #body>
      <UTabs
        v-model="tab"
        :items="tabs"
        :content="false"
        color="neutral"
        variant="link"
        size="sm"
        :class="['h-10 shrink-0 px-2', TAB_ROW_LINE]"
        :ui="TAB_ROW_UI"
        :aria-label="$t('room_info.aria.tabs')"
        data-room-info-tabs
      />
      <div class="min-h-0 flex-1 overflow-y-auto p-4" data-room-info-body>
        <RoomMembersPanel
          v-if="shown.has('members')"
          v-show="tab === 'members'"
          :chat-id="props.chatId"
          :title="props.title"
          :avatars="props.avatars"
          :administrator="props.administrator"
          @left="emit('left')"
        />
        <template v-for="holding in ROOM_HOLDINGS" :key="holding">
          <RoomHoldingPanel v-if="shown.has(holding)" v-show="tab === holding" :chat-id="props.chatId" :holding="holding" @show="(messageId) => void showInMessage(messageId)" />
        </template>
        <RoomSituationPanel v-if="shown.has('situation')" v-show="tab === 'situation'" :chat-id="props.chatId" />
        <RoomCallersPanel v-if="shown.has('callers')" v-show="tab === 'callers'" v-model:holding="callersHolding" :chat-id="props.chatId" :read-only="props.readOnly" />
        <RoomSessionPanel v-if="props.administrator && shown.has('session')" v-show="tab === 'session'" :chat-id="props.chatId" />
        <RoomProvidersPanel v-if="props.manages && shown.has('providers')" v-show="tab === 'providers'" :chat-id="props.chatId" />
        <RoomTonePanel v-if="props.manages && shown.has('tone')" v-show="tab === 'tone'" :chat-id="props.chatId" />
      </div>
    </template>
  </component>

  <PictureDialog
    v-if="props.manages"
    v-model:open="pictureOpen"
    :title="$t('picture.label.room')"
    :description="props.title"
    kind="room"
    :subject="props.chatId"
    :avatar="props.avatar"
  />
</template>

<script setup lang="ts">
import { useCloseGuard } from "bmo-ui/app/domain/form-save";
import { useNarrow } from "bmo-ui/app/domain/screen";
import { TAB_ROW_LINE, TAB_ROW_UI } from "bmo-ui/app/domain/tabs";

import { UDrawer, USlideover } from "#components";
import { ROOM_HOLDINGS } from "#shared/types";

import type { AvatarIndex } from "~/domain/avatars";
import type { RoomInfoTab } from "~/domain/room-info";
import type { AvatarProps, TabsItem } from "@nuxt/ui";
import type { ExactMessageId } from "#shared/types";

interface Props {
  chatId: number;
  // The room's name as its screen shows it.
  title: string;
  avatar: AvatarProps;
  avatars: AvatarIndex;
  // Whether the reader is the administrator, who reads the room's figures.
  administrator: boolean;
  // Whether the reader is the administrator in a room he may change, who sets its picture, its chat services and its
  // tone layer.
  manages: boolean;
  // Whether the room is one the reader may not change at all (docs/web.md, 「Access」).
  readOnly: boolean;
}

// The sheet as wide as its whole row of tabs, and the drawer at one height whichever tab stands; the tabs stand
// against the head and only what is under them scrolls. The head keeps the body's 16px at every width, and the
// drawer's own padding is taken off its container so the row of tabs and its line run to the drawer's edges.
const SHEET_UI = { content: "sm:max-w-3xl", header: "sm:px-4", description: "sr-only", body: "flex min-h-0 flex-col overflow-hidden p-0 sm:p-0" };
const DRAWER_UI = {
  content: "h-[85dvh]",
  container: "gap-0 overflow-hidden p-0",
  header: "p-4",
  description: "sr-only",
  body: "flex min-h-0 flex-col overflow-hidden p-0"
};

const TAB_LABELS: Record<RoomInfoTab, string> = {
  members: "room_info.label.members",
  media: "room_info.label.media",
  file: "room_info.label.files",
  link: "room_info.label.links",
  music: "room_info.label.music",
  voice: "room_info.label.voice",
  situation: "room_info.label.situation",
  callers: "room_info.label.callers",
  session: "room_info.label.session",
  providers: "room_info.label.providers",
  tone: "room_info.label.tone"
};

const props = defineProps<Props>();
const open = defineModel<boolean>("open", { required: true });
// The tab standing, which the room's screen keeps while it stands, so the view opens on the tab it last showed.
const tab = defineModel<RoomInfoTab>("tab", { required: true });
const emit = defineEmits<{ enlarge: []; left: []; show: [messageId: ExactMessageId] }>();

const { t } = useI18n();
const narrow = useNarrow();

const tabs = computed<TabsItem[]>(() =>
  [
    "members" as const,
    ...ROOM_HOLDINGS,
    "situation" as const,
    "callers" as const,
    ...(props.administrator ? ["session" as const] : []),
    ...(props.manages ? ["providers" as const, "tone" as const] : [])
  ].map((value) => ({ value, label: t(TAB_LABELS[value]) }))
);

// The tabs shown since the view opened, each keeping what it read while the view stands.
const shown = ref(new Set<RoomInfoTab>());

watch([open, tab], ([standing, standingTab], before) => {
  if (!standing) return;

  const opening = before?.[0] !== true;

  shown.value = new Set(opening ? [standingTab] : [...shown.value, standingTab]);
}, { immediate: true });

// A tab the reader no longer may see — a room that turned read-only, say — gives way to the first.
watch(tabs, (items) => {
  if (!items.some((item) => item.value === tab.value)) tab.value = "members";
});

const pictureOpen = ref(false);

// A person picked in the callers tab and not added waits there, and closing the view asks first (docs/web.md,
// 「Forms」).
const callersHolding = ref(false);
const guard = useCloseGuard(open, () => callersHolding.value, t);

watch(open, (standing) => {
  if (standing) callersHolding.value = false;
});

// A line's show-in-message is a way out like any other: it closes the view through the guard, and the room brings the
// message into view only once the view has gone.
async function showInMessage(messageId: ExactMessageId): Promise<void> {
  await guard.leave();
  if (!open.value) emit("show", messageId);
}
</script>
