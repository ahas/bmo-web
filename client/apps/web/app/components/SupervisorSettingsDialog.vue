<template>
  <!-- A supervisor's settings (docs/web.md, 「Agent management screen」, the agents tab): one form with one save at its foot,
       its fields in tabs as an agent's are — its own settings and its sleep; for a supervisor whose turns its settings'
       pieces make its generation settings, reference, persona and system prompt, and for the one whose turns its window
       makes the texts its system prompt is composed of; and its own instruction stages, the draft block. Every tab stays
       mounted while another is shown, so a change made in one is kept and saved with the rest. The agents tab and the supervisor's own screen open this one
       dialog. A save sends the supervisor's change and
       then the rest; a refusal keeps every field as written with the reason under the one it names. -->
  <SettingsDialog v-model:open="open" wide :title="supervisor?.label ?? props.name" :description="supervisor === null || supervisor.label === props.name ? undefined : props.name" :dirty="form.dirty.value">
    <p v-if="failed" role="alert" class="text-sm text-error">{{ $t("agents.error.supervisors_read_failed") }}</p>
    <ContentSkeleton v-else-if="supervisor === null" :rows="3" :label="$t('agents.status.supervisors_loading')">
      <div class="flex flex-col gap-2">
        <SkeletonBar class="h-5 w-32" />
        <SkeletonBar class="h-8 w-full rounded-md" />
      </div>
    </ContentSkeleton>

    <template v-else>
    <!-- The tab row stands against the dialog's edges, its line running from side to side, and holds to the top of the
         dialog's body while a long text scrolls under it. -->
    <div :class="['sticky -top-4 z-10 -mx-4 -mt-4 h-10 shrink-0 bg-default px-2', TAB_ROW_LINE]">
      <UTabs v-model="tab" :items="tabs" :content="false" color="neutral" variant="link" size="sm" :ui="TAB_ROW_UI" :aria-label="$t('agents.aria.supervisor_tabs')" data-supervisor-tabs />
    </div>

    <div v-show="tab === 'general'" class="flex flex-col gap-8" data-supervisor-tab="general">
      <SupervisorFields :supervisor="supervisor" @saved="(saved) => (supervisor = saved)" />

      <SupervisorSleepFields :name="props.name" />
    </div>

    <div v-if="supervisor.turnShape === 'pieces' || supervisor.turnShape === 'window'" v-show="tab === 'prompt'" class="flex flex-col gap-8" data-supervisor-tab="prompt">
      <template v-if="supervisor.turnShape === 'pieces'">
        <p v-if="piecesFailed" role="alert" class="text-sm text-error">{{ $t("agents.error.supervisors_read_failed") }}</p>
        <ContentSkeleton v-else-if="pieces === null" :rows="1" :label="$t('agents.status.supervisors_loading')">
          <SkeletonBar class="h-8 w-full rounded-md" />
        </ContentSkeleton>
        <SupervisorPiecesFields v-else :view="pieces" @saved="(saved) => (pieces = saved)" />
      </template>

      <ChatDocumentsFields v-else />
    </div>

    <div v-show="tab === 'draft'" class="flex flex-col gap-8" data-supervisor-tab="draft">
      <!-- The supervisor's own instruction stages, as the receiver holds them for it. -->
      <p v-if="stagesFailed" role="alert" class="text-sm text-error">{{ $t("agents.error.stages_read_failed") }}</p>
      <ContentSkeleton v-else-if="stages === null" :rows="2" :label="$t('agents.status.stages_loading')">
        <SkeletonBar class="h-8 w-full rounded-md" />
      </ContentSkeleton>
      <SupervisorStagesFields v-else :name="props.name" :view="stages" @held="(held) => (stages = held)" />
    </div>
    </template>

    <template #footer="{ close }">
      <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="form.saving.value" @click="close()" />
      <UButton :label="$t('common.action.save')" :loading="form.saving.value" :disabled="!form.dirty.value || form.saving.value" @click="void saveAll()" />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { useFormSave } from "bmo-ui/app/domain/form-save";
import { TAB_ROW_LINE, TAB_ROW_UI } from "bmo-ui/app/domain/tabs";

import type { SupervisorSettingsView, SupervisorView } from "#shared/axes";
import type { SupervisorStagesView } from "#shared/instruction-stages";
import type { TabsItem } from "@nuxt/ui";

interface Props {
  // The supervisor's name; its settings are read each time the dialog opens.
  name: string;
  // What the screen it was opened on reads again once a save went through.
  reread?: () => Promise<void>;
}

const props = withDefaults(defineProps<Props>(), { reread: async () => {} });
const open = defineModel<boolean>("open", { required: true });

const { t } = useI18n();
const form = useFormSave(t);
const supervisor = ref<SupervisorView | null>(null);
const pieces = ref<SupervisorSettingsView | null>(null);
const stages = ref<SupervisorStagesView | null>(null);
const failed = ref(false);
const piecesFailed = ref(false);
const stagesFailed = ref(false);

// The tabs its fields stand in; the system prompt's only for a supervisor whose turns are made of pieces or a window.
type Tab = "general" | "prompt" | "draft";
const tab = ref<Tab>("general");
const tabs = computed<TabsItem[]>(() => [
  { label: t("agents.label.agent_tab_general"), value: "general" },
  ...(supervisor.value?.turnShape === "pieces" || supervisor.value?.turnShape === "window"
    ? [{ label: t("agents.label.agent_prompt"), value: "prompt" }]
    : []),
  { label: t("agents.title.draft"), value: "draft" }
]);

// The supervisor's instruction stages, read beside its own settings; a read that fails leaves the rest of the form
// standing.
async function readStages(): Promise<void> {
  try {
    stages.value = await $fetch<SupervisorStagesView>(`/api/supervisors/${encodeURIComponent(props.name)}/instruction-stages`);
  } catch {
    stagesFailed.value = true;
  }
}

async function saveAll(): Promise<void> {
  if (!(await form.save())) return;

  open.value = false;
  await props.reread();
}

// Read each time it opens, so it shows what the agency holds now, and nothing typed and thrown away before stands in
// it.
watch(open, async (now) => {
  if (!now) return;

  form.discard();
  tab.value = "general";
  failed.value = false;
  piecesFailed.value = false;
  stagesFailed.value = false;
  supervisor.value = null;
  pieces.value = null;
  stages.value = null;

  try {
    supervisor.value = await $fetch<SupervisorView>(`/api/supervisors/${encodeURIComponent(props.name)}`);
  } catch {
    failed.value = true;

    return;
  }

  void readStages();

  if (supervisor.value.turnShape !== "pieces") return;

  try {
    pieces.value = await $fetch<SupervisorSettingsView>(`/api/supervisors/${encodeURIComponent(props.name)}/settings`);
  } catch {
    piecesFailed.value = true;
  }
}, { immediate: true });
</script>
