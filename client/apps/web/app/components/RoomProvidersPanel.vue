<template>
  <!-- A room's chat services, the room information's chat services tab, for the administrator alone (docs/web.md, the
       room screen's chat services): the providers the room stands on, each by its name and nothing to turn, since a room's chat service is
       chosen as it is added and stays. Above them stands the avatar mode's switch, only where it can apply: a room added
       on a chat service that offers the mode, or one the receiver already holds in it; anywhere else nothing of it
       shows. Under the switch stands the room's list of supervisors, the ones that answer it and, in an avatar room,
       the whole of who its words may call: a select of several, the choice written whole as it is made and an empty
       list handing the room to the default answerer, said by the line under the row.
       Nothing here tells one provider from another. -->
  <div class="flex min-w-0 flex-col gap-4">
    <ContentSkeleton v-if="loading" :rows="2" listClass="flex flex-col gap-2" :label="$t('room.status.providers_loading')">
      <div class="flex min-h-9 items-center justify-between gap-3">
        <SkeletonBar class="h-4 w-32" />
      </div>
    </ContentSkeleton>

    <template v-else>
      <template v-if="avatarShown">
        <SettingsGroup data-room-mode :aria-busy="modeSaving || supervisorsSaving">
          <SettingsRow :label="$t('room.label.mode_avatar')" :description="$t(mode === 'avatar' ? 'room.message.mode_avatar_on' : 'room.message.mode_avatar_off')">
            <USwitch
              :model-value="mode === 'avatar'"
              :aria-label="$t('room.label.mode_avatar')"
              :disabled="modeSaving"
              @update:model-value="(on: boolean) => void setMode(on ? 'avatar' : 'record-only')"
            />
          </SettingsRow>
          <SettingsRow data-room-supervisors :label="$t('room.label.supervisors')" :description="$t('room.message.supervisors_rule')">
            <ContentSkeleton v-if="supervisors === null && supervisorsFailed === ''" :rows="1" :label="$t('room.status.supervisors_loading')">
              <SkeletonBar class="h-8 w-44" />
            </ContentSkeleton>
            <ChoiceSelect
              v-else-if="supervisors !== null"
              :model-value="supervisors"
              :items="supervisorItems"
              value-key="value"
              multiple
              class="w-44 sm:w-56"
              :disabled="supervisorsSaving"
              :aria-label="$t('room.label.supervisors')"
              @update:model-value="(value: string[]) => void setSupervisors(value)"
            />
          </SettingsRow>
        </SettingsGroup>
        <p v-if="modeSaving" role="status" class="sr-only">{{ $t("room.status.mode_saving") }}</p>
        <p v-if="supervisorsSaving" role="status" class="sr-only">{{ $t("room.status.supervisors_saving") }}</p>
      </template>

      <template v-if="view !== null">
        <SettingsGroup data-room-providers>
          <SettingsRow v-for="provider in view.on" :key="provider.key" :label="provider.label" />
        </SettingsGroup>
        <p class="text-sm text-toned">{{ $t("room.message.providers_rule") }}</p>
      </template>
    </template>

    <p v-if="modeFailed !== ''" role="alert" class="break-words text-sm text-error">{{ modeFailed }}</p>
    <p v-if="supervisorsFailed !== ''" role="alert" class="break-words text-sm text-error">{{ supervisorsFailed }}</p>
    <p v-if="failed !== ''" role="alert" class="break-words text-sm text-error">{{ failed }}</p>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import type { RoomMode, RoomModeView, RoomProvidersView, RoomSupervisorsView } from "#shared/types";
import type { SupervisorView } from "#shared/axes";

interface Props {
  chatId: number;
}

const props = defineProps<Props>();

const { t } = useI18n();

// What the receiver last answered: null until read.
const view = ref<RoomProvidersView | null>(null);
const failed = ref("");

// The room's mode as the receiver last answered it: undefined until read, null for a room never added.
const mode = ref<RoomMode | null | undefined>(undefined);
const modeSaving = ref(false);
const modeFailed = ref("");

// The supervisors the room names, as the receiver last answered: null until read.
const supervisors = ref<string[] | null>(null);
const supervisorsSaving = ref(false);
const supervisorsFailed = ref("");

// The supervisors the reader may choose among. The read hands every one the list is his to see, narrowed by
// ownership at the server as the room add dialog's read is; the panel opens for the administrator alone, who is
// shown all of them.
const candidates = ref<SupervisorView[]>([]);

// Both reads stand before anything is drawn, so the switch never comes in over the providers once they show.
const loading = computed(() => (view.value === null && failed.value === "") || (mode.value === undefined && modeFailed.value === ""));

// The switch applies to an added room on a chat service that offers the mode, and to one already held in it, which
// the reader may always turn back. The supervisor list is edited in the same breath as the mode, so it stands only
// where the switch does.
const avatarShown = computed(() => mode.value === "avatar" || (mode.value === "record-only" && view.value?.avatarOffered === true));

// Each candidate by its label with its name under it, as the room add dialog lists them, and a name the room already
// carries kept among the choices even where ownership leaves it outside the candidates, so an edit never drops it unseen.
const supervisorItems = computed(() => {
  const offered = candidates.value.map((one) => ({ label: one.label, value: one.name, description: one.name }));
  const known = new Set(offered.map((one) => one.value));

  return [...offered, ...(supervisors.value ?? []).filter((name) => !known.has(name)).map((name) => ({ label: name, value: name }))];
});

async function read(): Promise<void> {
  try {
    view.value = await $fetch<RoomProvidersView>(`/api/rooms/${props.chatId}/providers`);
  } catch (error) {
    failed.value = failureText(error, t("room.error.providers_read_failed"));
  }
}

async function readMode(): Promise<void> {
  try {
    mode.value = (await $fetch<RoomModeView>(`/api/rooms/${props.chatId}/mode`)).mode;
  } catch (error) {
    modeFailed.value = failureText(error, t("room.error.mode_read_failed"));
  }
}

// The list and its candidates are asked once the row first stands, so a room the switch does not reach asks for nothing.
const supervisorsAsked = ref(false);

watch(
  avatarShown,
  (shown) => {
    if (shown && !supervisorsAsked.value) {
      supervisorsAsked.value = true;
      void readSupervisors();
    }
  },
  { immediate: true }
);

async function readSupervisors(): Promise<void> {
  try {
    const [list, offered] = await Promise.all([$fetch<RoomSupervisorsView>(`/api/rooms/${props.chatId}/supervisors`), $fetch<SupervisorView[]>("/api/supervisors")]);

    supervisors.value = list.supervisors;
    candidates.value = offered;
  } catch (error) {
    supervisorsFailed.value = failureText(error, t("room.error.supervisors_read_failed"));
  }
}

// The receiver keeps the list in name order, so a choice holding the same names is no change whatever its order.
function sameNames(one: string[], other: string[]): boolean {
  return one.length === other.length && [...one].sort().join("\n") === [...other].sort().join("\n");
}

// The switch turned: the mode written at once, and the switch set to what the receiver answers.
async function setMode(next: RoomMode): Promise<void> {
  modeSaving.value = true;
  modeFailed.value = "";

  try {
    mode.value = (await $fetch<RoomModeView>(`/api/rooms/${props.chatId}/mode`, { method: "PUT", body: { mode: next } })).mode;
  } catch (error) {
    modeFailed.value = failureText(error, t("room.error.mode_save_failed"));
  } finally {
    modeSaving.value = false;
  }
}

// A choice made in the list: the whole list written at once, and the row set to what the receiver answers. A refusal
// leaves the row standing as the receiver last answered it, with the reason said under it.
async function setSupervisors(next: string[]): Promise<void> {
  if (supervisors.value === null || sameNames(next, supervisors.value)) return;

  supervisorsSaving.value = true;
  supervisorsFailed.value = "";

  try {
    supervisors.value = (await $fetch<RoomSupervisorsView>(`/api/rooms/${props.chatId}/supervisors`, { method: "PUT", body: { supervisors: next } })).supervisors;
  } catch (error) {
    supervisorsFailed.value = failureText(error, t("room.error.supervisors_save_failed"));
  } finally {
    supervisorsSaving.value = false;
  }
}

// Read afresh each time the room information opens, so the tab stands as the receiver holds the room now.
onMounted(() => {
  void read();
  void readMode();
});
</script>
