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
      <!-- Beside the heading, the heading's grey icon at every width: the new chat button, a chooser between the
           ways the reader may bring a room in where they have more than one, and the one way itself where they have
           one. -->
      <div v-if="!collapsed && ways.length > 0" class="me-1 flex">
        <UDropdownMenu v-if="ways.length > 1" :items="chooser" :content="chooserMenu">
          <IconButton size="xs" icon="i-material-symbols-add-comment-outline" :label="newChat" data-new-chat />
        </UDropdownMenu>
        <IconButton v-else size="xs" icon="i-material-symbols-add-comment-outline" :label="newChat" data-new-chat @click="ways[0]!.act()" />
      </div>
    </div>
    <MovingList v-if="rooms.length > 0" tag="div" class="flex flex-col">
      <div v-for="room in rooms" :key="String(room.to)">
        <SidebarRoom :room="room" :collapsed="collapsed" />
      </div>
    </MovingList>
  </nav>
</template>

<script setup lang="ts">
import type { DropdownMenuItem, NavigationMenuItem } from "@nuxt/ui";

const props = withDefaults(
  defineProps<{
    // One entry per room, each with its own address.
    rooms: NavigationMenuItem[];
    collapsed: boolean;
    // Whether the reader may add a room from a chat service, one of the new chat button's ways.
    addable?: boolean;
    // Whether the reader may open a group room in the console, one of the new chat button's ways.
    openable?: boolean;
  }>(),
  { addable: false, openable: false }
);

const emit = defineEmits<{ add: []; open: [] }>();

const { t } = useI18n();
const heading = computed(() => t("common.label.room"));
const newChat = computed(() => t("room.title.new_chat"));

// The menu hands the focus back to its button as it closes, which the dialog a choice opens would read as a press
// outside itself; so a menu closing on a choice leaves the focus where the dialog put it.
let chosen = false;

// Each way the reader may bring a room in, in the order they are reached for.
const ways = computed(() => [
  ...(props.addable ? [{ label: t("room.action.new_chat_add"), icon: "i-material-symbols-add-link", act: () => emit("add") }] : []),
  ...(props.openable ? [{ label: t("room.action.new_chat_open"), icon: "i-material-symbols-group-add-outline", act: () => emit("open") }] : [])
]);

const chooser = computed<DropdownMenuItem[]>(() =>
  ways.value.map(({ label, icon, act }) => ({
    label,
    icon,
    onSelect: () => {
      chosen = true;
      act();
    }
  }))
);

const chooserMenu = {
  align: "end" as const,
  onCloseAutoFocus: (event: Event) => {
    if (chosen) event.preventDefault();

    chosen = false;
  }
};
</script>
