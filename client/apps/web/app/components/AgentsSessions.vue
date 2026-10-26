<template>
  <!-- Every session an agent holds now (the agency's docs/session-resets.md; docs/web.md, 「Agent management screen」): one row each,
       which session it is, when it was last cleared, and a reset that asks first on its own row.
       Which sessions there are is the bot's word, read when the section stands and after a reset. -->
  <section :id="settingsAnchor('sessions')" class="flex flex-col gap-3" aria-labelledby="sessions-title">
    <h2 id="sessions-title" class="text-lg font-semibold text-highlighted">{{ generalSectionTitle($t, "sessions") }}</h2>

    <ContentSkeleton v-if="sessions === null && failed === ''" :rows="3" list-class="flex flex-col divide-y divide-default overflow-hidden rounded-lg border border-default" :label="$t('agents.status.sessions_loading')">
      <div class="flex min-h-12 items-center gap-3 px-4 py-2">
        <SkeletonBar class="size-5 shrink-0 rounded-sm" />
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <SkeletonBar class="h-4 w-2/5" />
          <SkeletonBar class="h-4 w-1/3" />
        </div>
        <SkeletonBar class="size-8 shrink-0 rounded-md" />
      </div>
    </ContentSkeleton>
    <p v-else-if="sessions === null" role="alert" class="text-sm text-error">{{ failed }}</p>
    <p v-else-if="sessions.length === 0" class="text-sm text-muted">{{ $t("agents.status.no_sessions") }}</p>
    <ul v-else class="flex flex-col divide-y divide-default overflow-hidden rounded-lg border border-default" :aria-label="generalSectionTitle($t, 'sessions')">
      <li v-for="one in sessions" :key="keyOf(one)" :data-session="keyOf(one)" class="flex flex-col gap-2 px-4 py-2">
        <div class="flex min-h-8 items-center gap-3">
          <AgentMark :agent="markOf(one)" class="text-muted" />
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="flex min-w-0 items-center gap-2">
              <SearchText class="truncate text-sm font-medium text-highlighted" :text="one.label" :query="props.query" />
              <SearchText class="truncate font-mono text-sm text-muted" :text="one.agent" :query="props.query" />
            </span>
            <span class="truncate text-sm text-muted">{{ sessionDetail($t, one) }}</span>
            <span v-if="one.lastDoneAt !== null" class="truncate text-sm tabular-nums text-muted">{{ sessionClearedAt($t, one.lastDoneAt) }}</span>
          </span>
          <UBadge v-if="one.waiting !== null" color="warning" variant="subtle" size="sm" class="shrink-0">{{ $t("agents.label.session_reset_waiting") }}</UBadge>
          <UTooltip :text="$t('agents.action.session_reset')">
            <UButton
              color="neutral"
              variant="ghost"
              size="sm"
              icon="i-material-symbols-restart-alt"
              :aria-label="$t('agents.aria.session_reset_of', { name: one.label })"
              :disabled="one.waiting !== null || confirming === keyOf(one)"
              @click="confirming = keyOf(one)"
            />
          </UTooltip>
        </div>
        <SessionResetStep v-if="confirming === keyOf(one)" :session="one" @cancel="confirming = ''" @done="void done()" />
      </li>
    </ul>
    <p v-if="sessions !== null && failed !== ''" role="alert" class="text-sm text-error">{{ failed }}</p>
  </section>
</template>

<script setup lang="ts">
import { settingsAnchor } from "~/domain/agent-settings";
import { generalSectionTitle } from "~/domain/agents";
import { failureText } from "bmo-ui/app/domain/errors";
import { sessionClearedAt, sessionDetail } from "~/domain/sessions";

import { groupIcon } from "~/domain/agents";

import type { SessionView } from "#shared/agency";
import type { AgentMarkSubject } from "~/domain/agent-face";

const props = withDefaults(defineProps<{ query?: string }>(), { query: "" });
const { t } = useI18n();

const sessions = ref<SessionView[] | null>(null);
const failed = ref("");
// The row whose reset is being asked, by its key.
const confirming = ref("");

// The agent a session is held by, as its mark draws it: a worker's with the worker mark, every other its face
// (docs/web.md, 「Profile photos」).
function markOf(one: SessionView): AgentMarkSubject {
  return { name: one.agent, label: one.label, chatId: null, group: one.kind === "worker" ? "worker" : "designated", icon: groupIcon("worker") };
}

function keyOf(one: Pick<SessionView, "agent" | "chatId">): string {
  return `${one.agent}:${one.chatId ?? ""}`;
}

async function read(): Promise<void> {
  try {
    sessions.value = await $fetch<SessionView[]>("/api/sessions");
    failed.value = "";
  } catch (error) {
    failed.value = failureText(error, t("agents.error.sessions_read_failed"));
  }
}

async function done(): Promise<void> {
  confirming.value = "";
  await read();
}

onMounted(() => void read());

defineExpose({ read });
</script>
