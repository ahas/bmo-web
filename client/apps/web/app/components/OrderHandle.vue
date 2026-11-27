<template>
  <!-- The handle a row of an ordered list is carried by, standing at the row's left. The pointer catches it and
       its arrow keys move the row one place once it holds the focus, both read by the list's own carry (the
       row-drag module); its name says which row it carries, and its tooltip the keys that do it. Where a row's
       place is settled and nothing is ever carried from it — the end of a fall, a row outside the order — it
       stands no handle, only the room one would take, so the rows' labels start on one line. -->
  <span v-if="props.place === null" :class="BOX" aria-hidden="true" />
  <IconButton
    v-else
    ref="handle"
    icon="i-material-symbols-drag-indicator"
    size="xs"
    :label="$t('common.aria.reorder_named', { name: props.name })"
    :kbds="CARRY_KEYS"
    :class="`${BOX} cursor-grab touch-none focus-inset`"
    @pointerdown="carry"
    @keydown="moveOnePlace"
  />
</template>

<script setup lang="ts">
import type { RowHandle } from "~/domain/row-drag";

interface Props {
  // Where the row stands in the order a carry moves among, or null where its place is settled.
  place: number | null;
  // The carry its list reads.
  drag: RowHandle;
  // What the row is called: the handle carries that row by that name.
  name: string;
}

const props = defineProps<Props>();

const handle = useTemplateRef<{ element: () => HTMLElement | null }>("handle");

// The keys that carry the row, marked in the tooltip after the row's name.
const CARRY_KEYS = ["↑", "↓"];
// The handle's own box, which the room it leaves behind takes too, so one measure holds either way: compact, the
// least a finger presses (docs/web.md, 「Changing an order」).
const BOX = "size-6 shrink-0";

// Where the row stands is read again as each press is caught: a row that stands no handle carries nothing.
function carry(event: PointerEvent): void {
  if (props.place === null) return;

  props.drag.onHandleDown(props.place, event);
}

function moveOnePlace(event: KeyboardEvent): void {
  if (props.place === null) return;

  props.drag.onHandleKey(props.place, event);
}

// The list moves a row by putting its element down again, and an element put down may stand blurred: the handle of
// the row a key just landed takes the focus back where it came to rest, so the keys go on answering from there. The
// drive is spent with that, so no later change of the order moves the focus by itself.
function takeBackFocus(): void {
  const at = props.place;

  if (at === null || at !== props.drag.driven.value) return;

  props.drag.driven.value = null;

  const element = handle.value?.element();

  if (element == null || element === document.activeElement) return;

  element.focus();
}

onMounted(takeBackFocus);
onUpdated(() => void nextTick(takeBackFocus));
</script>
