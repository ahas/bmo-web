<template>
  <!-- An acting appointment (docs/web.md, 「Organisation」, its chart; docs/accounts.md, 「Acting」): the person who
       acts for the unit's head and the last day it runs, to the end of that day in this browser's time zone. A person
       named while another acts takes their place, which the form says before it is saved. -->
  <SettingsDialog v-model:open="open" :title="$t('organization.action.appoint')" :dirty="changes">
    <UForm id="acting-form" :state="draft" class="flex flex-col gap-4" @submit="save">
      <UFormField :label="$t('organization.label.acting_person')" name="user" required>
        <ChoiceSelect
          v-model="draft.user"
          :items="props.people"
          value-key="value"
          class="w-full"
          data-acting-person
        />
      </UFormField>
      <UFormField :label="$t('organization.label.acting_end')" name="end" required>
        <UInputDate v-model="end" :min-value="today" class="w-full" data-acting-end />
      </UFormField>
      <p v-if="replaced !== null" class="text-sm text-muted" data-acting-replaces>{{ $t("organization.label.acting_replaces", { name: replaced }) }}</p>
      <UAlert v-if="failure !== ''" color="error" variant="subtle" :description="failure" class="whitespace-pre-line" />
    </UForm>

    <template #footer="{ close }">
      <UButton color="neutral" variant="ghost" :label="$t('common.action.cancel')" @click="close()" />
      <UButton type="submit" form="acting-form" :label="$t('common.action.save')" :loading="busy" :disabled="busy || draft.user === '' || end === null" data-acting-save />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { getLocalTimeZone, today as todayIn } from "@internationalized/date";

import { failureText } from "bmo-ui/app/domain/errors";
import { useOpenedWith } from "bmo-ui/app/domain/form-save";

import type { CalendarDate } from "@internationalized/date";

interface Props {
  unit: number;
  // The people of the unit's company who may act, each a label and a value.
  people: { label: string; value: string }[];
  // The name of the person acting now, where an appointment runs.
  acting: string | null;
}

const props = defineProps<Props>();
const emit = defineEmits<{ saved: [] }>();
const open = defineModel<boolean>("open", { default: false });

const { t } = useI18n();

const draft = reactive({ user: "" });
// The last day it runs, held whole rather than unwrapped by a reactive object.
const end = shallowRef<CalendarDate | null>(null);
const changes = useOpenedWith(() => ({ user: draft.user, end: end.value }), { open });
const busy = ref(false);
const failure = ref("");
const today = computed(() => todayIn(getLocalTimeZone()));
// The person whose appointment a save would end: one acting now who is not the person named.
const replaced = computed(() => (props.acting !== null && draft.user !== "" && props.people.find((one) => one.value === draft.user)?.label !== props.acting ? props.acting : null));

watch(open, (now) => {
  if (!now) return;

  draft.user = "";
  end.value = null;
  failure.value = "";
});

async function save(): Promise<void> {
  if (draft.user === "" || end.value === null) return;

  // The appointment runs to the end of its last day, the start of the day after it.
  const until = end.value.add({ days: 1 }).toDate(getLocalTimeZone()).getTime();

  busy.value = true;
  failure.value = "";
  try {
    await $fetch(`/api/organization/units/${props.unit}/acting`, { method: "PUT", body: { user: draft.user, until } });
    open.value = false;
    emit("saved");
  } catch (error) {
    failure.value = failureText(error, t("organization.error.failed"));
  } finally {
    busy.value = false;
  }
}
</script>
