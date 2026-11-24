<template>
  <!-- The platform administrator's permanent delete of a person's account or of a unit with everything under it
       (docs/web.md, the organisation screen's permanent delete): what each unit would delete read first and listed unit by unit in the pack's words,
       the choices a removal asks for, and the name typed before it goes; once run, what each unit removed or where
       it stopped, with its retry carrying on from there. -->
  <SettingsDialog v-model:open="shown" :title="title" wide :dirty="dirty" data-permanent-delete>
    <ContentSkeleton v-if="view === null && failed === ''" :rows="4" listClass="flex flex-col gap-2" :label="$t('removal.status.loading')">
      <div class="flex min-h-5 items-center"><SkeletonBar class="h-4 w-64 max-w-full" /></div>
    </ContentSkeleton>

    <!-- A refusal no choice answers: its sentence alone. -->
    <p v-else-if="view !== null && outcome === null && refused !== null" role="alert" class="whitespace-pre-line break-words text-sm text-error" data-removal-refused>
      {{ refused }}
    </p>

    <template v-else-if="view !== null && outcome === null">
      <p class="whitespace-pre-line text-sm text-toned">{{ $t("removal.label.irreversible") }}</p>

      <div v-if="needsLeave" class="flex flex-col gap-2 text-sm">
        <p class="text-warning">{{ $t("removal.label.not_left") }}</p>
        <UCheckbox v-model="leave" :label="$t('removal.label.leave_first')" data-removal-leave />
      </div>

      <div v-if="people.length > 0" class="flex flex-col gap-2 text-sm">
        <p class="text-muted">{{ $t("removal.label.people", { count: countText(people.length) }) }}</p>
        <ul class="flex flex-col gap-1">
          <li v-for="person in people" :key="person.user" class="break-words text-toned">
            {{ person.left ? $t("removal.label.left_person", { name: person.name }) : person.name }}
          </li>
        </ul>
        <UCheckbox v-model="withPeople" :label="$t('removal.label.with_people')" data-removal-with-people />
      </div>

      <section v-for="one in counted" :key="one.unit" class="flex flex-col gap-1 text-sm" :data-removal-unit="one.unit">
        <h3 class="font-medium text-highlighted">{{ unitLabel(one.unit, t) }}</h3>
        <p v-if="one.state === 'unset'" class="text-muted">{{ $t("removal.label.unset") }}</p>
        <p v-else-if="one.state === 'failed'" class="text-error">{{ $t("removal.label.unread") }}</p>
        <p v-else-if="linesOf(one.counts).length === 0" class="text-muted">{{ $t("removal.label.nothing") }}</p>
        <dl v-else class="pair-list gap-x-4 gap-y-1">
          <template v-for="line in linesOf(one.counts)" :key="line.label">
            <dt class="text-muted">{{ line.label }}</dt>
            <dd class="tabular-nums text-toned">{{ countText(line.count) }}</dd>
          </template>
        </dl>
      </section>

      <div class="flex flex-col gap-2">
        <p class="break-all font-mono text-sm text-highlighted" data-removal-name>{{ view.name }}</p>
        <UFormField :label="$t('removal.label.confirm')" :help="$t('removal.label.confirm_help')" name="confirm">
          <UInput v-model="typed" class="w-full" autocomplete="off" spellcheck="false" :disabled="busy" data-removal-confirm />
        </UFormField>
      </div>
    </template>

    <!-- What the removal did, unit by unit, and where it stopped. -->
    <template v-else-if="outcome !== null">
      <p class="whitespace-pre-line text-sm" :class="outcome.finished ? 'text-toned' : 'text-error'" role="status" data-removal-result>{{ headline }}</p>

      <section v-for="person in outcome.people" :key="person.user" class="flex flex-col gap-1 text-sm">
        <h3 class="font-medium text-highlighted">{{ $t("removal.label.person", { name: person.name }) }}</h3>
        <p :class="person.finished ? 'text-muted' : 'text-error'">{{ person.finished ? $t("removal.label.removed") : $t("removal.label.failed") }}</p>
      </section>

      <section v-for="step in outcome.steps" :key="step.unit" class="flex flex-col gap-1 text-sm" :data-removal-step="step.unit">
        <h3 class="flex items-center gap-2 font-medium text-highlighted">
          <span>{{ unitLabel(step.unit, t) }}</span>
          <span class="font-normal" :class="stepTone(step.state)">{{ stepWord(step.state) }}</span>
        </h3>
        <p v-if="step.failure !== null" class="whitespace-pre-line break-words text-error">{{ failureSentence(step.failure, t) }}</p>
        <dl v-if="linesOf(step.removed).length > 0" class="pair-list gap-x-4 gap-y-1">
          <template v-for="line in linesOf(step.removed)" :key="line.label">
            <dt class="text-muted">{{ line.label }}</dt>
            <dd class="tabular-nums text-toned">{{ countText(line.count) }}</dd>
          </template>
        </dl>
      </section>
    </template>

    <p v-if="failed !== ''" role="alert" class="whitespace-pre-line break-words text-sm text-error">{{ failed }}</p>

    <template #footer="{ close }">
      <template v-if="outcome !== null">
        <UButton v-if="!outcome.finished" :label="$t('removal.action.retry')" color="error" variant="soft" :loading="busy" :disabled="busy" data-removal-retry @click="void run()" />
        <UButton :label="$t('removal.action.close')" color="neutral" variant="ghost" :disabled="busy" @click="close()" />
      </template>
      <UButton v-else-if="!offered" :label="$t('removal.action.close')" color="neutral" variant="ghost" @click="close()" />
      <template v-else>
        <UButton :label="$t('removal.action.cancel')" color="neutral" variant="ghost" :disabled="busy" @click="close()" />
        <UButton color="error" :label="$t('removal.action.delete')" :loading="busy" :disabled="busy || !ready" data-removal-run @click="void run()" />
      </template>
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { countText } from "~/domain/numbers";
import { STEP_WORDS, failureSentence, kindLines, refusalSentence, unitLabel } from "#shared/removal";

import type { AccountRemovalView, RemovalCounts, RemovalOutcome, RemovalPersonView, RemovalStepState, RemovalUnitCount, UnitRemovalView } from "#shared/removal";

interface Props {
  // What is deleted: a person's account by their user id, or a unit by its number.
  kind: "account" | "unit";
  subject: string | number;
  // The name it is shown by on the screen that opened the dialog, standing in the title until the read names it.
  name: string;
}

const props = defineProps<Props>();
const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ removed: [] }>();

const { t } = useI18n();

type View = (AccountRemovalView & { kind: "account" }) | (UnitRemovalView & { kind: "unit" });

const view = ref<View | null>(null);
const outcome = ref<RemovalOutcome | null>(null);
const failed = ref("");
const busy = ref(false);
const typed = ref("");
const leave = ref(false);
const withPeople = ref(false);

// The dialog stays open while the removal runs; every way out is held until it ends.
const shown = computed({
  get: () => open.value,
  set: (now: boolean) => {
    if (!now && busy.value) return;
    open.value = now;
  }
});

const route = computed(() => `/api/organization/${props.kind === "account" ? "users" : "units"}/${props.subject}/removal`);
const title = computed(() => t(props.kind === "account" ? "removal.title.account" : "removal.title.unit", { name: view.value?.name ?? props.name }));
const counted = computed<RemovalUnitCount[]>(() => (view.value === null ? [] : view.value.kind === "account" ? view.value.units : view.value.counted));
const people = computed<RemovalPersonView[]>(() => (view.value?.kind === "unit" ? view.value.people : []));
const needsLeave = computed(() => view.value?.kind === "account" && !view.value.left);

// A refusal a choice answers — an account not yet left, a unit holding people — is no refusal here.
const refused = computed(() => {
  const code = view.value?.refusal ?? null;

  if (code === null || code === "not-left" || code === "unit-holds-people") return null;

  return refusalSentence(code, t);
});
const offered = computed(() => view.value !== null && refused.value === null);
const ready = computed(() => view.value !== null && typed.value === view.value.name && (!needsLeave.value || leave.value) && (people.value.length === 0 || withPeople.value));
// A name typed or a choice made is held as a change until the removal has run.
const dirty = computed(() => outcome.value === null && (typed.value !== "" || leave.value || withPeople.value));

const headline = computed(() => {
  const done = outcome.value;

  if (done === null) return "";
  if (done.already) return t("removal.label.already");
  if (done.finished) return t("removal.label.finished");
  if (done.refusal !== null) return refusalSentence(done.refusal, t);

  const stoppedPerson = done.people.find((person) => !person.finished);

  if (stoppedPerson !== undefined) return t("removal.label.person_stopped", { name: stoppedPerson.name });

  const stoppedAt = done.steps.find((step) => step.state === "failed");

  return stoppedAt === undefined ? t("removal.error.run_failed") : t("removal.label.stopped", { unit: unitLabel(stoppedAt.unit, t) });
});

function linesOf(counts: RemovalCounts) {
  return kindLines(counts, t);
}

function stepWord(state: RemovalStepState): string {
  return t(STEP_WORDS[state]);
}

function stepTone(state: RemovalStepState): string {
  return state === "failed" ? "text-error" : state === "removed" ? "text-success" : "text-muted";
}

async function read(): Promise<void> {
  try {
    view.value =
      props.kind === "account"
        ? { ...(await $fetch<AccountRemovalView>(route.value)), kind: "account" }
        : { ...(await $fetch<UnitRemovalView>(route.value)), kind: "unit" };
  } catch (error) {
    failed.value = failureText(error, t("removal.error.read_failed"));
  }
}

// Read afresh each time it opens, so what it lists stands as it is now.
watch(open, (now) => {
  if (!now) return;

  view.value = null;
  outcome.value = null;
  failed.value = "";
  typed.value = "";
  leave.value = false;
  withPeople.value = false;
  void read();
}, { immediate: true });

async function run(): Promise<void> {
  if (view.value === null) return;

  busy.value = true;
  failed.value = "";

  try {
    const body = props.kind === "account" ? { confirm: typed.value, leave: leave.value } : { confirm: typed.value, withPeople: withPeople.value };

    outcome.value = await $fetch<RemovalOutcome>(route.value, { method: "POST", body });

    if (outcome.value.finished) emit("removed");
  } catch (error) {
    failed.value = failureText(error, t("removal.error.run_failed"));
  } finally {
    busy.value = false;
  }
}
</script>
