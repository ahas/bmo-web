<template>
  <!-- A photo in a message, drawn small and whole at its own ratio, never taller than its cap nor
       wider than the bubble may be; pressing it opens it whole in the viewer. In a bubble wider than
       the picture it stands in the middle, over the picture itself enlarged and blurred, which fills
       the room on either side. A tile of an album
       fills its square of the grid instead, so the album reads as one block. In a message's bubble
       the picture runs to the bubble's edges with no corners or edge of its own, cut by the bubble's
       own corners. In a room, the viewer is the room's own and walks every picture the room
       holds; a picture with no archived message behind it, or shown outside a room, opens alone. -->
  <button type="button" class="block max-w-full cursor-zoom-in transition-opacity hover:opacity-85 active:opacity-70" :class="props.flush ? (backed ? 'relative w-full overflow-hidden' : 'size-full') : 'rounded-lg'" :style="frame" :aria-label="$t('common.aria.enlarge_named', { name: props.title })" @click.stop="enlarge">
    <span v-if="backed" aria-hidden="true" data-picture-backdrop class="pointer-events-none absolute inset-0 scale-125 bg-cover bg-center blur-xl" :style="{ backgroundImage: backdrop }" />
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
import { messagePicture, pictureWidth, releaseStandIn, rememberShape, shapeOf, standInOf } from "~/domain/picture-shapes";

import type { ExactMessageId } from "#shared/types";
import type { PictureShape } from "~/domain/picture-shapes";

interface Props {
  src: string;
  title: string;
  // The archived message the picture went out as.
  messageId?: ExactMessageId;
  tile?: boolean;
  // Whether the picture runs to the edges of the bubble it stands in.
  flush?: boolean;
  // The shape the console's server read the picture to have, where it read one.
  known?: PictureShape | null;
}

const props = defineProps<Props>();

// The picture keeps the room its shape asks for before it has loaded, where the console has seen it — the owner's own
// preview of it, or the picture itself on an earlier drawing — or where the server read its shape with the page.
const shape = computed<PictureShape | null>(() => shapeOf(props.src, props.messageId === undefined ? null : messagePicture(props.messageId)) ?? props.known ?? null);

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

// A lone picture in a bubble stands over its own blurred copy, which shows wherever the bubble is wider than
// the picture.
const backed = computed<boolean>(() => props.flush === true && props.tile !== true);
// The copy is the picture as a background, so the bubble holds one image element, the picture itself.
const backdrop = computed<string>(() => `url(${JSON.stringify(props.src)})`);

// The picture's width stands on the image element itself, which a narrower bubble shrinks at its ratio without the
// bubble's width having to be known first. So the bubble asks its row for the picture's width and no more, the row is
// never wider than the bubble it holds, and where the room is narrower the picture fits it whole.
const frame = computed<{ "--picture-width": string } | undefined>(() => {
  if (!props.flush || props.tile || shape.value === null || shape.value.width <= 0 || shape.value.height <= 0) {
    return undefined;
  }

  return { "--picture-width": `${pictureWidth(shape.value)}px` };
});

const imageClass = computed<string>(() => {
  if (props.flush) {
    if (props.tile) {
      return "size-full object-cover";
    }

    // The button is as wide as the bubble, and the picture stands in its middle at its own width.
    return frame.value === undefined ? "mx-auto max-h-128 w-auto max-w-80 object-contain" : "mx-auto block h-auto w-(--picture-width) max-w-full object-contain";
  }

  return props.tile ? "aspect-square w-full rounded-lg border border-default object-cover" : "max-h-128 w-auto max-w-full rounded-lg border border-default";
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
