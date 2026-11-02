<template>
  <!-- A photo in a message, drawn small and whole at its own ratio, never taller than its cap nor
       wider than the bubble may be; pressing it opens it whole in the viewer. A tile of an album
       fills its square of the grid instead, so the album reads as one block. In a message's bubble
       the picture runs to the bubble's edges with no corners or edge of its own, cut by the bubble's
       own corners. In a room, the viewer is the room's own and walks every picture the room
       holds; a picture with no archived message behind it, or shown outside a room, opens alone. -->
  <button type="button" class="block max-w-full cursor-zoom-in transition-opacity hover:opacity-85 active:opacity-70" :class="props.flush ? 'size-full' : 'rounded-lg'" :style="frame" :aria-label="$t('common.aria.enlarge_named', { name: props.title })" @click.stop="enlarge">
    <LoadingImage
      :src="props.src"
      :alt="props.title"
      :fill="props.flush"
      :shape="props.flush && !props.tile ? shape : null"
      :image-class="imageClass"
      :stand-in="standing"
      @loaded="remember"
    />
  </button>

  <ImageViewer v-if="pictures === null || props.messageId === undefined" v-model:open="open" :src="props.src" :title="props.title" />
</template>

<script setup lang="ts">
import { ROOM_PICTURES } from "~/domain/gallery";
import { messagePicture, releaseStandIn, rememberShape, shapeOf, standInOf } from "~/domain/picture-shapes";

import type { PictureShape } from "~/domain/picture-shapes";

interface Props {
  src: string;
  title: string;
  // The archived message the picture went out as.
  messageId?: number;
  tile?: boolean;
  // Whether the picture runs to the edges of the bubble it stands in.
  flush?: boolean;
}

const props = defineProps<Props>();

// The picture keeps the room its shape asks for before it has loaded, where the console has seen it
// — the owner's own preview of it, or the picture itself on an earlier drawing.
const shape = computed<PictureShape | null>(() => shapeOf(props.src, props.messageId === undefined ? null : messagePicture(props.messageId)));

// A picture just sent stands as the preview it was sent from until its archived copy has loaded,
// which then lets the preview go.
const standing = computed<string | null>(() => (props.messageId === undefined ? null : standInOf(messagePicture(props.messageId))));

function remember(seen: PictureShape): void {
  rememberShape(props.src, seen);

  if (props.messageId !== undefined) {
    rememberShape(messagePicture(props.messageId), seen);
    releaseStandIn(messagePicture(props.messageId));
  }
}

// The room a lone picture in a bubble takes: its own ratio, no taller than the cap and no wider than a
// bubble may be, scaled to whichever bounds it first. Known from the picture's shape before it has loaded,
// so the bubble stands at the picture's size from the start; unknown, the picture sizes itself as it loads.
const PICTURE_CAP_PX = 256;
const BUBBLE_WIDEST_PX = 320;

const frame = computed<{ width: string; height: string } | undefined>(() => {
  if (!props.flush || props.tile || shape.value === null || shape.value.width <= 0 || shape.value.height <= 0) {
    return undefined;
  }

  const ratio = shape.value.width / shape.value.height;
  let height = Math.min(PICTURE_CAP_PX, shape.value.height);
  let width = height * ratio;

  if (width > BUBBLE_WIDEST_PX) {
    width = BUBBLE_WIDEST_PX;
    height = width / ratio;
  }

  return { width: `${Math.round(width)}px`, height: `${Math.round(height)}px` };
});

const imageClass = computed<string>(() => {
  if (props.flush) {
    return props.tile ? "size-full object-cover" : frame.value === undefined ? "max-h-64 w-auto max-w-80 object-contain" : "size-full object-contain";
  }

  return props.tile ? "aspect-square w-full rounded-lg border border-default object-cover" : "max-h-64 w-auto max-w-full rounded-lg border border-default";
});

const pictures = inject(ROOM_PICTURES, null);
const open = ref(false);

function enlarge(): void {
  if (pictures !== null && props.messageId !== undefined) {
    pictures.open(props.messageId, props.title);
  } else {
    open.value = true;
  }
}
</script>
