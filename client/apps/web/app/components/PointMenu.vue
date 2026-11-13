<template>
  <!-- The menu's trigger is a mark of no size that nothing presses: the menu is asked for by the screen that holds
       it, over a row of a list that stands apart from it, and opens at the point the press was made (docs/web.md,
       「Floating things」). The menu's trigger takes the mark over as its own element, so the mark is found inside a
       holder of no box of its own rather than held by a reference. -->
  <span ref="holder" class="contents">
    <UContextMenu :items="items" @update:open="emit('update:open', $event)">
      <span data-point-menu-anchor class="fixed start-0 top-0 size-0" aria-hidden="true" />
    </UContextMenu>
  </span>
</template>

<script setup lang="ts">
import type { ContextMenuItem } from "@nuxt/ui";

// The one menu a long list's rows share, drawn apart from the list: whether it is open, where it stands and the
// acts it carries are its own, so asking it over a row, opening it and closing it draw none of the list's rows
// again.

const emit = defineEmits<{ "update:open": [open: boolean] }>();

const holder = useTemplateRef<HTMLElement>("holder");
const items = shallowRef<ContextMenuItem[][]>([]);

// Opens the menu with the given acts at the point, the way a right press there would: the press reaches the menu's
// own trigger, which reads its point from it, as the console's held finger asks for a menu at the finger.
function openAt(acts: ContextMenuItem[][], at: { x: number; y: number }): void {
  items.value = acts;
  holder.value?.querySelector("[data-point-menu-anchor]")?.dispatchEvent(new MouseEvent("contextmenu", { cancelable: true, button: 2, clientX: at.x, clientY: at.y }));
}

defineExpose({ openAt });
</script>
