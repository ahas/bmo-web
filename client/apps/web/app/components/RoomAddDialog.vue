<template>
  <!-- A room added from a chat service's account (docs/web.md, 「Sidebar」): three choices made in turn, each
       offered by what the service declares and never by its name — the service, a room of its account, and the
       mode with a title that may be left empty. A refusal the receiver answers with a code is said in the
       pack's sentence under the form. -->
  <SettingsDialog v-model:open="open" :title="$t('room.title.room_add')" :dirty="dirty">
    <form id="room-add-form" class="flex flex-col gap-4" @submit.prevent="void add()">
      <p v-if="services !== null && services.length === 0" class="text-sm text-muted">{{ $t("room.status.room_add_no_services") }}</p>

      <UFormField :label="$t('room.label.room_add_service')" name="service">
        <USelect
          v-model="serviceKey"
          :items="serviceItems"
          value-key="value"
          class="w-full"
          :loading="services === null"
          :disabled="services === null || services.length === 0"
          :aria-label="$t('room.label.room_add_service')"
        />
      </UFormField>

      <UFormField v-if="serviceKey !== undefined" :label="$t('room.label.room_add_room')" name="room">
        <ContentSkeleton v-if="roomsReading && rooms.length === 0" :rows="3" listClass="flex flex-col gap-1" :label="$t('room.status.room_add_loading')">
          <SkeletonBar class="h-9 w-full rounded-md" />
        </ContentSkeleton>
        <p v-else-if="rooms.length === 0 && !roomsReading" class="text-sm text-muted">{{ $t("room.status.room_add_no_rooms") }}</p>
        <ul v-else role="listbox" :aria-label="$t('room.label.room_add_room')" class="flex max-h-64 flex-col overflow-y-auto rounded-lg border border-default">
          <li v-for="room in rooms" :key="room.id" role="option" :aria-selected="room.id === roomId" :aria-disabled="room.mode !== null">
            <button
              type="button"
              class="flex w-full items-center gap-3 px-3 py-2 text-start text-sm transition-colors enabled:hover:bg-elevated disabled:opacity-60"
              :class="room.id === roomId ? 'bg-elevated' : ''"
              :disabled="room.mode !== null"
              @click="choose(room)"
            >
              <span class="min-w-0 flex-1 truncate text-highlighted">{{ room.title ?? $t("room.label.room_add_untitled", { id: room.id }) }}</span>
              <span class="shrink-0 text-muted">{{ kindLabel(room.kind) }}</span>
              <UBadge v-if="room.mode !== null" color="neutral" variant="subtle" size="sm" :label="$t('room.label.room_add_added_as', { mode: modeLabel(room.mode) })" />
            </button>
          </li>
        </ul>
        <UButton v-if="more" class="mt-2" size="sm" color="neutral" variant="ghost" :label="$t('room.action.room_add_more')" :loading="roomsReading" @click="void readRooms()" />
        <p v-if="roomsFailed !== ''" role="alert" class="mt-2 text-sm text-error">{{ roomsFailed }}</p>
      </UFormField>

      <div v-if="roomId !== null" class="grid gap-4 sm:grid-cols-2">
        <UFormField :label="$t('room.label.room_add_mode')" name="mode" :help="mode === undefined ? undefined : modeHelp(mode)">
          <USelect v-model="mode" :items="modeItems" value-key="value" class="w-full" :aria-label="$t('room.label.room_add_mode')" />
        </UFormField>
        <UFormField :label="$t('room.label.room_add_title')" name="title">
          <UInput v-model="title" class="w-full" :placeholder="chosenTitle" :aria-label="$t('room.label.room_add_title')" />
        </UFormField>
      </div>

      <p v-if="failed !== ''" role="alert" class="break-words text-sm text-error">{{ failed }}</p>
    </form>

    <template #footer="{ close }">
      <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="busy" @click="close()" />
      <UButton type="submit" form="room-add-form" :label="$t('common.action.add')" :loading="busy" :disabled="busy || serviceKey === undefined || roomId === null || mode === undefined" />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import type { RoomAddCandidate, RoomAddMode, RoomAddPage, RoomAddService, RoomAdded } from "#shared/types";

const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ added: [RoomAdded] }>();

const { t } = useI18n();

// A page of a service's rooms is as long as the service makes it; the dialog asks for this many at a time.
const PAGE = 50;

const services = ref<RoomAddService[] | null>(null);
const serviceKey = ref<string | undefined>(undefined);
const rooms = ref<RoomAddCandidate[]>([]);
const more = ref(false);
const roomsReading = ref(false);
const roomsFailed = ref("");
const roomId = ref<number | null>(null);
const mode = ref<RoomAddMode | undefined>(undefined);
const title = ref("");
const busy = ref(false);
const failed = ref("");

const dirty = computed(() => serviceKey.value !== undefined);
const service = computed(() => services.value?.find((one) => one.key === serviceKey.value) ?? null);
const serviceItems = computed(() => (services.value ?? []).map((one) => ({ label: one.label, value: one.key })));
// The modes the service offers, an avatar only where the room itself holds the service's avatar mode.
const chosenRoom = computed(() => rooms.value.find((room) => room.id === roomId.value) ?? null);
const offeredModes = computed(() => (service.value?.modes ?? []).filter((one) => one !== "avatar" || chosenRoom.value?.modes == null || chosenRoom.value.modes.includes("human-avatar")));
const modeItems = computed(() => offeredModes.value.map((one) => ({ label: modeLabel(one), value: one })));
const chosenTitle = computed(() => chosenRoom.value?.title ?? "");

// What a mode does to the room, said under the choice.
function modeHelp(value: RoomAddMode): string {
  return value === "avatar" ? t("room.message.room_add_mode_avatar") : t("room.message.room_add_mode_record_only");
}

function modeLabel(value: RoomAddMode): string {
  return value === "avatar" ? t("room.label.room_add_mode_avatar") : t("room.label.room_add_mode_record_only");
}

function kindLabel(kind: string): string {
  if (kind === "owner") return t("room.label.room_add_kind_owner");
  if (kind === "group") return t("room.label.room_add_kind_group");

  return kind;
}

// Every opening starts from nothing: the services read again, nothing chosen.
watch(open, async (opened) => {
  if (!opened) return;

  services.value = null;
  serviceKey.value = undefined;
  failed.value = "";

  try {
    services.value = await $fetch<RoomAddService[]>("/api/room-add");
  } catch (error) {
    services.value = [];
    failed.value = failureText(error, t("room.error.room_add_rooms_failed"));
  }
});

// A service chosen lists its account's rooms from the first page, and nothing of the last service stays chosen.
watch(serviceKey, () => {
  rooms.value = [];
  more.value = false;
  roomId.value = null;
  mode.value = undefined;
  title.value = "";
  roomsFailed.value = "";

  if (serviceKey.value !== undefined) void readRooms();
});

async function readRooms(): Promise<void> {
  const key = serviceKey.value;

  if (key === undefined) return;

  roomsReading.value = true;
  roomsFailed.value = "";

  try {
    const last = rooms.value.at(-1);
    const page = await $fetch<RoomAddPage>(`/api/room-add/${encodeURIComponent(key)}`, { query: { limit: PAGE, ...(last === undefined ? {} : { after: last.id }) } });

    if (key !== serviceKey.value) return;

    rooms.value = [...rooms.value, ...page.items];
    more.value = page.more;
  } catch (error) {
    roomsFailed.value = failureText(error, t("room.error.room_add_rooms_failed"));
  } finally {
    roomsReading.value = false;
  }
}

function choose(room: RoomAddCandidate): void {
  if (room.mode !== null) return;

  roomId.value = room.id;
  // The mode offered alone is the one taken; with two, the choice is left to the reader.
  mode.value = offeredModes.value.length === 1 ? offeredModes.value[0] : offeredModes.value.includes(mode.value as RoomAddMode) ? mode.value : undefined;
}

async function add(): Promise<void> {
  if (serviceKey.value === undefined || roomId.value === null || mode.value === undefined) return;

  busy.value = true;
  failed.value = "";

  try {
    const added = await $fetch<RoomAdded>("/api/rooms", { method: "POST", body: { provider: serviceKey.value, roomId: roomId.value, mode: mode.value, title: title.value } });

    emit("added", added);
    open.value = false;
  } catch (error) {
    failed.value = failureText(error, t("room.error.room_add_failed"));
  } finally {
    busy.value = false;
  }
}
</script>
