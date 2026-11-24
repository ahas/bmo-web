<template>
  <!-- The band over a room's input bar, and the room's typing picture floating in it while somebody writes
       (docs/web.md, 「Presence and typing」, the room's typing picture). The band takes the picture's room only while the
       picture stands, its fade out included, and tells the room so through `standing`; the conversation's end stands
       above it, so the picture covers neither the box nor the newest line; it is a bar at the screen's foot to what
       floats over the page area, which stands above it. The band itself takes no press, so what lies under its empty
       part is pressed as it would be. -->
  <div data-typing-band data-screen-foot class="pointer-events-none">
    <UContainer class="flex h-full items-center">
      <!-- What a screen reader hears, standing whether or not anybody writes, so each change is announced. -->
      <p role="status" class="sr-only" data-typing-said>{{ said ?? "" }}</p>

      <!-- The writers' faces as one series, then the typing words; every writer named in the tooltip and the picture's
           name. It fades in and out, having no press behind it, and stands and goes at once for a reader who asked for
           less motion. It keeps the writers it showed while it fades out, and a mark handed again while it fades, as a
           stream that opens again hands what stands, turns the fade back rather than standing a second picture. -->
      <Transition
        enter-active-class="transition-opacity duration-(--bmo-motion-quick) ease-(--bmo-ease-enter) motion-reduce:transition-none"
        leave-active-class="transition-opacity duration-(--bmo-motion-quick) ease-(--bmo-ease-exit) motion-reduce:transition-none"
        enter-from-class="opacity-0"
        leave-to-class="opacity-0"
        @after-leave="emit('standing', false)"
      >
        <!-- The faces stand 4px inside its rounded ends, so their curves are concentric with the picture's. -->
        <PipFrame v-show="writing" data-typing-picture role="img" :aria-label="shownSaid" class="pointer-events-auto relative h-7 ps-1 pe-3">
          <!-- What the picture holds stands in a box held to its size, so the surface follows a face unfolding
               frame by frame and moves at the unfold token when the words or the cap change at once. -->
          <UnfoldingBox data-typing-box>
            <HintTip :text="shownSaid" class="flex min-w-0 items-center gap-2" aria-hidden="true" data-typing-tip>
              <!-- The layer's group: faces moving by place alone, each ringed in the picture's own ground, and the
                   cap with the count of the rest in the count's separators and tabular figures. -->
              <AvatarGroup :faces="faces" :max="TYPING_FACES_MOST" size="2xs" :ui="{ ground: 'bg-neutral-950' }" data-typing-faces />
              <span class="shrink-0 text-sm text-highlighted">{{ $t("room.label.typing") }}</span>
            </HintTip>
          </UnfoldingBox>
        </PipFrame>
      </Transition>
    </UContainer>
  </div>
</template>

<script setup lang="ts">
import { useSignedUser } from "~/domain/access";
import { useAvatars } from "~/domain/avatars";
import { TYPING_FACES_MOST, typingPeople, typingWords, typistsOf, useTyping, whoKey, writerMember } from "~/domain/presence";

import type { AvatarFace } from "bmo-ui/app/domain/avatar-group";
import type { Typist } from "~/domain/presence";
import type { PresenceWho, RoomMember, RoomMembersView } from "#shared/types";

const props = defineProps<{ chatId: number }>();
// Whether the picture stands, from the moment a writer is drawn until its fade out has ended.
const emit = defineEmits<{ standing: [standing: boolean] }>();

const { t } = useI18n();
const typing = useTyping();
const me = useSignedUser();
const avatars = useAvatars();

const writers = computed<PresenceWho[]>(() => typingPeople(typing.value.get(props.chatId), me.value));

// The names and faces are the room's members' (docs/web.md, the room screen's people), read when a mark first
// stands here and read again when a mark stands for somebody the read does not hold. Each writer is asked after once,
// and stands in the picture once that read has ended, so nobody is drawn unnamed while their name is on its way; a
// read that fails leaves them unnamed.
const members = ref<readonly RoomMember[]>([]);
const asked = new Set<string>();
const awaited = ref<ReadonlySet<string>>(new Set());
let reading = false;
let room = props.chatId;

function readMembers(): void {
  if (reading) return;

  const missing = writers.value.filter((who) => writerMember(who, members.value) === null && !asked.has(whoKey(who)));

  if (missing.length === 0) return;

  for (const who of missing) asked.add(whoKey(who));

  const readFor = props.chatId;

  reading = true;
  awaited.value = new Set(missing.map(whoKey));
  $fetch<RoomMembersView>(`/api/rooms/${readFor}/members`)
    .then((view) => {
      if (readFor === room) members.value = view.members;
    })
    .catch(() => undefined)
    .finally(() => {
      if (readFor !== room) return;

      reading = false;
      awaited.value = new Set();
      readMembers();
    });
}

watch(
  () => props.chatId,
  (next) => {
    room = next;
    members.value = [];
    asked.clear();
    awaited.value = new Set();
    reading = false;
  }
);

watch(writers, readMembers, { immediate: true });

const named = computed<PresenceWho[]>(() => writers.value.filter((who) => !awaited.value.has(whoKey(who))));
const typists = computed<Typist[]>(() => typistsOf(named.value, members.value, avatars.value));
const said = computed<string | null>(() => typingWords(t, typists.value));
const writing = computed<boolean>(() => typists.value.length > 0);

watch(
  writing,
  (now) => {
    if (now) emit("standing", true);
  },
  { immediate: true }
);

// What the picture draws: the writers now, and while it fades out the last writers it showed.
// It is held whole rather than made deeply reactive, since each writer is replaced, never changed in place.
const shown = shallowRef<readonly Typist[]>([]);

watch(
  typists,
  (now) => {
    if (now.length > 0) shown.value = now;
  },
  { immediate: true }
);

const shownSaid = computed<string>(() => typingWords(t, shown.value) ?? "");
const faces = computed<readonly AvatarFace[]>(() => shown.value.map((typist) => ({ id: typist.key, avatar: typist.face })));
</script>
