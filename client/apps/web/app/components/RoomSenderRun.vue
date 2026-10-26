<template>
  <!-- One sender's run: its rows, and beside them one photo for the whole run (docs/web.md, 「One
       photo to a run」). The photo's column spans the run from its head down to the foot of its last
       bubble, and the photo holds to the foot of the visible part of the conversation inside that
       column: while the run goes on below, the photo stands a small step above the input bar's top
       edge, following it as the bar grows, and slides with the scroll; it stops at the last bubble,
       never leaving the run. The rows keep the photo's room
       themselves, so the column only draws the photo into it. -->
  <!-- A run keeps a quarter of the step round its rows, and each row a quarter round its box, so two rows of one run
       stand half a step apart and two runs a whole step (docs/web.md, 「The conversation's measures」). -->
  <div ref="root" data-run class="relative flex flex-col py-[calc(var(--chat-message-gap)/4)]">
    <slot />

    <div
      v-if="props.avatar !== undefined"
      class="pointer-events-none absolute top-0 flex w-(--chat-face) flex-col justify-end"
      :class="
        props.side === 'right'
          ? 'end-0'
          : ['start-0', asideSlide(props.selecting)]
      "
      :style="{ bottom: `${foot}px` }"
    >
      <!-- What holds to the foot of a scrolling box holds clear of the box's own foot padding, which
           is the input bar's measured height, so the photo is held its own step above the bar's top
           edge and follows it as the bar grows. The photo is the conversation's face measure across,
           which the tail's arc is drawn round. -->
      <div class="pointer-events-auto sticky bottom-(--chat-face-gap)">
        <!-- A face with a picture behind it opens that picture whole. -->
        <UTooltip v-if="props.avatar.src" :text="$t('room.aria.avatar_enlarge', { name: props.senderName })">
          <button
            type="button"
            class="flex shrink-0 cursor-zoom-in rounded-full transition-shadow hover:ring-2 hover:ring-primary/40 active:ring-2 active:ring-primary/60"
            :aria-label="$t('room.aria.avatar_enlarge', { name: props.senderName })"
            @click.stop="faceOpen = true"
          >
            <UAvatar v-bind="props.avatar" size="md" class="size-(--chat-face)" />
          </button>
        </UTooltip>
        <UAvatar v-else v-bind="props.avatar" size="md" class="size-(--chat-face)" />
      </div>
    </div>

    <ImageViewer
      v-if="props.avatar?.src"
      v-model:open="faceOpen"
      :src="props.avatar.src"
      :title="$t('room.label.avatar_of', { name: props.senderName })"
    />
  </div>
</template>

<script setup lang="ts">
import { asideSlide } from "~/domain/room";

import type { AvatarProps } from "@nuxt/ui";
import type { MessageSide } from "~/domain/room";

interface Props {
  side: MessageSide;
  senderName: string;
  avatar: AvatarProps | undefined;
  // While choosing, each row opens a column at its leading edge and slides its message aside by it;
  // a photo on that side takes the one slide its rows take, so a line moves as one piece.
  selecting: boolean;
}

const props = defineProps<Props>();

const root = useTemplateRef<HTMLElement>("root");
const faceOpen = ref(false);

// How far the run reaches below its last bubble — that row's own padding and the chip line under
// it — so the photo's foot is level with the bubble's. It is read off the run as it lays out, and
// again whenever the run changes size.
const foot = ref(0);

function measure(): void {
  const run = root.value;
  const bubbles = run?.querySelectorAll("[data-bubble]");
  const last = bubbles?.[bubbles.length - 1];

  if (run === null || run === undefined || last === undefined) {
    return;
  }

  foot.value = Math.max(0, Math.round(run.getBoundingClientRect().bottom - last.getBoundingClientRect().bottom));
}

let sized: ResizeObserver | null = null;

onMounted(() => {
  measure();
  sized = new ResizeObserver(measure);

  if (root.value !== null) {
    sized.observe(root.value);
  }
});

onBeforeUnmount(() => sized?.disconnect());
</script>
