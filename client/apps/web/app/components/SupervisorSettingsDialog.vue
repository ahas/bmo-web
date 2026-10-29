<template>
  <!-- The chat agent's own settings on its screen (docs/web.md, 「Agent screen」): its model, kept on the
       agency's route or on a fixed registered model, and the texts its system prompt is composed of — its
       opening, the absolute rules and the manual — each saved as the owner's own or put back to its file. -->
  <SettingsDialog v-model:open="open" :title="$t('agents.title.supervisor_settings')" :description="props.meta.label" :dirty="false">
    <div class="flex flex-col gap-8">
      <!-- The supervisor's model, one of two ways (docs/web.md, 「Agent screen」): the model agency's
           supervisor route resolves for its key, or a fixed registered model. The save reaches the next
           turn. -->
      <section class="flex flex-col gap-2" data-supervisor-model>
        <h3 class="text-sm font-medium text-highlighted">{{ $t("agents.label.supervisor_model") }}</h3>
        <USelect
          v-model="method"
          :items="methodItems"
          value-key="value"
          class="w-full sm:w-64"
          :disabled="modelBusy"
          :aria-label="$t('agents.label.supervisor_model_method')"
          data-supervisor-method
        />
        <template v-if="method === 'fixed'">
          <USelect
            v-model="registration"
            :items="registrationItems"
            value-key="value"
            class="w-full sm:w-80"
            :disabled="modelBusy || registrations === null"
            :placeholder="$t('agents.label.supervisor_model_pick')"
            :aria-label="$t('agents.label.supervisor_model_fixed')"
            data-supervisor-fixed
          />
          <p class="text-sm text-dimmed">{{ $t("agents.label.supervisor_model_fixed_help") }}</p>
        </template>
        <template v-else>
          <p class="text-sm text-highlighted" data-supervisor-model-route>{{ $t("agents.label.supervisor_model_route", { model: modelName }) }}</p>
          <p class="text-sm text-dimmed">{{ $t("agents.label.supervisor_model_route_help") }}</p>
        </template>
        <div class="flex flex-wrap items-center gap-2">
          <UButton :label="$t('common.action.save')" size="sm" :loading="modelBusy" :disabled="!modelDirty" @click="void saveModel()" />
          <NuxtLink v-if="method === 'route'" :to="`/agents?tab=routes&key=${encodeURIComponent(props.meta.name)}`" class="text-sm text-primary">{{ $t("agents.action.open_routes") }}</NuxtLink>
        </div>
        <p v-if="modelFailure !== ''" role="alert" class="break-words text-sm text-error">{{ modelFailure }}</p>
      </section>

      <section class="flex flex-col gap-4">
        <h3 class="text-sm font-medium text-highlighted">{{ $t("agents.title.chat_documents") }}</h3>
        <p class="text-sm text-dimmed">{{ $t("agents.label.chat_documents_help") }}</p>

        <p v-if="failed" role="alert" class="text-sm text-error">{{ $t("agents.error.chat_documents_read_failed") }}</p>
        <ContentSkeleton v-else-if="documents === null" :rows="3" :label="$t('agents.status.chat_documents_loading')">
          <div class="flex flex-col gap-2">
            <SkeletonBar class="h-5 w-40" />
            <SkeletonBar class="h-24 w-full rounded-md" />
          </div>
        </ContentSkeleton>

        <template v-else>
          <div v-for="document in documents" :key="document.name" data-chat-document :data-document="document.name" class="flex flex-col gap-2">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-sm font-medium text-highlighted">{{ documentLabel(document.name) }}</span>
              <UBadge
                :color="document.source === 'stored' ? 'primary' : 'neutral'"
                variant="subtle"
                size="sm"
                :label="$t(document.source === 'stored' ? 'agents.status.chat_document_stored' : 'agents.status.chat_document_file')"
              />
            </div>

            <UTextarea v-model="drafts[document.name]" :rows="10" :aria-label="documentLabel(document.name)" class="w-full font-mono" />

            <div class="flex flex-wrap items-center gap-2">
              <UButton :label="$t('common.action.save')" size="sm" :loading="busy === document.name" :disabled="busy !== '' || !dirtyOf(document)" @click="void save(document)" />
              <UButton
                v-if="document.source === 'stored'"
                :label="$t('agents.action.reset_document')"
                size="sm"
                color="neutral"
                variant="ghost"
                :disabled="busy !== ''"
                @click="void reset(document)"
              />
            </div>

            <p v-if="failure[document.name] !== undefined" role="alert" class="text-sm text-error">{{ failure[document.name] }}</p>
          </div>
        </template>
      </section>
    </div>

    <template #footer="{ close }">
      <UButton :label="$t('common.action.close')" color="neutral" variant="ghost" @click="close()" />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { useIsland } from "bmo-ui/app/domain/island";

import type { ChatDocumentView, ChatDocumentsView, ModelPage, ModelView } from "#shared/agency";
import type { AgentSummary } from "#shared/types";
import type { AgentMeta } from "~/domain/agents";

interface Props {
  meta: AgentMeta;
  agent: AgentSummary;
  reread: () => Promise<void>;
}

const props = defineProps<Props>();
const open = defineModel<boolean>("open", { required: true });

const { t } = useI18n();
const island = useIsland(t);
const NuxtLink = resolveComponent("NuxtLink");

const documents = ref<ChatDocumentView[] | null>(null);
const drafts = reactive<Record<string, string>>({});
const failure = reactive<Record<string, string | undefined>>({});
const failed = ref(false);
const busy = ref("");

// The model the agent begins on, as the bot resolved its work key on the routes tab.
const modelName = computed<string>(() => props.agent.modelLabel ?? props.agent.model ?? "—");

// The model method the supervisor stands on: its key's route, or a registered model kept as its pin.
const method = ref<"route" | "fixed">("route");
const registration = ref<string | undefined>(undefined);
const registrations = ref<ModelView[] | null>(null);
const modelBusy = ref(false);
const modelFailure = ref("");

const methodItems = computed(() => [
  { label: t("agents.label.supervisor_model_method_route"), value: "route" },
  { label: t("agents.label.supervisor_model_method_fixed"), value: "fixed" }
]);

const registrationItems = computed(() =>
  (registrations.value ?? []).map((one) => ({
    label: one.name ?? one.model,
    value: one.name ?? one.model,
    description: one.model
  }))
);

// Only a change from what the agent stands on is saved: a route against no pin, or a fixed model against
// another registration.
const modelDirty = computed<boolean>(() => {
  if (method.value === "route") return props.agent.pinnedProvider != null;

  return (
    registration.value !== undefined &&
    (props.agent.pinnedProvider !== "registered" || props.agent.pinnedModel !== registration.value)
  );
});

async function saveModel(): Promise<void> {
  modelBusy.value = true;
  modelFailure.value = "";

  try {
    await $fetch("/api/agent-model", {
      method: "POST",
      body:
        method.value === "route"
          ? { agent: props.meta.name, method: "route" }
          : { agent: props.meta.name, method: "fixed", registration: registration.value }
    });

    island.say({ title: t("agents.message.supervisor_model_saved") });
    await props.reread();
  } catch (error) {
    modelFailure.value = failureText(error, t("agents.error.supervisor_model_save_failed"));
  } finally {
    modelBusy.value = false;
  }
}

const DOCUMENT_LABELS: Record<string, string> = {
  opening: "agents.label.chat_document_opening",
  "absolute-rules": "agents.label.chat_document_absolute_rules",
  manual: "agents.label.chat_document_manual"
};

function documentLabel(name: string): string {
  const key = DOCUMENT_LABELS[name];

  return key === undefined ? name : t(key);
}

function dirtyOf(document: ChatDocumentView): boolean {
  return drafts[document.name] !== document.text;
}

// A document answered by the agency stands in the list and in the box; what was typed for it is let go.
function took(document: ChatDocumentView): void {
  const held = documents.value ?? [];
  const at = held.findIndex((one) => one.name === document.name);

  documents.value = at === -1 ? [...held, document] : held.map((one, index) => (index === at ? document : one));
  drafts[document.name] = document.text;
  failure[document.name] = undefined;
}

async function save(document: ChatDocumentView): Promise<void> {
  busy.value = document.name;

  try {
    took(await $fetch<ChatDocumentView>(`/api/chat-documents/${encodeURIComponent(document.name)}`, { method: "PATCH", body: { action: "save", text: drafts[document.name] } }));
    island.say({ title: t("agents.message.chat_document_saved", { name: documentLabel(document.name) }) });
  } catch (error) {
    failure[document.name] = failureText(error, t("agents.error.chat_document_save_failed"));
  } finally {
    busy.value = "";
  }
}

async function reset(document: ChatDocumentView): Promise<void> {
  busy.value = document.name;

  try {
    took(await $fetch<ChatDocumentView>(`/api/chat-documents/${encodeURIComponent(document.name)}`, { method: "PATCH", body: { action: "reset" } }));
    island.say({ title: t("agents.message.chat_document_reset", { name: documentLabel(document.name) }) });
  } catch (error) {
    failure[document.name] = failureText(error, t("agents.error.chat_document_save_failed"));
  } finally {
    busy.value = "";
  }
}

// Read each time it opens, so it shows what the agency holds now.
watch(open, async (now) => {
  if (!now) return;

  failed.value = false;
  documents.value = null;
  method.value = props.agent.pinnedModel == null ? "route" : "fixed";
  registration.value = props.agent.pinnedModel ?? undefined;
  modelFailure.value = "";

  try {
    registrations.value = (await $fetch<ModelPage>("/api/models")).items;
  } catch {
    registrations.value = null;
  }

  try {
    const answer = await $fetch<ChatDocumentsView>("/api/chat-documents");

    documents.value = answer.items;

    for (const document of answer.items) {
      drafts[document.name] = document.text;
      failure[document.name] = undefined;
    }
  } catch {
    failed.value = true;
  }
}, { immediate: true });
</script>
