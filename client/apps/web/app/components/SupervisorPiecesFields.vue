<template>
  <!-- A supervisor's own settings, for one whose turns its settings' pieces make (docs/web.md, 「Agent management
       screen」, the settings dialog): how its answers are sampled, whether a turn is given its reference, its persona
       and the system prompt its next turn sends. The fields are part of the form around them (「Forms」): what is changed
       here waits for that form's one save, which goes to the agency, keeps the change with who made it, and the fields
       then stand as the agency answered. -->
  <section class="flex flex-col gap-6" :aria-label="$t('agents.label.generation')">
    <!-- The generation parameters: how its answers are sampled, each setting with what it is for and its bounds in
         full sight beside its box, an empty box the engine's own default. -->
    <div class="flex flex-col gap-2">
      <h3 :id="`generation-${view.name}`" class="text-sm font-medium text-highlighted">{{ $t("agents.label.generation") }}</h3>
      <p v-if="draftDiffers('generation', draft, saved) && view.sessions > 0" class="text-sm text-muted">
        {{ $t("agents.message.generation_resets", { n: countText(view.sessions) }) }}
      </p>
      <GenerationFields v-model="draft.generation" :settings="view.generationSettings" :id-prefix="`generation-${view.name}`" :labelledby="`generation-${view.name}`" :disabled="busy" :refusal-at="refusalAt" />
      <p v-if="refusalAt('generation') !== ''" role="alert" class="break-words text-sm text-error">{{ refusalAt("generation") }}</p>
    </div>

    <!-- The reference injection: whether a turn is given its reference block. -->
    <div class="flex flex-col gap-2">
      <div class="flex min-h-8 items-center gap-2">
        <h3 class="text-sm font-medium text-highlighted">{{ $t("agents.label.reference") }}</h3>
        <USwitch v-model="draft.referenceOn" class="ms-auto" :disabled="busy" :label="$t('agents.label.reference_send')" />
      </div>
      <p v-if="refusalAt('referenceOn') !== ''" role="alert" class="break-words text-sm text-error">{{ refusalAt("referenceOn") }}</p>
    </div>

    <!-- The persona: its own text, or its file's. -->
    <div class="flex flex-col gap-2">
      <div class="flex min-h-8 items-center gap-2">
        <h3 class="text-sm font-medium text-highlighted">{{ $t("agents.label.piece_persona") }}</h3>
        <UBadge v-if="draft.persona === null" color="neutral" variant="subtle" size="sm">{{ $t("agents.label.persona_file") }}</UBadge>
      </div>
      <GrowingTextarea v-model="persona" :rows="4" :disabled="busy" :aria-label="$t('agents.label.piece_persona')" />
      <p v-if="refusalAt('persona') !== ''" role="alert" class="break-words text-sm text-error">{{ refusalAt("persona") }}</p>
      <div v-if="draft.persona !== null" class="flex justify-end">
        <UButton color="neutral" variant="ghost" :label="$t('agents.action.persona_to_file')" :disabled="busy" @click="draft.persona = null" />
      </div>
    </div>

    <!-- The system prompt to send: what the next turn sends, as the settings saved make it. -->
    <div class="flex min-h-8 items-center gap-2">
      <h3 class="shrink-0 text-sm font-medium text-highlighted">{{ $t("agents.label.system_prompt_sent") }}</h3>
      <span class="min-w-0 truncate text-sm tabular-nums text-muted">
        {{ `${countText(view.system.characters)}${$t("agents.label.characters_unit")} · sha256 ${view.system.hash.slice(0, 12)}` }}
      </span>
      <UTooltip :text="$t('agents.action.expand')">
        <UButton class="ms-auto" color="neutral" variant="ghost" size="sm" icon="i-material-symbols-open-in-full" :aria-label="$t('agents.action.expand')" @click="systemOpen = true" />
      </UTooltip>
    </div>

    <!-- A refusal naming a field these settings do not show stands at their end. -->
    <p v-if="refusal !== null && !SHOWN_FIELDS.has(refusal.field) && !generationNames.has(refusal.field)" role="alert" class="break-words text-sm text-error">{{ refusal.text }}</p>

    <SettingsDialog v-model:open="systemOpen" :title="$t('agents.label.system_prompt_sent')" :description="`${countText(view.system.characters)}${$t('agents.label.characters_unit')} · sha256 ${view.system.hash.slice(0, 12)}`">
      <pre class="whitespace-pre-wrap break-words font-mono text-sm text-toned">{{ view.system.text }}</pre>
    </SettingsDialog>
  </section>
</template>

<script setup lang="ts">
import { draftDiffers, piecesChange, piecesDraft } from "~/domain/generation";
import { countText } from "~/domain/numbers";
import { failureText } from "bmo-ui/app/domain/errors";
import { useFormPart } from "bmo-ui/app/domain/form-save";

import type { SupervisorSettingsView } from "#shared/axes";
import type { PiecesDraft } from "~/domain/generation";

const props = defineProps<{ view: SupervisorSettingsView }>();
const emit = defineEmits<{ saved: [view: SupervisorSettingsView] }>();

const { t } = useI18n();

const view = computed(() => props.view);

// The fields as the agency holds them, and as the form holds them until it saves.
const saved = computed<PiecesDraft>(() => piecesDraft(view.value));
const draft = ref<PiecesDraft>(piecesDraft(view.value));
const KEYS = Object.keys(draft.value) as (keyof PiecesDraft)[];

// The settings are read again — after a save, on a refresh — and a field nobody touched takes what it says now, while
// one being written keeps what was written.
watch(() => JSON.stringify(saved.value), (_now, beforeText) => {
  const before = JSON.parse(beforeText) as PiecesDraft;
  const next = { ...draft.value };

  for (const key of KEYS) {
    if (JSON.stringify(draft.value[key]) === JSON.stringify(before[key])) (next as Record<string, unknown>)[key] = structuredClone(toRaw(saved.value[key]));
  }
  draft.value = next;
});

const persona = computed({
  get: () => draft.value.persona ?? view.value.personaFile,
  set: (text: string) => {
    draft.value.persona = text;
  },
});

const dirty = computed(() => KEYS.some((key) => draftDiffers(key, draft.value, saved.value)));

const busy = ref(false);
const refusal = ref<{ field: string; text: string } | null>(null);

// The fields that carry a refusal of their own under them.
const SHOWN_FIELDS = new Set(["generation", "referenceOn", "persona"]);
const generationNames = computed(() => new Set(view.value.generationSettings.map((one) => one.name)));

function refusalAt(field: string): string {
  return refusal.value?.field === field ? refusal.value.text : "";
}

function fieldOf(error: unknown, fallback: string): string {
  const field = (error as { data?: { data?: { field?: unknown } } } | null)?.data?.data?.field;

  return typeof field === "string" ? field : fallback;
}

// One save of everything changed, in one change the agency checks whole. A refusal stands beside what it was about.
// Once it went through, the fields hold what the agency answered, so they hold no change after.
async function save(): Promise<boolean> {
  const change = piecesChange(draft.value, saved.value);
  const keys = Object.keys(change);

  if (keys.length === 0) return true;

  busy.value = true;
  refusal.value = null;

  try {
    const latest = await $fetch<SupervisorSettingsView>(`/api/supervisors/${encodeURIComponent(view.value.name)}/settings`, { method: "PATCH", body: change });

    draft.value = piecesDraft(latest);
    emit("saved", latest);

    return true;
  } catch (error) {
    refusal.value = { field: fieldOf(error, keys.length === 1 ? keys[0]! : "agent"), text: failureText(error, t("common.error.save_failed")) };

    return false;
  } finally {
    busy.value = false;
  }
}

function discard(): void {
  draft.value = structuredClone(toRaw(saved.value));
  refusal.value = null;
}

useFormPart({ dirty: () => dirty.value, save, discard });

const systemOpen = ref(false);
</script>
