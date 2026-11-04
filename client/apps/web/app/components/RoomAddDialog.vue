<template>
  <!-- A room added from a chat service (docs/web.md, 「Sidebar」): choices made in turn, each offered by what the
       service declares and never by its name — the service, a room of its account or a conversation started with
       its contacts, and the mode with a title that may be left empty. A group names its supervisor, one of the
       signed-in person's own or none. A refusal the receiver answers with a code is said in the pack's sentence
       under the form. The dialog keeps no unsaved-changes guard. -->
  <SettingsDialog v-model:open="open" :title="$t('room.title.room_add')">
    <form id="room-add-form" class="flex flex-col gap-4" @submit.prevent="void add()">
      <p v-if="services !== null && services.length === 0" class="text-sm text-muted">{{ $t("room.status.room_add_no_services") }}</p>

      <UFormField
        :label="$t('room.label.room_add_service')"
        name="service"
        :help="service === null || service.modes.length === 0 ? undefined : $t('room.label.room_add_modes', { modes: service.modes.map(modeLabel).join(', ') })"
      >
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

      <p v-if="service !== null && tabs.length === 0" class="text-sm text-muted">{{ $t("room.message.room_add_nothing") }}</p>

      <UTabs
        v-if="tabs.length > 1"
        v-model="tab"
        :items="tabs"
        :content="false"
        color="neutral"
        variant="link"
        size="sm"
        :aria-label="$t('room.label.room_add_room')"
      />

      <UFormField v-if="tab === 'rooms' && service?.listsRooms" :label="$t('room.label.room_add_room')" name="room">
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
              @click="chooseRoom(room)"
            >
              <span class="min-w-0 flex-1 truncate text-highlighted">{{ room.title ?? $t("room.label.room_add_untitled", { id: room.id }) }}</span>
              <span class="shrink-0 text-muted">{{ kindLabel(room.kind) }}</span>
              <UBadge v-if="heldLabel(room) !== null" color="neutral" variant="subtle" size="sm" :label="heldLabel(room) ?? ''" />
            </button>
          </li>
          <!-- The foot: reaching it reads the next page, its rows standing as skeletons while it comes, and once the
               service holds no more a list that took more than one page says it has ended. -->
          <li ref="roomsFoot" role="presentation">
            <ContentSkeleton v-if="adding" :rows="2" listClass="flex flex-col gap-1 px-3 py-2" :label="$t('room.status.room_add_more_loading')">
              <SkeletonBar class="h-9 w-full rounded-md" />
            </ContentSkeleton>
            <p v-else-if="!more && roomPages > 1" class="px-3 py-2 text-center text-sm text-muted">{{ $t("room.status.room_add_end") }}</p>
          </li>
        </ul>
        <p v-if="roomsFailed !== ''" role="alert" class="mt-2 text-sm text-error">{{ roomsFailed }}</p>
      </UFormField>

      <UFormField v-if="tab === 'contacts' && service?.listsContacts" :label="$t('room.label.room_add_tab_contacts')" name="contacts" :help="startHelp">
        <UInput v-model="search" class="mb-2 w-full" icon="i-material-symbols-search-rounded" :placeholder="$t('room.label.room_add_search')" :aria-label="$t('room.label.room_add_search')" />
        <ContentSkeleton v-if="contactsReading && contacts.length === 0" :rows="3" listClass="flex flex-col gap-1" :label="$t('room.status.room_add_contacts_loading')">
          <SkeletonBar class="h-9 w-full rounded-md" />
        </ContentSkeleton>
        <p v-else-if="contacts.length === 0 && !contactsReading" class="text-sm text-muted">{{ $t("room.status.room_add_no_contacts") }}</p>
        <p v-else-if="found.length === 0" class="text-sm text-muted">{{ $t("room.status.room_add_no_match") }}</p>
        <ul v-else role="listbox" :aria-multiselectable="service.startsGroups" :aria-label="$t('room.label.room_add_tab_contacts')" class="flex max-h-64 flex-col overflow-y-auto rounded-lg border border-default">
          <li v-for="contact in found" :key="contact.id" role="option" :aria-selected="contactIds.includes(contact.id)" :aria-disabled="!starts">
            <button
              type="button"
              class="flex w-full items-center gap-3 px-3 py-2 text-start text-sm transition-colors enabled:hover:bg-elevated disabled:opacity-60"
              :class="contactIds.includes(contact.id) ? 'bg-elevated' : ''"
              :disabled="!starts"
              @click="chooseContact(contact)"
            >
              <span class="min-w-0 flex-1 truncate text-highlighted">{{ contact.name }}</span>
              <span class="shrink-0 text-muted">{{ contactKindLabel(contact.kind) }}</span>
              <UBadge v-if="contactMark(contact) !== null" color="neutral" variant="subtle" size="sm" :label="contactMark(contact) ?? ''" />
            </button>
          </li>
        </ul>
        <p v-if="contactsFailed !== ''" role="alert" class="mt-2 text-sm text-error">{{ contactsFailed }}</p>
      </UFormField>

      <div v-if="chosen" class="grid gap-4 sm:grid-cols-2">
        <UFormField :label="$t('room.label.room_add_mode')" name="mode" :help="mode === undefined ? undefined : modeHelp(mode)">
          <USelect v-model="mode" :items="modeItems" value-key="value" class="w-full" :aria-label="$t('room.label.room_add_mode')" />
        </UFormField>
        <UFormField :label="group ? $t('room.label.room_add_group_title') : $t('room.label.room_add_title')" name="title" :required="group">
          <UInput v-model="title" class="w-full" :placeholder="chosenTitle" :aria-label="group ? $t('room.label.room_add_group_title') : $t('room.label.room_add_title')" />
        </UFormField>
      </div>

      <UFormField v-if="group" :label="$t('room.label.room_add_supervisor')" name="supervisor" :help="$t('room.message.room_add_supervisor')">
        <USelect v-model="supervisorName" :items="supervisorItems" value-key="value" class="w-full" :aria-label="$t('room.label.room_add_supervisor')" />
      </UFormField>

      <p v-if="failed !== ''" role="alert" class="break-words text-sm text-error">{{ failed }}</p>
    </form>

    <template #footer="{ close }">
      <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="busy" @click="close()" />
      <UButton type="submit" form="room-add-form" :label="$t('common.action.add')" :loading="busy" :disabled="busy || !ready" />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { useFootInView } from "bmo-ui/app/domain/foot";
import { useNextPages } from "~/domain/next-pages";

import type { RoomAddCandidate, RoomAddContact, RoomAddContactPage, RoomAddMode, RoomAddPage, RoomAddService, RoomAdded } from "#shared/types";
import type { SupervisorView } from "#shared/axes";

type Tab = "rooms" | "contacts";

// No supervisor stands after every supervisor, as a value no supervisor's name can be: a name starts with a
// letter, and a list's value is never empty.
const NONE = "-";

const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ added: [RoomAdded] }>();

const { t } = useI18n();
const { user } = useUserSession();

// A page of a service's rooms is as long as the service makes it; the dialog asks for this many at a time. The
// contacts are read whole, page after page, so the search runs over all of them.
const PAGE = 50;
const CONTACT_PAGE = 200;

const services = ref<RoomAddService[] | null>(null);
const serviceKey = ref<string | undefined>(undefined);
const tab = ref<Tab>("rooms");
const rooms = ref<RoomAddCandidate[]>([]);
const more = ref(false);
const roomsReading = ref(false);
// How many pages of rooms have landed, so the end is said only of a list that took more than one.
const roomPages = ref(0);
const roomsFailed = ref("");
const roomId = ref<number | null>(null);
const contacts = ref<RoomAddContact[]>([]);
const contactsReading = ref(false);
const contactsFailed = ref("");
const contactIds = ref<number[]>([]);
const search = ref("");
const mode = ref<RoomAddMode | undefined>(undefined);
const title = ref("");
const supervisors = ref<SupervisorView[]>([]);
const supervisorName = ref<string>(NONE);
const busy = ref(false);
const failed = ref("");

const service = computed(() => services.value?.find((one) => one.key === serviceKey.value) ?? null);
const serviceItems = computed(() => (services.value ?? []).map((one) => ({ label: one.label, value: one.key })));
// A tab stands only where the service offers what it holds.
const tabs = computed(() => {
  const offered: { label: string; value: Tab }[] = [];

  if (service.value?.listsRooms) offered.push({ label: t("room.label.room_add_tab_rooms"), value: "rooms" });
  if (service.value?.listsContacts) offered.push({ label: t("room.label.room_add_tab_contacts"), value: "contacts" });

  return offered;
});
// Whether the service starts any conversation from its contacts.
const starts = computed(() => service.value !== null && (service.value.startsChats || service.value.startsGroups));
// Several contacts chosen, or one where only groups are started, make a group.
const group = computed(() => tab.value === "contacts" && (contactIds.value.length > 1 || (contactIds.value.length === 1 && !service.value?.startsChats)));
const chosen = computed(() => (tab.value === "rooms" ? roomId.value !== null : contactIds.value.length > 0));
const ready = computed(() => serviceKey.value !== undefined && chosen.value && mode.value !== undefined && (!group.value || title.value.trim() !== ""));
const found = computed(() => {
  const asked = search.value.trim().toLocaleLowerCase();

  const matching = asked === "" ? contacts.value : contacts.value.filter((contact) => contact.name.toLocaleLowerCase().includes(asked));

  return [...matching].sort((one, other) => one.name.localeCompare(other.name));
});
// The modes the service offers, an avatar only where the room itself holds the service's avatar mode.
const chosenRoom = computed(() => (tab.value === "rooms" ? (rooms.value.find((room) => room.id === roomId.value) ?? null) : null));
const offeredModes = computed(() => (service.value?.modes ?? []).filter((one) => one !== "avatar" || chosenRoom.value?.modes == null || chosenRoom.value.modes.includes("human-avatar")));
const modeItems = computed(() => offeredModes.value.map((one) => ({ label: modeLabel(one), value: one })));
// A group names the signed-in person's own supervisor or none: the supervisors the agency files under their account,
// and no other person's.
const ownSupervisors = computed(() => {
  const account = user.value?.id;

  return account === undefined ? [] : supervisors.value.filter((one) => one.ownerAccount === account);
});
const supervisorItems = computed(() => [
  ...ownSupervisors.value.map((one) => ({ label: one.label, value: one.name, description: one.name })),
  { label: t("settings.label.supervisor_none"), value: NONE }
]);
const chosenTitle = computed(() => {
  if (tab.value === "rooms") return chosenRoom.value?.title ?? "";
  if (group.value) return "";

  return contacts.value.find((contact) => contact.id === contactIds.value[0])?.name ?? "";
});
const startHelp = computed(() => {
  if (!starts.value) return t("room.message.room_add_no_start");
  if (contactIds.value.length === 0) return undefined;

  return group.value ? t("room.message.room_add_group", { n: contactIds.value.length }) : t("room.message.room_add_one_to_one");
});

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

function contactKindLabel(kind: string): string {
  if (kind === "person") return t("room.label.room_add_kind_person");
  if (kind === "bot") return t("room.label.room_add_kind_bot");

  return kind;
}

// A room the receiver already holds: by its mode where it was added, as held where it never was.
function heldLabel(room: { held: boolean; mode: RoomAddMode | null }): string | null {
  if (room.mode !== null) return t("room.label.room_add_added_as", { mode: modeLabel(room.mode) });

  return room.held ? t("room.label.room_add_held") : null;
}

// A contact's one-to-one, marked as a room is, or as a chat the account has that the receiver does not hold.
function contactMark(contact: RoomAddContact): string | null {
  if (contact.roomId === null) return null;

  return heldLabel(contact) ?? t("room.label.room_add_has_chat");
}

// Every opening starts from nothing: the services read again, nothing chosen.
watch(open, async (opened) => {
  if (!opened) return;

  services.value = null;
  supervisors.value = [];
  supervisorName.value = NONE;
  serviceKey.value = undefined;
  failed.value = "";

  const [listed, owned] = await Promise.allSettled([
    $fetch<RoomAddService[]>("/api/room-add"),
    $fetch<SupervisorView[]>("/api/supervisors")
  ]);

  supervisors.value = owned.status === "fulfilled" ? owned.value : [];

  if (listed.status === "fulfilled") {
    services.value = listed.value;
  } else {
    services.value = [];
    failed.value = failureText(listed.reason, t("room.error.room_add_rooms_failed"));
  }
});

// A service chosen opens on the first tab it offers, and nothing of the last service stays chosen.
watch(serviceKey, () => {
  rooms.value = [];
  more.value = false;
  roomPages.value = 0;
  roomId.value = null;
  roomsFailed.value = "";
  contacts.value = [];
  contactIds.value = [];
  contactsFailed.value = "";
  search.value = "";
  mode.value = undefined;
  title.value = "";
  failed.value = "";
  tab.value = tabs.value[0]?.value ?? "rooms";

  if (service.value?.listsRooms) void readRooms();
  if (service.value?.listsContacts) void readContacts();
});

// Changing tabs lets go of what the other tab chose.
watch(tab, () => {
  roomId.value = null;
  contactIds.value = [];
  mode.value = undefined;
  title.value = "";
});

// The foot of the rooms standing in view, inside the list's own scroll, reads the next page. A read that failed asks
// for no further page; the failure under the list says why.
const roomsFoot = useTemplateRef<HTMLElement>("roomsFoot");
const atRoomsFoot = useFootInView(roomsFoot, roomsReading, { rootMargin: "100px" });
const { adding } = useNextPages({
  atFoot: atRoomsFoot,
  more: () => more.value && roomsFailed.value === "",
  busy: () => roomsReading.value,
  next: async () => {
    await readRooms();

    return roomsFailed.value === "";
  }
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
    roomPages.value += 1;
  } catch (error) {
    roomsFailed.value = failureText(error, t("room.error.room_add_rooms_failed"));
  } finally {
    roomsReading.value = false;
  }
}

async function readContacts(): Promise<void> {
  const key = serviceKey.value;

  if (key === undefined) return;

  contactsReading.value = true;
  contactsFailed.value = "";

  try {
    let page: RoomAddContactPage | null = null;

    do {
      const last = contacts.value.at(-1);

      page = await $fetch<RoomAddContactPage>(`/api/room-add/${encodeURIComponent(key)}/contacts`, { query: { limit: CONTACT_PAGE, ...(last === undefined ? {} : { after: last.id }) } });

      if (key !== serviceKey.value) return;

      contacts.value = [...contacts.value, ...page.items];
    } while (page.more && page.items.length > 0);
  } catch (error) {
    contactsFailed.value = failureText(error, t("room.error.room_add_contacts_failed"));
  } finally {
    contactsReading.value = false;
  }
}

// The mode offered alone is the one taken; with two, the choice is left to the reader.
function settleMode(): void {
  mode.value = offeredModes.value.length === 1 ? offeredModes.value[0] : offeredModes.value.includes(mode.value as RoomAddMode) ? mode.value : undefined;
}

function chooseRoom(room: RoomAddCandidate): void {
  if (room.mode !== null) return;

  roomId.value = room.id;
  settleMode();
}

// A contact chosen or let go: one at a time where the service starts no group, several where it does.
function chooseContact(contact: RoomAddContact): void {
  if (!starts.value) return;

  if (contactIds.value.includes(contact.id)) {
    contactIds.value = contactIds.value.filter((id) => id !== contact.id);
  } else {
    contactIds.value = service.value?.startsGroups ? [...contactIds.value, contact.id] : [contact.id];
  }

  settleMode();
}

async function add(): Promise<void> {
  if (!ready.value || serviceKey.value === undefined || mode.value === undefined) return;

  busy.value = true;
  failed.value = "";

  const chosenRoomOrContacts =
    tab.value === "rooms" ? { roomId: roomId.value } : group.value ? { contactIds: contactIds.value } : { contactId: contactIds.value[0] };
  const supervisor = group.value && supervisorName.value !== NONE ? { supervisor: supervisorName.value } : {};

  try {
    const added = await $fetch<RoomAdded>("/api/rooms", { method: "POST", body: { provider: serviceKey.value, mode: mode.value, title: title.value, ...chosenRoomOrContacts, ...supervisor } });

    emit("added", added);
    open.value = false;
  } catch (error) {
    failed.value = failureText(error, t("room.error.room_add_failed"));
  } finally {
    busy.value = false;
  }
}
</script>
