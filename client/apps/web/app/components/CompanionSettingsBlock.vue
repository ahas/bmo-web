<template>
  <!-- One companion's settings (docs/web.md, 「Agent management screen」, the supervisors tab): its picture, how its
       model is asked, whether a turn is given its reference, its persona, the system prompt its next request sends and
       its room sessions. Its provider order is the supervisor's own, set above it. The block is part of the form around
       it (「Forms」): what is changed here waits for that form's one save, which goes to the agency, keeps the change
       with who made it, and the block then stands as the agency answered. -->
  <section class="flex flex-col gap-6" :data-companion="view.agent" :aria-labelledby="`companion-${view.agent}`">
    <header v-if="!props.bare" class="flex min-h-8 items-center gap-2">
      <UIcon :name="view.icon ?? 'i-material-symbols-person-outline'" class="size-5 shrink-0 text-muted" />
      <h2 :id="`companion-${view.agent}`" class="text-lg font-semibold text-highlighted">{{ view.label }}</h2>
      <span class="font-mono text-sm text-muted">{{ view.agent }}</span>
      <!-- What the list around it offers on the companion as a whole. -->
      <div v-if="$slots.actions" class="ms-auto flex items-center gap-1">
        <slot name="actions" />
      </div>
    </header>

    <!-- Its picture, set in the console and saved at once, apart from the form's one save (docs/web.md, 「Profile
         photos」). -->
    <div class="flex flex-col gap-2">
      <h3 class="text-sm font-medium text-highlighted">{{ $t("picture.label.agent") }}</h3>
      <PictureSetting kind="agent" :subject="view.agent" :avatar="picture" />
    </div>

    <!-- The generation parameters: how its answers are sampled, each setting with what it is for and its bounds in
         full sight beside its box, an empty box the engine's own default. -->
    <div class="flex flex-col gap-2">
      <h3 :id="`generation-${view.agent}`" class="text-sm font-medium text-highlighted">{{ $t("agents.label.generation") }}</h3>
      <p v-if="differs('generation') && view.sessions.length > 0" class="text-sm text-muted">
        {{ $t("agents.message.generation_resets", { n: countText(view.sessions.length) }) }}
      </p>
      <GenerationFields v-model="draft.generation" :settings="view.generationSettings" :id-prefix="`generation-${view.agent}`" :labelledby="`generation-${view.agent}`" :disabled="busy" :refusal-at="refusalAt" />
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

    <!-- The room sessions: when each room's system prompt last changed, and its reset, asked first on its own
         row. A reset is an action, not a setting, and goes as it is asked. -->
    <div v-if="view.sessions.length > 0" class="flex flex-col gap-2">
      <h3 class="text-sm font-medium text-highlighted">{{ $t("agents.label.room_sessions") }}</h3>
      <ul class="flex flex-col gap-1 text-sm">
        <li v-for="one in view.sessions" :key="one.chatId" class="flex flex-col gap-2">
          <div class="flex min-h-8 min-w-0 items-center gap-2">
            <span class="min-w-0 truncate text-highlighted">{{ one.title ?? one.chatId }}</span>
            <span class="shrink-0 tabular-nums text-muted">{{ $t("agents.label.generation_of", { generation: countText(one.generation) }) }}</span>
            <span class="ms-auto shrink-0 tabular-nums text-muted">{{ one.systemResetAt === null ? "—" : $t("agents.label.reset_at", { time: timeText(one.systemResetAt) }) }}</span>
            <UBadge v-if="one.resetWaiting" color="warning" variant="subtle" size="sm" class="shrink-0">{{ $t("agents.label.session_reset_waiting") }}</UBadge>
            <UTooltip :text="$t('agents.action.session_reset')">
              <UButton
                color="neutral"
                variant="ghost"
                size="sm"
                icon="i-material-symbols-restart-alt"
                :aria-label="$t('agents.aria.session_reset_of', { name: one.title ?? String(one.chatId) })"
                :disabled="one.resetWaiting || resetting === one.chatId"
                @click="resetting = one.chatId"
              />
            </UTooltip>
          </div>
          <SessionResetStep
            v-if="resetting === one.chatId"
            :session="{ agent: view.agent, chatId: one.chatId, kind: 'companion', running: false, models: [], title: one.title, generation: one.generation }"
            @cancel="resetting = null"
            @done="void sessionCleared()"
          />
        </li>
      </ul>
    </div>

    <!-- A refusal naming a field this block does not show stands at its end. -->
    <p v-if="refusal !== null && !SHOWN_FIELDS.has(refusal.field) && !generationNames.has(refusal.field)" role="alert" class="break-words text-sm text-error">{{ refusal.text }}</p>

    <SettingsDialog v-model:open="systemOpen" :title="$t('agents.label.system_prompt_sent')" :description="`${countText(view.system.characters)}${$t('agents.label.characters_unit')} · sha256 ${view.system.hash.slice(0, 12)}`">
      <pre class="whitespace-pre-wrap break-words font-mono text-sm text-toned">{{ view.system.text }}</pre>
    </SettingsDialog>
  </section>
</template>

<script setup lang="ts">
import { companionChange, companionDraft, draftDiffers } from "~/domain/companions";
import { countText } from "~/domain/numbers";
import { failureText } from "bmo-ui/app/domain/errors";
import { useFormPart } from "bmo-ui/app/domain/form-save";
import { useAgentFace } from "~/domain/agent-face";

import type { CompanionView } from "#shared/agency";
import type { CompanionDraft } from "~/domain/companions";

interface Props {
  view: CompanionView;
  // Shown inside a dialog that already names the companion, the block's own header is left out.
  bare?: boolean;
}

const props = withDefaults(defineProps<Props>(), { bare: false });
const emit = defineEmits<{ saved: [view: CompanionView] }>();

// The companion's face as every screen draws it, which its picture setting shows and replaces.
const faceOf = useAgentFace();
const picture = computed(() => faceOf.value({ name: props.view.agent, label: props.view.label, chatId: null, group: "supervisor" }) ?? { alt: props.view.label, text: props.view.label.slice(0, 1) });
const { t } = useI18n();

const view = computed(() => props.view);

// The fields as the agency holds them, and as the form holds them until it saves.
const saved = computed<CompanionDraft>(() => companionDraft(view.value));
const draft = ref<CompanionDraft>(companionDraft(view.value));
const KEYS = Object.keys(draft.value) as (keyof CompanionDraft)[];

// The block is read again — after a save, on a refresh — and a field nobody touched takes what it says now, while one
// being written keeps what was written.
watch(() => JSON.stringify(saved.value), (_now, beforeText) => {
  const before = JSON.parse(beforeText) as CompanionDraft;
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

const differs = (key: keyof CompanionDraft): boolean => draftDiffers(key, draft.value, saved.value);
const dirty = computed(() => KEYS.some(differs));

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

async function reread(): Promise<CompanionView> {
  return (await $fetch<CompanionView[]>("/api/companions")).find((one) => one.agent === view.value.agent) ?? view.value;
}

// One save of everything changed, in one change the agency checks whole. A refusal stands beside what it was about.
// Once it went through, the block holds what the agency answered, so it holds no change after.
async function save(): Promise<boolean> {
  const change = companionChange(draft.value, saved.value);
  const keys = Object.keys(change);

  if (keys.length === 0) return true;

  busy.value = true;
  refusal.value = null;

  try {
    const latest = await $fetch<CompanionView>("/api/companions", { method: "POST", body: { agent: view.value.agent, ...change } });

    draft.value = companionDraft(latest);
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

function timeText(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const systemOpen = ref(false);

// The room whose session reset is being asked, by its number.
const resetting = ref<number | null>(null);

async function sessionCleared(): Promise<void> {
  resetting.value = null;
  emit("saved", await reread());
}
</script>
