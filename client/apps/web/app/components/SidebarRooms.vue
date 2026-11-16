<!-- The sidebar's rooms under their heading (docs/web.md, 「Sidebar」): a moving list keyed by each
     room's own address, so a room a message lifts up the list slides there from where it stood and
     the rooms it passes slide down. The menu keys its rows by their position, which would hand one
     room's row to the next as the order changes, so each room is a menu of its own one entry in a
     row of the moving list, and the rooms stand together under one navigation landmark. A room's row is a part of its
     own, drawn again only when its entry changed. -->
<template>
  <nav :aria-label="heading" class="flex flex-col">
    <div class="flex items-center">
      <UNavigationMenu as="div" class="min-w-0 flex-1" :items="[{ label: heading, type: 'label' }]" :collapsed="collapsed" orientation="vertical" />
      <!-- Beside the heading, the heading's grey icons at every width: a group room opened in the console, where the
           reader's rooms section writes, and a room added from a chat service, where the reader may add one. -->
      <IconButton v-if="openable && !collapsed" class="me-1" size="xs" icon="i-material-symbols-group-add-outline" :label="$t('room.title.room_open')" data-room-open @click="emit('open')" />
      <IconButton v-if="addable && !collapsed" class="me-1" size="xs" icon="i-material-symbols-add" :label="$t('room.title.room_add')" data-room-add @click="emit('add')" />
    </div>
    <MovingList v-if="rooms.length > 0" tag="div" class="flex flex-col">
      <div v-for="room in rooms" :key="String(room.to)">
        <SidebarRoom :room="room" :collapsed="collapsed" />
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
    // Whether the reader may open a group room, which puts its button beside the heading.
    openable?: boolean;
  }>(),
  { addable: false, openable: false }
);

const emit = defineEmits<{ add: []; open: [] }>();

const { t } = useI18n();
const heading = computed(() => t("common.label.room"));
</script>
