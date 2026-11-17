<!-- One room of the sidebar's rooms (docs/web.md, 「Sidebar」): a menu of its one entry, drawn again only when that entry
     changed, so a room switch or a message in another room leaves the row as it stands. -->
<template>
  <UNavigationMenu as="div" :items="items" :collapsed="collapsed" tooltip orientation="vertical">
    <!-- While somebody writes in the room, a still mark before the count (docs/web.md, 「Presence and typing」); the unread
         count turns as messages land and are read, on the menu's own badge. -->
    <template #item-trailing="{ item, ui }">
      <UIcon v-if="item.typing" name="i-material-symbols-more-horiz" class="size-5 shrink-0 text-muted" data-room-typing aria-hidden="true" />
      <UBadge v-if="typeof item.badge === 'object'" v-bind="item.badge" :label="undefined" data-slot="linkTrailingBadge" :class="ui.linkTrailingBadge()">
        <RollingNumber :value="item.unread" :text="String(item.badge.label)" />
      </UBadge>
    </template>
  </UNavigationMenu>
</template>

<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui";

const props = defineProps<{
  room: NavigationMenuItem;
  collapsed: boolean;
}>();

const items = computed<NavigationMenuItem[]>(() => [props.room]);
</script>
