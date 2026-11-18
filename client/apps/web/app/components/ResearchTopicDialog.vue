<template>
  <!-- A topic registered, or one changed (docs/web.md, 「Research screen」, the topics tab): its name on registering alone, then
       its purpose, its own instruction, how often it is gathered and the calendar its dated findings are written to.
       Whether the name and the calendar stand is the research unit's to say, and its refusal stands under the form. -->
  <SettingsDialog v-model:open="open" wide :title="title" :dirty="changes">
    <form id="research-topic-form" class="flex flex-col gap-4" novalidate @submit.prevent="void save()">
      <UFormField :label="$t('common.label.name')" name="name" :error="(props.topic === null && draft.name !== '' && nameFault) || undefined" :help="props.topic === null ? $t('research.message.topic_name_help') : undefined">
        <UInput v-model="draft.name" class="w-full font-mono sm:w-64" :disabled="props.topic !== null || busy" :aria-label="$t('common.label.name')" />
      </UFormField>

      <UFormField :label="$t('research.label.topic_purpose')" name="purpose">
        <UInput v-model="draft.purpose" class="w-full" :disabled="busy" :aria-label="$t('research.label.topic_purpose')" />
      </UFormField>

      <UFormField :label="$t('research.label.topic_instruction')" name="instruction" :help="$t('research.message.topic_instruction_help')">
        <GrowingTextarea v-model="draft.instruction" :rows="5" :disabled="busy" :aria-label="$t('research.label.topic_instruction')" />
      </UFormField>

      <UFormField :label="$t('research.label.topic_period')" name="gatherMinutes">
        <div class="flex flex-wrap items-center gap-2">
          <NumberInput v-model="draft.count" :min="1" :digits="4" :disabled="busy" :aria-label="$t('research.label.topic_period')" />
          <USelect v-model="draft.unit" :items="unitItems" value-key="value" class="w-28" :disabled="busy" :aria-label="$t('research.label.period_unit')" />
        </div>
      </UFormField>

      <UFormField :label="$t('research.label.topic_calendar')" name="calendar">
        <div class="flex flex-col gap-3">
          <USwitch v-model="draft.writes" :label="$t('research.label.calendar_writes')" :description="$t('research.message.calendar_help')" :disabled="busy" data-topic-calendar />
          <div v-if="draft.writes" class="grid gap-3 sm:grid-cols-2">
            <USelect v-model="draft.realm" :items="realmItems" value-key="value" class="w-full" :disabled="busy" :aria-label="$t('research.label.calendar_realm')" />
            <UInput v-model="draft.calendarId" class="w-full font-mono" :placeholder="$t('research.label.calendar_id')" :disabled="busy" :aria-label="$t('research.label.calendar_id')" />
          </div>
        </div>
      </UFormField>

      <p v-if="refusal !== null" role="alert" class="break-words text-sm text-error">{{ refusal }}</p>
    </form>

    <template #footer="{ close }">
      <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="busy" @click="close()" />
      <UButton type="submit" form="research-topic-form" :label="$t(props.topic === null ? 'common.action.add' : 'common.action.save')" :loading="busy" :disabled="busy || !ready" />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { useOpenedWith } from "bmo-ui/app/domain/form-save";
import { failureText } from "bmo-ui/app/domain/errors";
import { PERIOD_UNITS, TOPIC_NAME, periodMinutes, periodOf } from "~/domain/research";

import type { ResearchCalendar, ResearchCategoryView, ResearchNewTopic, ResearchStateView, ResearchTopicChange } from "#shared/research";
import type { PeriodUnit } from "~/domain/research";

const props = defineProps<{
  // The topic changed, or null for one registered.
  topic: ResearchCategoryView | null;
  // The names the unit's categories hold, which a new topic may not take.
  taken: readonly string[];
}>();

const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ saved: [state: ResearchStateView, added: boolean] }>();

const { t } = useI18n();

// A day, the unit's own period for a topic that names none.
const DAY = 1_440;

interface Draft {
  name: string;
  purpose: string;
  instruction: string;
  count: number | null;
  unit: PeriodUnit;
  writes: boolean;
  realm: ResearchCalendar["realm"];
  calendarId: string;
}

function draftOf(topic: ResearchCategoryView | null): Draft {
  const period = periodOf(topic?.gatherMinutes ?? DAY);

  return {
    name: topic?.name ?? "",
    purpose: topic?.purpose ?? "",
    instruction: topic?.instruction ?? "",
    count: period.count,
    unit: period.unit,
    writes: (topic?.calendar ?? null) !== null,
    realm: topic?.calendar?.realm ?? "mine",
    calendarId: topic?.calendar?.calendarId ?? ""
  };
}

const draft = ref<Draft>(draftOf(null));
const busy = ref(false);
const refusal = ref<string | null>(null);

const title = computed(() => (props.topic === null ? t("research.title.topic_add") : t("research.title.topic_edit", { name: props.topic.name })));
const changes = useOpenedWith(() => draft.value, { open });
const unitItems = computed(() => PERIOD_UNITS.map((one) => ({ value: one.value, label: t(one.label) })));
const realmItems = computed(() => [
  { value: "mine", label: t("research.label.calendar_mine") },
  { value: "organization", label: t("research.label.calendar_organization") }
]);

// Why a new topic's name cannot be sent, or null where it can.
const nameFault = computed<string | null>(() => {
  if (!TOPIC_NAME.test(draft.value.name)) return t("research.error.topic_name");
  if (props.taken.includes(draft.value.name)) return t("research.error.topic_taken");

  return null;
});

// The calendar the form names, or null where it writes to none; undefined while it names one with no id.
const calendar = computed<ResearchCalendar | null | undefined>(() => {
  if (!draft.value.writes) return null;

  return draft.value.calendarId.trim() === "" ? undefined : { realm: draft.value.realm, calendarId: draft.value.calendarId.trim() };
});

const complete = computed(() => draft.value.purpose.trim() !== "" && draft.value.instruction.trim() !== "" && draft.value.count !== null && draft.value.count >= 1 && calendar.value !== undefined);
const ready = computed(() => complete.value && (props.topic === null ? nameFault.value === null : changes.dirty.value));

watch(open, (opened) => {
  if (!opened) return;

  draft.value = draftOf(props.topic);
  refusal.value = null;
});

function minutes(): number {
  return periodMinutes(draft.value.count ?? 1, draft.value.unit);
}

// A registration names every field the form holds; a topic that writes to no calendar names none.
function newTopic(): ResearchNewTopic {
  return {
    name: draft.value.name,
    purpose: draft.value.purpose.trim(),
    instruction: draft.value.instruction.trim(),
    gatherMinutes: minutes(),
    ...(calendar.value == null ? {} : { calendar: calendar.value })
  };
}

// A change names only what differs from the topic as it stands; the unit keeps every field it leaves out.
function change(topic: ResearchCategoryView): ResearchTopicChange {
  const same = (one: ResearchCalendar | null, other: ResearchCalendar | null): boolean => one?.realm === other?.realm && one?.calendarId === other?.calendarId;

  return {
    ...(draft.value.purpose.trim() === topic.purpose ? {} : { purpose: draft.value.purpose.trim() }),
    ...(draft.value.instruction.trim() === (topic.instruction ?? "") ? {} : { instruction: draft.value.instruction.trim() }),
    ...(minutes() === topic.gatherMinutes ? {} : { gatherMinutes: minutes() }),
    ...(calendar.value === undefined || same(calendar.value, topic.calendar) ? {} : { calendar: calendar.value })
  };
}

async function save(): Promise<void> {
  if (!ready.value) return;

  const topic = props.topic;

  busy.value = true;
  refusal.value = null;

  try {
    const state =
      topic === null
        ? await $fetch<ResearchStateView>("/api/research/topics", { method: "POST", body: newTopic() })
        : await $fetch<ResearchStateView>(`/api/research/topics/${encodeURIComponent(topic.name)}`, { method: "PATCH", body: change(topic) });

    emit("saved", state, topic === null);
    open.value = false;
  } catch (error) {
    refusal.value = failureText(error, t("research.error.topic_save_failed"));
  } finally {
    busy.value = false;
  }
}
</script>
