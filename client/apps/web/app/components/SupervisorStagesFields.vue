<template>
  <!-- A supervisor's instruction stages as the draft block of its settings form (docs/web.md, 「Agent management
       screen」, the settings dialog's draft block; the receiver's `docs/instruction.md`, 「The stage chain and its
       texts」): the chain of stages its message passes before it goes out, in order, and the stages of its catalogue
       the chain does not name. The block is the supervisor's own and sets nothing for another. Every change waits for
       the form's one save; what the receiver refuses stands under the block, every field kept as written. -->
  <section class="flex min-w-0 flex-col gap-4" data-supervisor-stages :aria-labelledby="titleId">
    <div class="flex min-h-8 items-center gap-2">
      <h3 :id="titleId" class="min-w-0 flex-1 text-sm font-medium text-highlighted" data-stages-title>{{ markedDefault($t, $t("agents.title.draft"), !own) }}</h3>
      <UButton v-if="own" :label="$t('agents.action.draft_to_default')" color="neutral" variant="ghost" size="xs" :disabled="busy" data-stages-to-default @click="form = chainToPolicy(form, props.view.policy)" />
    </div>

    <div class="flex min-w-0 flex-col gap-1">
      <div class="flex min-h-8 items-center gap-2">
        <h4 :id="chainId" class="min-w-0 flex-1 text-sm font-medium text-highlighted">{{ $t("agents.label.stages") }}</h4>
        <UTooltip :text="$t('agents.action.stage_add')">
          <UButton icon="i-material-symbols-add" color="neutral" variant="ghost" size="xs" :disabled="busy || adding" :aria-label="$t('agents.action.stage_add')" data-stage-add @click="startAdding" />
        </UTooltip>
      </div>

      <!-- A stage added under a new name: it joins the catalogue and the chain's end as the form stands. What is typed
           here is a change of the form, and its save adds it before it sends. -->
      <form v-if="adding" class="flex min-w-0 flex-col gap-3 pb-3" novalidate :aria-label="$t('agents.title.stage_add')" data-stage-add-form @submit.prevent="add">
        <UFormField :label="$t('common.label.name')" name="stage-name" :error="(added.name !== '' && nameFault) || undefined">
          <UInput v-model="added.name" class="w-full font-mono sm:w-64" :maxlength="STAGE_NAME_MAX" />
        </UFormField>
        <UFormField :label="$t('agents.label.stage_text')" name="stage-text">
          <UTextarea v-model="added.text" class="w-full" :rows="4" autoresize :maxlength="STAGE_TEXT_MAX" />
        </UFormField>
        <div class="flex justify-end gap-2">
          <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" size="sm" @click="adding = false" />
          <UButton type="submit" :label="$t('common.action.add')" color="primary" variant="soft" size="sm" :disabled="addFault !== null" />
        </div>
      </form>

      <!-- The chain: each stage carried by its handle to another stage's place, by the mouse, the pen and the
           finger, or by the handle's arrow keys once it holds the focus. -->
      <ol ref="rows" class="flex flex-col gap-1" :aria-labelledby="chainId" data-stage-chain>
        <InstructionStageRow
          v-for="(stage, index) in chained"
          :key="stage.name"
          v-model:text="stage.text"
          :class="drag.mark(index)"
          :stage="stage"
          :place="index"
          :drag="drag"
          :opened="opened === stage.name"
          :disabled="busy"
          @toggle="toggle(stage.name)"
          @out="form = { ...form, stages: withoutStage(form.stages, stage.name) }"
          @default="form = stageToPolicy(form, stage.name)"
          @delete="remove(stage.name)"
        />
        <li v-if="chained.length === 0" class="text-sm text-dimmed">{{ $t("agents.label.stages_none") }}</li>
      </ol>
    </div>

    <div v-if="unchained.length > 0" class="flex min-w-0 flex-col gap-1">
      <h4 :id="restId" class="flex min-h-8 items-center text-sm font-medium text-highlighted">{{ $t("agents.label.stages_unused") }}</h4>
      <ul class="flex flex-col gap-1" :aria-labelledby="restId" data-stage-rest>
        <InstructionStageRow
          v-for="stage in unchained"
          :key="stage.name"
          v-model:text="stage.text"
          :stage="stage"
          :drag="drag"
          :opened="opened === stage.name"
          :disabled="busy"
          @toggle="toggle(stage.name)"
          @in="form = { ...form, stages: withStage(form.stages, stage.name) }"
          @default="form = stageToPolicy(form, stage.name)"
          @delete="remove(stage.name)"
        />
      </ul>
    </div>

    <p v-if="refusal !== ''" role="alert" class="break-words text-sm text-error">{{ refusal }}</p>
  </section>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { useFormPart, useOpenedWith } from "bmo-ui/app/domain/form-save";

import { markedDefault } from "~/domain/axes";
import {
  STAGE_NAME_MAX,
  STAGE_TEXT_MAX,
  chainOwn,
  chainToPolicy,
  placedStage,
  stageNameFault,
  stageTextFault,
  stageToPolicy,
  stagesChange,
  stagesFormOf,
  stagesHeld,
  withAddedStage,
  withoutAddedStage,
  withoutStage,
  withStage
} from "~/domain/instruction-stages";
import { useRowDrag } from "~/domain/row-drag";

import type { InstructionStageView, SupervisorStagesView } from "#shared/instruction-stages";
import type { StagesForm } from "~/domain/instruction-stages";

const props = defineProps<{ name: string; view: SupervisorStagesView }>();
// `held`: the stages as the receiver now holds them, after a save that went through and after one it refused part of.
const emit = defineEmits<{ held: [view: SupervisorStagesView] }>();

const { t } = useI18n();
const titleId = useId();
const chainId = useId();
const restId = useId();

const form = ref<StagesForm>(stagesFormOf(props.view));
const busy = ref(false);
const refusal = ref("");
const opened = ref<string | null>(null);

const own = computed(() => chainOwn(form.value, props.view.policy));

// The chain's stages in its order, and the catalogue's others in the catalogue's order.
const chained = computed<InstructionStageView[]>(() => form.value.stages.flatMap((name) => form.value.texts.filter((one) => one.name === name)));
const unchained = computed<InstructionStageView[]>(() => form.value.texts.filter((one) => !form.value.stages.includes(one.name)));

const rows = ref<HTMLElement | null>(null);
const drag = useRowDrag({ list: rows, ready: () => !busy.value, drop: (from, to) => (form.value = { ...form.value, stages: placedStage(form.value.stages, from, to) }) });

// Whether every text may be sent as it stands.
const sound = computed(() => form.value.texts.every((one) => stageTextFault(t, one.text) === null));

function toggle(name: string): void {
  opened.value = opened.value === name ? null : name;
}

function remove(name: string): void {
  form.value = withoutAddedStage(form.value, name);
  if (opened.value === name) opened.value = null;
}

// A stage added under a new name.
const adding = ref(false);
const added = reactive({ name: "", text: "" });
const nameFault = computed(() => stageNameFault(t, added.name, form.value.texts.map((one) => one.name)));
const addFault = computed(() => nameFault.value ?? stageTextFault(t, added.text));

// Whether the form holds a change: what the block would have the receiver hold, against what it held as the form
// opened, and a stage being added that has anything typed in it.
const changes = useOpenedWith(() => ({ held: stagesHeld(form.value, props.view.policy), added: adding.value ? { ...added } : null }));

function startAdding(): void {
  Object.assign(added, { name: "", text: "" });
  adding.value = true;
}

function add(): void {
  if (addFault.value !== null) return;

  form.value = withAddedStage(form.value, added.name, added.text);
  adding.value = false;
}

const route = computed(() => `/api/supervisors/${encodeURIComponent(props.name)}/instruction-stages`);

// A stage still being added goes in with the save, as its add would put it; one whose name or text cannot be sent
// keeps the save back.
async function save(): Promise<boolean> {
  if (adding.value && (added.name.trim() !== "" || added.text.trim() !== "")) {
    if (addFault.value !== null) {
      refusal.value = t("agents.error.stage_add_unfinished");

      return false;
    }

    add();
  }

  if (!sound.value) {
    refusal.value = t("agents.error.stages_unsound");

    return false;
  }

  busy.value = true;
  refusal.value = "";

  try {
    const answered = await $fetch<SupervisorStagesView>(route.value, { method: "PATCH", body: stagesChange(props.view, form.value) });

    form.value = stagesFormOf(answered);
    adding.value = false;
    emit("held", answered);

    return true;
  } catch (failure) {
    refusal.value = failureText(failure, t("common.error.save_failed"));
    await rereadHeld();

    return false;
  } finally {
    busy.value = false;
  }
}

// The save is several writes, and one refused leaves those before it written: the stages are read again, so what was
// saved stands as saved and a save after works from what the receiver holds. The fields stay as written.
async function rereadHeld(): Promise<void> {
  try {
    emit("held", await $fetch<SupervisorStagesView>(route.value));
  } catch {
    // The view as it was read stands; the refusal already says the save did not go through.
  }
}

useFormPart({
  dirty: changes,
  save,
  discard: () => {
    form.value = stagesFormOf(props.view);
    refusal.value = "";
    opened.value = null;
    adding.value = false;
  }
});
</script>
