<template>
  <!-- A supervisor's nightly sleep as a block of its settings form (docs/web.md, 「Agent management screen」, the
       supervisors tab; the agency's docs/sleep.md, 「Its setting」): whether it sleeps and at what hour, the agency's
       hour marked as the default, and the night it last slept. Every change waits for the form's one save. -->
  <section class="flex min-w-0 flex-col gap-3" data-sleep-fields>
    <h3 class="text-sm font-medium text-highlighted">{{ $t("agents.title.sleep") }}</h3>
    <p v-if="failed" role="alert" class="text-sm text-error">{{ $t("agents.error.sleep_read_failed") }}</p>
    <ContentSkeleton v-else-if="draft === null || held === null" :rows="1" :label="$t('agents.status.sleep_loading')">
      <SkeletonBar class="h-8 w-full rounded-md" />
    </ContentSkeleton>
    <template v-else>
      <div class="flex min-h-10 items-center justify-between gap-3">
        <span class="text-sm text-toned">{{ $t("agents.label.sleep_on") }}</span>
        <USwitch v-model="draft.on" :disabled="busy" :aria-label="$t('agents.label.sleep_on')" />
      </div>
      <UFormField :label="$t('agents.label.sleep_hour')" name="hour" :error="refusal ?? undefined">
        <ChoiceSelect v-model="hourChoice" :items="hourItems" value-key="value" class="w-full" :disabled="busy || !draft.on" :aria-label="$t('agents.label.sleep_hour')" />
      </UFormField>
      <p class="text-sm text-muted">
        {{ held.sleptOn === null ? $t("agents.message.sleep_never") : $t("agents.message.sleep_last", { date: held.sleptOn }) }}
      </p>
    </template>
  </section>
</template>

<script setup lang="ts">
import { useFormPart, useOpenedWith } from "bmo-ui/app/domain/form-save";

import { markedDefault, refusalOf } from "~/domain/axes";

import type { SupervisorSleepView } from "#shared/agency";

const props = defineProps<{ name: string }>();

const { t } = useI18n();

interface Draft {
  on: boolean;
  // Its own hour, none for the agency's.
  hour: number | null;
}

const held = ref<SupervisorSleepView | null>(null);
const draft = ref<Draft | null>(null);
const failed = ref(false);
const busy = ref(false);
const refusal = ref<string | null>(null);

const address = computed(() => `/api/supervisors/${encodeURIComponent(props.name)}/sleep`);

function draftOf(view: SupervisorSleepView): Draft {
  return { on: view.on, hour: view.hour };
}

// Each hour of the day, the agency's own marked as the default; choosing it follows the agency's hour.
const hourItems = computed(() => {
  const fallback = held.value?.defaultHour ?? 4;

  return Array.from({ length: 24 }, (_, hour) => ({
    label: markedDefault(t, `${String(hour).padStart(2, "0")}:00`, hour === fallback),
    value: hour
  }));
});

const hourChoice = computed<number>({
  get: () => draft.value?.hour ?? held.value?.defaultHour ?? 4,
  set: (hour) => {
    if (draft.value === null) return;
    draft.value = { ...draft.value, hour: hour === held.value?.defaultHour ? null : hour };
  }
});

async function read(): Promise<void> {
  try {
    const view = await $fetch<SupervisorSleepView>(address.value);

    held.value = view;
    draft.value = draftOf(view);
    failed.value = false;
  } catch {
    failed.value = true;
  }
}

const changes = useOpenedWith(() => draft.value);

async function save(): Promise<boolean> {
  if (draft.value === null) return true;

  busy.value = true;
  refusal.value = null;

  try {
    const view = await $fetch<SupervisorSleepView>(address.value, { method: "PUT", body: draft.value });

    held.value = view;
    draft.value = draftOf(view);

    return true;
  } catch (failure) {
    refusal.value = refusalOf(t, failure).text;

    return false;
  } finally {
    busy.value = false;
  }
}

useFormPart({
  dirty: changes,
  save,
  discard: () => {
    draft.value = held.value === null ? null : draftOf(held.value);
    refusal.value = null;
  }
});

onMounted(() => void read());
</script>
