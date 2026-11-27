<template>
  <!-- The supervisors that answer a room, at the head of the room information's members tab for the owner in a room he
       may change (docs/web.md, the room screen's members tab): every supervisor standing in the room, named by it or called
       in by its own account being one of its members, each with the account it answers in and its switch; a named
       one is taken out by its remove button, and the add select names one more. -->
  <section class="mb-4 flex min-w-0 flex-col gap-2" data-room-supervisors :aria-busy="saving">
    <h3 class="text-sm font-medium text-highlighted">{{ $t("room.label.supervisors") }}</h3>

    <ContentSkeleton v-if="view === null && failed === ''" :rows="1" :label="$t('room.status.supervisors_loading')">
      <div class="flex h-12 items-center gap-2">
        <USkeleton class="size-8 shrink-0 rounded-full" />
        <SkeletonBar class="h-4 w-32" />
      </div>
    </ContentSkeleton>

    <template v-else-if="view !== null">
      <ul v-if="view.standing.length > 0" class="flex min-w-0 flex-col" data-room-supervisor-rows>
        <li v-for="supervisor in view.standing" :key="supervisor.name" class="flex min-w-0 flex-col" :data-room-supervisor="supervisor.name">
          <div class="flex min-h-12 min-w-0 items-center gap-2">
            <div class="flex min-w-0 flex-1 flex-col">
              <span class="truncate text-sm text-highlighted">{{ supervisor.label }}</span>
              <span class="text-sm text-muted" data-room-supervisor-voice>
                {{ $t(supervisor.voice === "own-account" ? "room.label.answers_by_bot" : "room.label.answers_by_owner") }}
              </span>
            </div>
            <UButton
              v-if="supervisor.named"
              size="sm"
              variant="ghost"
              color="neutral"
              :label="$t('room.action.supervisor_remove')"
              :disabled="saving"
              data-room-supervisor-remove
              @click="void setNamed(view.supervisors.filter((name) => name !== supervisor.name))"
            />
            <USwitch
              :model-value="supervisor.on"
              :disabled="saving"
              :aria-label="$t('room.aria.supervisor_answering', { name: supervisor.label })"
              data-room-supervisor-switch
              @update:model-value="(on: boolean) => void setAnswering(supervisor.name, on)"
            />
          </div>
          <p v-if="supervisor.byAccount && !supervisor.named" class="text-sm text-toned">{{ $t("room.message.supervisor_by_account") }}</p>
        </li>
      </ul>

      <ChoiceSelect
        v-if="addable.length > 0"
        :model-value="undefined"
        :items="addable"
        value-key="value"
        :placeholder="$t('room.label.supervisor_add')"
        :aria-label="$t('room.label.supervisor_add')"
        :disabled="saving"
        class="w-full sm:w-64"
        data-room-supervisor-add
        @update:model-value="(name: string) => void setNamed([...view!.supervisors, name])"
      />
      <p class="text-sm text-toned">{{ $t("room.message.supervisors_room_rule") }}</p>
    </template>

    <p v-if="saving" role="status" class="sr-only">{{ $t("room.status.supervisors_saving") }}</p>
    <p v-if="failed !== ''" role="alert" class="break-words text-sm text-error">{{ failed }}</p>
  </section>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import type { RoomNamedSupervisors, RoomSupervisorAnswering, RoomSupervisorsView } from "#shared/types";

interface Props {
  chatId: number;
}

const props = defineProps<Props>();

const { t } = useI18n();

// What the receiver last answered: null until read.
const view = ref<RoomSupervisorsView | null>(null);
const saving = ref(false);
const failed = ref("");

// The supervisors the room may still name, each by its label with its name under it.
const addable = computed(() => (view.value?.candidates ?? []).map((one) => ({ label: one.label, value: one.name, description: one.name })));

async function read(): Promise<void> {
  try {
    view.value = await $fetch<RoomSupervisorsView>(`/api/rooms/${props.chatId}/supervisors`);
    failed.value = "";
  } catch (error) {
    failed.value = failureText(error, t("room.error.supervisors_read_failed"));
  }
}

// The room's names written whole, then the section read again as the receiver holds the room now.
async function setNamed(next: string[]): Promise<void> {
  saving.value = true;
  failed.value = "";

  try {
    await $fetch<RoomNamedSupervisors>(`/api/rooms/${props.chatId}/supervisors`, { method: "PUT", body: { supervisors: next } });
    await read();
  } catch (error) {
    failed.value = failureText(error, t("room.error.supervisors_save_failed"));
  } finally {
    saving.value = false;
  }
}

// A supervisor turned off or on in the room, its row standing as the receiver answers.
async function setAnswering(name: string, on: boolean): Promise<void> {
  saving.value = true;
  failed.value = "";

  try {
    const answered = await $fetch<RoomSupervisorAnswering>(`/api/rooms/${props.chatId}/supervisors/${encodeURIComponent(name)}/answering`, {
      method: "PUT",
      body: { on }
    });
    const row = view.value?.standing.find((one) => one.name === answered.name);

    if (row !== undefined) row.on = answered.on;
  } catch (error) {
    failed.value = failureText(error, t("room.error.supervisor_answering_failed"));
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void read();
});
</script>
