<template>
  <!-- The pictures of one send as one block running to the bubble's edges (docs/web.md, the room screen's album section): rows
       that fill its width, each at the height its pictures fill it at, or one large picture with the
       rest stacked beside it, a hairline of the bubble's own ground between cells and every picture
       cut to its cell. Each opens the room's viewer on itself, which walks on to the others. -->
  <div v-if="layout.kind === 'side'" data-album class="flex h-64 gap-px">
    <div class="min-w-0 basis-0 overflow-hidden" :style="{ flexGrow: share(layout.main, layout.main + layout.column) }">
      <MessageImage v-bind="cell(0)" tile flush />
    </div>
    <div class="flex min-w-0 basis-0 flex-col gap-px" :style="{ flexGrow: share(layout.column, layout.main + layout.column) }">
      <div v-for="one in layout.rest" :key="props.pictures[one.picture]!.src" class="min-h-0 basis-0 overflow-hidden" :style="{ flexGrow: share(one.share, layout.rest.reduce((total, other) => total + other.share, 0)) }">
        <MessageImage v-bind="cell(one.picture)" tile flush />
      </div>
    </div>
  </div>

  <div v-else data-album class="flex h-64 flex-col gap-px">
    <div v-for="(row, line) in layout.rows" :key="line" class="flex min-h-0 flex-1 gap-px">
      <div
        v-for="at in row.pictures"
        :key="props.pictures[at]!.src"
        class="min-w-0 basis-0 overflow-hidden"
        :style="{ flexGrow: share(aspects[at] ?? 1, rowSum(row.pictures)) }"
      >
        <MessageImage v-bind="cell(at)" tile flush />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { albumLayout } from "~/domain/album";
import { messagePicture, shapeOf } from "~/domain/picture-shapes";

import type { AlbumLayout } from "~/domain/album";

interface Props {
  // A picture still on its way has no message yet: it opens alone rather than in the room's viewer.
  pictures: { messageId: number | null; src: string }[];
  senderName: string;
  // When the send went, as the viewer's title says it.
  stamp: string;
}

const props = defineProps<Props>();

// Each picture's width over its height, where the console has seen it.
const aspects = computed<(number | null)[]>(() =>
  props.pictures.map((picture) => {
    const shape = shapeOf(picture.src, picture.messageId === null ? null : messagePicture(picture.messageId));

    return shape === null ? null : shape.width / shape.height;
  })
);

const layout = computed<AlbumLayout>(() => albumLayout(aspects.value));

// A cell's part of its line as a share of the whole line. Flex grow below one in all hands out only that part of the
// room left over, so tall pictures, whose widths over their heights add up to less than one, would leave the line's
// end bare: each takes its share instead, and the shares fill the line.
function share(part: number, whole: number): number {
  return whole > 0 ? part / whole : 1;
}

// What a row's pictures' widths over their heights add up to.
function rowSum(pictures: readonly number[]): number {
  return pictures.reduce((total, at) => total + (aspects.value[at] ?? 1), 0);
}

// What one cell's picture is handed: where it loads from, its message and its title.
function cell(at: number): { src: string; messageId: number | undefined; title: string } {
  const picture = props.pictures[at]!;

  return { src: picture.src, messageId: picture.messageId ?? undefined, title: `${props.senderName} · ${props.stamp} · ${at + 1}/${props.pictures.length}` };
}
</script>
