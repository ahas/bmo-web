<!-- The sidebar's rooms under their heading (docs/web.md, 「Sidebar」): a moving list keyed by each
     room's own address, so a room a message lifts up the list slides there from where it stood and
     the rooms it passes slide down. The menu keys its rows by their position, which would hand one
     room's row to the next as the order changes, so each room is a menu of its own one entry in a
     row of the moving list, and the rooms stand together under one navigation landmark. -->
<template>
  <nav :aria-label="heading" class="flex flex-col">
    <div class="flex items-center">
      <UNavigationMenu as="div" class="min-w-0 flex-1" :items="[{ label: heading, type: 'label' }]" :collapsed="collapsed" orientation="vertical" />
      <!-- The add button beside the heading, where the reader may add a room. -->
      <UTooltip v-if="addable && !collapsed" :text="$t('room.title.room_add')">
        <UButton class="me-1 shrink-0" size="xs" color="neutral" variant="ghost" icon="i-material-symbols-add" :aria-label="$t('room.title.room_add')" @click="emit('add')" />
      </UTooltip>
    </div>
    <MovingList v-if="rooms.length > 0" tag="div" class="flex flex-col">
      <div v-for="room in rooms" :key="String(room.to)">
        <UNavigationMenu as="div" :items="[room]" :collapsed="collapsed" tooltip orientation="vertical">
          <!-- The unread count turns as messages land and are read, on the menu's own badge. -->
          <template #item-trailing="{ item, ui }">
            <UBadge v-if="typeof item.badge === 'object'" v-bind="item.badge" :label="undefined" data-slot="linkTrailingBadge" :class="ui.linkTrailingBadge()">
              <RollingNumber :value="item.unread" :text="String(item.badge.label)" />
            </UBadge>
          </template>
        </UNavigationMenu>
      </div>
    </MovingList>
  </nav>
</template>

<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui";

withDefaults(
  defineProps<{
    // One entry per room, each with its own address.
    rooms: NavigationMenuItem[];
    collapsed: boolean;
    // Whether the reader may add a room, which puts the add button beside the heading.
    addable?: boolean;
  }>(),
  { addable: false }
);

const emit = defineEmits<{ add: [] }>();

const { t } = useI18n();
const heading = computed(() => t("common.label.room"));
</script>
