<template>
  <!-- An agent of any kind registered through the agency (docs/web.md, 「Agent management screen」):
       its key, label, kind and role, and the fields its kind takes. The agency judges each field and a refusal
       stands under the field it names. -->
  <SettingsDialog v-model:open="open" :title="$t('agents.title.agent_add')" :dirty="dirty">
    <form id="agent-add-form" class="flex flex-col gap-4" @submit.prevent="void add()">
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField :label="$t('agents.label.key')" name="name" :error="errorAt('name')">
          <UInput v-model="draft.name" class="w-full font-mono" :aria-label="$t('agents.label.key')" />
        </UFormField>
        <UFormField :label="$t('common.label.name')" name="label" :error="errorAt('label')">
          <UInput v-model="draft.label" class="w-full" :aria-label="$t('common.label.name')" />
        </UFormField>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField :label="$t('agents.label.agent_kind')" name="kind" :error="errorAt('kind')">
          <USelect v-model="draft.kind" :items="kindItems" value-key="value" class="w-full" :aria-label="$t('agents.label.agent_kind')" />
        </UFormField>
        <UFormField :label="$t('agents.label.agent_role')" name="role" :error="errorAt('role')">
          <USelect v-model="draft.role" :items="roleItems" value-key="value" class="w-full" :aria-label="$t('agents.label.agent_role')" />
        </UFormField>
      </div>

      <div v-if="draft.kind === 'chat'" class="grid gap-4 sm:grid-cols-3">
        <UFormField :label="$t('agents.label.column_provider')" name="provider" :error="errorAt('provider')">
          <USelect v-model="draft.provider" :items="providerItems" value-key="value" class="w-full" :aria-label="$t('agents.label.column_provider')" />
        </UFormField>
        <UFormField :label="$t('common.label.model')" name="model" :error="errorAt('model')">
          <UInput v-model="draft.model" class="w-full font-mono" :aria-label="$t('common.label.model')" />
        </UFormField>
        <UFormField :label="$t('agents.label.companion_worker')" name="worker" :error="errorAt('worker')">
          <USelect v-model="draft.worker" :items="workerItems" value-key="value" class="w-full" :aria-label="$t('agents.label.companion_worker')" />
        </UFormField>
      </div>

      <div v-if="draft.kind === 'worker'" class="grid gap-4 sm:grid-cols-2">
        <UFormField :label="$t('agents.label.agent_cwd')" name="cwd" :error="errorAt('cwd')">
          <UInput v-model="draft.cwd" class="w-full font-mono" :aria-label="$t('agents.label.agent_cwd')" />
        </UFormField>
        <UFormField :label="$t('agents.label.agent_node')" name="nodeName" :error="errorAt('nodeName')">
          <UInput v-model="draft.nodeName" class="w-full font-mono" :aria-label="$t('agents.label.agent_node')" />
        </UFormField>
      </div>

      <p v-if="refusal !== null && !FIELDS.has(refusal.field)" role="alert" class="break-words text-sm text-error">{{ refusal.text }}</p>
    </form>

    <template #footer="{ close }">
      <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="busy" @click="close()" />
      <UButton type="submit" form="agent-add-form" :label="$t('common.action.add')" :loading="busy" :disabled="busy || draft.name.trim() === '' || draft.label.trim() === ''" />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import type { AgentRegistered, OrderedProvider, RoleView } from "#shared/types";

const props = defineProps<{
  // Every role the bot declares, in its order.
  roles: readonly RoleView[];
  // The providers in the owner's order, which a conversing agent may be pinned to.
  providers: readonly OrderedProvider[];
  // The workers a conversing agent's items may go to.
  workers: readonly { name: string; label: string }[];
}>();

const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ added: [AgentRegistered] }>();

const { t } = useI18n();

// The kinds the agency registers, each said in the pack's words.
const KINDS = ["chat", "worker", "runner", "gate"] as const;
const KIND_LABELS: Record<(typeof KINDS)[number], string> = {
  chat: "agents.label.agent_kind_chat",
  worker: "agents.label.agent_kind_worker",
  runner: "agents.label.agent_kind_runner",
  gate: "agents.label.agent_kind_gate"
};
const FIELDS = new Set(["name", "label", "kind", "role", "provider", "model", "worker", "cwd", "nodeName"]);
// The value a choice stands at where nothing is chosen, so the agency's own default for the kind stands.
const NONE = "";

function emptyDraft() {
  return { name: "", label: "", kind: "worker" as (typeof KINDS)[number], role: NONE, provider: NONE, model: "", worker: NONE, cwd: "", nodeName: "" };
}

const draft = ref(emptyDraft());
const busy = ref(false);
const refusal = ref<{ field: string; text: string } | null>(null);
const dirty = computed(() => JSON.stringify(draft.value) !== JSON.stringify(emptyDraft()));

const kindItems = computed(() => KINDS.map((kind) => ({ label: t(KIND_LABELS[kind]), value: kind })));
const roleItems = computed(() => [{ label: t("agents.label.agent_role_default"), value: NONE }, ...props.roles.map((role) => ({ label: role.label, value: role.name }))]);
const providerItems = computed(() => [{ label: t("agents.label.agent_role_default"), value: NONE }, ...props.providers.map((one) => ({ label: one.label, value: one.name }))]);
const workerItems = computed(() => [{ label: t("agents.label.agent_role_default"), value: NONE }, ...props.workers.map((one) => ({ label: one.label, value: one.name }))]);

watch(open, (opened) => {
  if (!opened) return;

  draft.value = emptyDraft();
  refusal.value = null;
});

function errorAt(field: string): string | undefined {
  return refusal.value?.field === field ? refusal.value.text : undefined;
}

async function add(): Promise<void> {
  busy.value = true;
  refusal.value = null;

  try {
    const added = await $fetch<AgentRegistered>("/api/agents", { method: "POST", body: draft.value });

    emit("added", added);
    open.value = false;
  } catch (error) {
    const data = (error as { data?: { data?: { field?: unknown; code?: unknown } } } | null)?.data?.data;
    const field = data?.code === "name-taken" ? "name" : typeof data?.field === "string" ? data.field : "";

    refusal.value = { field, text: failureText(error, t("agents.error.agent_add_refused")) };
  } finally {
    busy.value = false;
  }
}
</script>
