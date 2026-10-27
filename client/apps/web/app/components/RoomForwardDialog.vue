<template>
  <!-- The rooms a message can be forwarded into (docs/web.md, the room screen's message menu): each under the name the
       console shows it by, searched by that name, and a press copies the message there. The room the message stands
       in is not among them. The box stays open while the record answers and closes on the copy; a refusal is said
       inside it in the pack's words. -->
  <SettingsDialog v-model:open="open" :title="$t('room.title.forward')" :description="props.description">
    <div class="flex flex-col gap-2">
      <UInput
        v-model="query"
        class="w-full"
        icon="i-material-symbols-search"
        :placeholder="$t('room.placeholder.forward_search')"
        :aria-label="$t('room.placeholder.forward_search')"
        autofocus
      />

      <p v-if="props.rooms.length === 0" class="px-1 py-2 text-sm text-dimmed">{{ $t("room.status.forward_rooms_none") }}</p>
      <p v-else-if="shown.length === 0" class="px-1 py-2 text-sm text-dimmed">{{ $t("room.status.forward_none") }}</p>

      <ul v-else class="flex max-h-80 flex-col overflow-y-auto" :aria-label="$t('room.title.forward')">
        <li v-for="room in shown" :key="room.chatId">
          <UButton
            color="neutral"
            variant="ghost"
            class="w-full justify-start"
            :label="room.title"
            :disabled="sending !== null"
            :loading="sending === room.chatId"
            :aria-label="$t('room.aria.forward_to', { name: room.title })"
            @click="send(room.chatId)"
          />
        </li>
      </ul>

      <p v-if="failed !== ''" role="alert" class="break-words text-sm text-error">{{ failed }}</p>
    </div>

    <template #footer="{ close }">
      <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="sending !== null" @click="close()" />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
// The name a room is shown by, and the words of the message being forwarded, under the title.
interface ForwardRoom {
  chatId: number;
  title: string;
}

interface Props {
  rooms: readonly ForwardRoom[];
  description: string;
  // Copies the message into the room; the refusal in the pack's words, or null once the record took it.
  forward: (to: number) => Promise<string | null>;
}

const props = defineProps<Props>();

const open = defineModel<boolean>("open", { required: true });

const query = ref("");
const sending = ref<number | null>(null);
const failed = ref("");

// The rooms whose name carries what is typed, case set aside; every room where nothing is.
const shown = computed<ForwardRoom[]>(() => {
  const typed = query.value.trim().toLowerCase();

  return typed === "" ? [...props.rooms] : props.rooms.filter((room) => room.title.toLowerCase().includes(typed));
});

// Every opening starts from the whole list, since a search another forward left behind is not this one's.
watch(open, (now) => {
  if (!now) return;

  query.value = "";
  failed.value = "";
});

async function send(chatId: number): Promise<void> {
  if (sending.value !== null) return;

  sending.value = chatId;
  failed.value = "";

  try {
    const refused = await props.forward(chatId);

    if (refused === null) {
      open.value = false;
    } else {
      failed.value = refused;
    }
  } finally {
    sending.value = null;
  }
}
</script>
