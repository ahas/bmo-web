<template>
  <!-- A supervisor's session handed over or reset (docs/web.md, 「A supervisor's session handed over or reset」): one
       dialog every place offering the two acts opens alike. It names what the act does, says the room's record stays,
       takes a short reason for a handover, and is closed by what the unit answered, said in a notice. -->
  <SettingsDialog v-model:open="open" :title="title" :dirty="props.ask?.kind === 'handoff' && reason.trim() !== ''">
    <form :id="FORM" class="flex flex-col gap-4" data-agent-session-dialog :data-kind="props.ask?.kind" @submit.prevent="void send()">
      <UFormField v-if="(props.ask?.agents.length ?? 0) > 1" :label="$t('agent_session.label.agent')" name="agent">
        <ChoiceSelect v-model="agent" :items="agentItems" value-key="value" class="w-full" :aria-label="$t('agent_session.label.agent')" data-agent-session-agent />
      </UFormField>
      <p class="whitespace-pre-line break-words text-sm text-default" data-agent-session-effect>{{ effect }}</p>
      <p class="whitespace-pre-line break-words text-sm text-muted" data-agent-session-stays>{{ $t("agent_session.message.record_stays") }}</p>
      <UFormField v-if="props.ask?.kind === 'handoff'" :label="$t('agent_session.label.reason')" name="reason" required>
        <UInput
          v-model="reason"
          class="w-full"
          :maxlength="REASON_LIMIT"
          :placeholder="$t('agent_session.placeholder.reason')"
          :aria-label="$t('agent_session.label.reason')"
          data-agent-session-reason
        />
        <template #hint>
          <span class="tabular-nums">{{ $t("agent_session.label.reason_count", { n: [...reason].length, max: REASON_LIMIT }) }}</span>
        </template>
      </UFormField>
      <p v-if="failure !== ''" role="alert" class="break-words text-sm text-error" data-agent-session-failure>{{ failure }}</p>
    </form>
    <template #footer="{ close }">
      <UButton color="neutral" variant="ghost" :label="$t('common.action.cancel')" :disabled="busy" @click="close()" />
      <UButton
        type="submit"
        :form="FORM"
        :color="props.ask?.kind === 'reset' ? 'error' : 'primary'"
        :label="props.ask?.kind === 'reset' ? $t('agent_session.action.confirm_reset') : $t('agent_session.action.confirm_handoff')"
        :loading="busy"
        :disabled="busy || agent === '' || (props.ask?.kind === 'handoff' && reason.trim() === '')"
        data-agent-session-confirm
      />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { useIsland } from "bmo-ui/app/domain/island";

import { agentLabel } from "~/domain/agents";
import { useAgentCatalogue } from "~/domain/catalogue";

import type { AgentSessionAsk } from "~/domain/agent-session";
import type { SessionActAnswer } from "#shared/types";

interface Props {
  // What is asked, or nothing while the dialog stands closed.
  ask: AgentSessionAsk | null;
}

const props = defineProps<Props>();
const open = defineModel<boolean>("open", { default: false });

const { t } = useI18n();
const island = useIsland(t);
const { agents: catalogue } = useAgentCatalogue();

// The form's id, and the longest reason the console's server takes.
const FORM = "agent-session-form";
const REASON_LIMIT = 200;

const agent = ref("");
const reason = ref("");
const busy = ref(false);
const failure = ref("");

// Each opening starts from the first agent offered and an empty reason.
watch(
  () => [open.value, props.ask] as const,
  ([standing, ask]) => {
    if (!standing || ask === null) return;

    agent.value = ask.agents[0] ?? "";
    reason.value = "";
    failure.value = "";
  },
  { immediate: true }
);

const label = (name: string): string => agentLabel(t, name, catalogue.value.agents);
const agentItems = computed(() => (props.ask?.agents ?? []).map((name) => ({ label: label(name), value: name })));
const title = computed(() =>
  props.ask === null ? "" : t(props.ask.kind === "reset" ? "agent_session.title.reset" : "agent_session.title.handoff", { name: label(agent.value) })
);
const effect = computed(() =>
  props.ask === null ? "" : t(props.ask.kind === "reset" ? "agent_session.message.reset_effect" : "agent_session.message.handoff_effect", { name: label(agent.value) })
);

// The act sent; what it came to is said in a notice and the dialog closes, a refusal staying in the dialog.
async function send(): Promise<void> {
  const ask = props.ask;

  if (ask === null || agent.value === "" || busy.value) return;

  busy.value = true;
  failure.value = "";

  const name = agent.value;
  const room = ask.room === null ? {} : { room: ask.room };

  try {
    const answer = await $fetch<SessionActAnswer>(`/api/agents/${encodeURIComponent(name)}/${ask.kind === "reset" ? "session-reset" : "session-handoff"}`, {
      method: "POST",
      body: ask.kind === "reset" ? room : { ...room, reason: reason.value.trim() }
    });
    const [said, detail] =
      answer.outcome === "none"
        ? ["agent_session.message.none", "agent_session.message.none_detail"]
        : ask.kind === "reset"
          ? ["agent_session.message.reset_asked", "agent_session.message.reset_asked_detail"]
          : ["agent_session.message.handoff_asked", "agent_session.message.handoff_asked_detail"];

    island.say({ title: t(said), description: t(detail, { name: label(name) }), tone: answer.outcome === "none" ? "info" : "success", duration: 8_000 });
    reason.value = "";
    open.value = false;
  } catch (error) {
    failure.value = failureText(error, t(ask.kind === "reset" ? "agent_session.error.reset_failed" : "agent_session.error.handoff_failed"));
  } finally {
    busy.value = false;
  }
}
</script>
