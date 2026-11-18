<template>
  <!-- A day heading of a room. It is always on the screen while its day is read, so pressing it
       opens a calendar, centred under the heading as the heading is centred over the room, and the
       day chosen there is where the room goes. -->
  <UPopover v-model:open="open" :content="{ align: 'center' }">
    <button
      type="button"
      class="rounded-full bg-elevated/90 px-3 py-1 text-sm text-muted backdrop-blur transition-colors hover:bg-accented hover:text-toned active:bg-accented/80"
      :aria-label="$t('room.aria.jump_to_date', { name: props.label })"
    >
      {{ props.label }}
    </button>

    <template #content>
      <DateCalendar
        :model-value="shown"
        :max-value="today"
        class="p-2"
        @update:model-value="choose"
      />
    </template>
  </UPopover>
</template>

<script setup lang="ts">
import { CalendarDate, parseDate } from "@internationalized/date";

import { dayKey } from "bmo-ui/app/domain/time";

interface Props {
  label: string;
  // The day this heading stands for, as YYYY-MM-DD in the owner's own clock.
  day: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{ pick: [day: string] }>();

const open = ref(false);
const shown = computed(() => parseDate(props.day));
const today = computed(() => parseDate(dayKey(Math.floor(Date.now() / 1000))));

function choose(value: unknown): void {
  if (!(value instanceof CalendarDate) && (typeof value !== "object" || value === null || !("year" in value))) {
    return;
  }

  open.value = false;
  emit("pick", (value as CalendarDate).toString());
}
</script>
