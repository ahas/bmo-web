<template>
  <!-- One agent of a role and nothing of its role's others (docs/web.md, 「Agent management screen」, the agents tab; the
       agency's docs/role-agents.md): one form with one save at its foot, its fields in tabs — its switch and its road
       with its advisor; its sessions; the texts its system prompt is composed of, side by side with the list of them;
       and its bundles and skills. What is the role's, shared by every agent of it, is read here and changed in the
       role's own dialog, which opens over this one. -->
  <SettingsDialog v-model:open="open" wide :title="props.name ?? ''" :description="agent?.role" :dirty="changes">
    <p v-if="failed" role="alert" class="text-sm text-error">{{ $t("agents.error.roles_read_failed") }}</p>
    <ContentSkeleton v-else-if="agent === null || role === null" :rows="3" :label="$t('agents.status.roles_loading')">
      <div class="flex flex-col gap-2">
        <SkeletonBar class="h-5 w-32" />
        <SkeletonBar class="h-8 w-full rounded-md" />
      </div>
    </ContentSkeleton>

    <template v-else>
      <!-- The tab row stands against the dialog's edges, its line running from side to side, and holds to the top of
           the dialog's body while a long text scrolls under it. -->
      <div :class="['sticky -top-4 z-10 -mx-4 -mt-4 h-10 shrink-0 bg-default px-2', TAB_ROW_LINE]">
        <UTabs v-model="tab" :items="tabs" :content="false" color="neutral" variant="link" size="sm" :ui="TAB_ROW_UI" :aria-label="$t('agents.aria.agent_tabs')" data-agent-tabs />
      </div>

      <form :id="formId" class="flex min-w-0 flex-col gap-4" data-agent-settings @submit.prevent="void save()">
        <template v-if="tab === 'general'">
          <div class="flex min-w-0 items-center gap-2">
            <USwitch v-model="form.enabled" :label="$t('agents.label.column_enabled')" :disabled="busy" data-agent-enabled />
            <UBadge
              v-if="agent.carries"
              color="primary"
              variant="subtle"
              size="sm"
              icon="i-material-symbols-progress-activity"
              :ui="{ leadingIcon: 'animate-spin motion-reduce:animate-none' }"
              :label="$t('agents.label.agent_carries')"
            />
          </div>
          <RoadField v-model="form.road" :line="role.line" follows :refusal="refusal" :disabled="busy" />
          <!-- A road it names is its fallback where it follows the supervisor that asks it; one naming none follows
               always. -->
          <UFormField v-if="form.road.provider !== ''" :label="$t('agents.label.agent_follows')" name="followsAsker" :error="errorAt('followsAsker')">
            <ChoiceSelect v-model="form.follows" :items="followItems" value-key="value" class="w-full sm:w-48" :disabled="busy" :aria-label="$t('agents.label.agent_follows')" data-agent-follows />
          </UFormField>
        </template>

        <template v-else-if="tab === 'sessions'">
          <UFormField :label="$t('agents.label.column_sessions')" name="sessions" :error="errorAt('sessions')">
            <ChoiceSelect v-model="form.sessions" :items="sessionItems" value-key="value" class="w-full sm:w-48" :disabled="busy" :aria-label="$t('agents.label.column_sessions')" />
          </UFormField>
          <UFormField :label="$t('agents.label.column_threshold')" name="foldRatio" :error="errorAt('foldRatio')">
            <NumberInput
              :model-value="form.threshold ?? undefined"
              :digits="9"
              unit="%"
              :min="1"
              :max="100"
              :step="1"
              :placeholder="thresholdPlaceholder"
              :disabled="busy"
              :aria-label="$t('agents.label.column_threshold')"
              @update:model-value="(value: number | null | undefined) => (form.threshold = value ?? null)"
            />
          </UFormField>
          <USwitch v-model="form.keepsCache" :label="$t('agents.label.agent_keeps_cache')" :description="$t('agents.label.agent_keeps_cache_hint')" :ui="{ description: 'whitespace-pre-line break-keep' }" :disabled="busy" />
        </template>

        <!-- The texts the system prompt is composed of: the list at the left and the chosen one's text beside it, a
             select over the text on a phone. -->
        <div v-else-if="tab === 'prompt'" class="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start" data-agent-prompts>
          <!-- The list holds under the tab row while a long text scrolls beside it. -->
          <div class="hidden w-48 shrink-0 sm:sticky sm:top-10 sm:block" data-agent-prompt-list>
            <UNavigationMenu :items="sectionLinks" orientation="vertical" :aria-label="$t('agents.label.agent_prompt')" />
          </div>
          <ChoiceSelect v-model="section" :items="sectionItems" value-key="value" class="w-full sm:hidden" :aria-label="$t('agents.label.agent_prompt')" data-agent-prompt-select />

          <div class="flex min-w-0 flex-1 flex-col gap-2" :data-agent-prompt-section="section">
            <UFormField v-if="section === OWN" :label="$t('agents.label.agent_prompt_own')" name="prompt" :hint="$t('agents.label.agent_inherits')" :error="errorAt('prompt')">
              <GrowingTextarea v-model="form.prompt" :rows="6" class="font-mono" :ui="{ base: 'text-sm' }" :disabled="busy" :aria-label="$t('agents.label.agent_prompt_own')" />
            </UFormField>
            <template v-else>
              <h3 class="text-sm font-medium text-highlighted">{{ sectionLabel }}</h3>
              <p class="whitespace-pre-wrap break-words rounded-md bg-elevated p-3 font-mono text-sm" :class="roleText === '' ? 'text-muted' : 'text-default'" data-role-text>{{ roleText === "" ? $t("common.label.none") : roleText }}</p>
              <RoleShared @open="roleOpen = true" />
            </template>
          </div>
        </div>

        <template v-else>
          <UFormField :label="$t('agents.label.agent_bundles')" name="bundles" :error="errorAt('bundles')">
            <ChoiceSelect v-model="form.bundles" :items="bundleItems" value-key="value" multiple class="w-full" :placeholder="roleBundles" :disabled="busy" :aria-label="$t('agents.label.agent_bundles')" />
          </UFormField>
          <UFormField :label="$t('agents.label.agent_skills')" name="skills" :error="errorAt('skills')">
            <ChoiceSelect v-model="form.skills" :items="skillItems" value-key="value" multiple class="w-full" :placeholder="roleSkills" :disabled="busy" :aria-label="$t('agents.label.agent_skills')" />
          </UFormField>
          <RoleShared :text="$t('agents.message.role_features')" @open="roleOpen = true" />
        </template>

        <p v-if="errorAt('form') !== undefined" role="alert" class="break-words text-sm text-error">{{ errorAt("form") }}</p>
      </form>

      <RoleSettingsDialog v-model:open="roleOpen" :name="role.name" @saved="() => void refresh()" />
    </template>

    <template #footer="{ close }">
      <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="busy" @click="close()" />
      <UButton type="submit" :form="formId" :label="$t('common.action.save')" :loading="busy" :disabled="busy || !changes.dirty.value" />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { useOpenedWith } from "bmo-ui/app/domain/form-save";
import { TAB_ROW_LINE, TAB_ROW_UI } from "bmo-ui/app/domain/tabs";

import { defaultThreshold, fractionOf, markedDefault, percentOf, providerWord, refusalOf, sessionsText, useProviders } from "~/domain/axes";
import { sameValue } from "~/domain/form-values";

import type { RoadView, RoleAgentView, RoleSessions, RolesView, RoleView } from "#shared/axes";
import type { NavigationMenuItem, TabsItem } from "@nuxt/ui";

interface Props {
  // The agent to edit; the dialog keeps the last one while it closes.
  name: string | null;
}

const props = defineProps<Props>();
const open = defineModel<boolean>("open", { required: true });

const { t } = useI18n();
const formId = useId();

// The agents tab reads the same answer under the same key.
const { data: view, refresh } = useFetch<RolesView>("/api/roles", { key: "roles", lazy: true, server: false });
const { data: providers } = useProviders();

const role = computed<RoleView | null>(() => view.value?.roles.find((one) => one.agents.some((agent) => agent.name === props.name)) ?? null);
const agent = computed<RoleAgentView | null>(() => role.value?.agents.find((one) => one.name === props.name) ?? null);

// Whether the role has its agents follow their asker, which an agent setting none runs on.
const roleFollows = computed(() => role.value?.followsAsker ?? false);
const followItems = computed(() => [
  { label: markedDefault(t, t("agents.label.switch_on"), roleFollows.value), value: "on" as const },
  { label: markedDefault(t, t("agents.label.switch_off"), !roleFollows.value), value: "off" as const }
]);
const failed = ref(false);
const roleOpen = ref(false);

type Tab = "general" | "sessions" | "prompt" | "features";

const tab = ref<Tab>("general");
const tabs = computed<TabsItem[]>(() => [
  { label: t("agents.label.agent_tab_general"), value: "general" },
  { label: t("agents.label.column_sessions"), value: "sessions" },
  { label: t("agents.label.agent_prompt"), value: "prompt" },
  { label: t("agents.label.agent_tab_features"), value: "features" }
]);

// An agent's own fields as the form holds them; a road naming no provider follows the supervisor that asks it.
interface AgentForm {
  enabled: boolean;
  road: RoadView;
  // Whether it follows the supervisor that asks its run, as it runs now: its own setting, else its role's.
  follows: "on" | "off";
  sessions: RoleSessions;
  // Its compaction threshold as a whole percent, or null for its provider's.
  threshold: number | null;
  keepsCache: boolean;
  prompt: string;
  bundles: string[];
  skills: string[];
}

function formOf(held: RoleAgentView | null): AgentForm {
  return {
    enabled: held?.enabled ?? true,
    follows: (held?.followsAsker ?? roleFollows.value) ? "on" : "off",
    road: { provider: held?.provider ?? "", model: held?.model ?? "", effort: held?.effort ?? null, thinking: held?.thinking ?? null, answerTokens: held?.answerTokens ?? null, advisor: held?.advisor ?? null },
    sessions: held?.sessions ?? "keep",
    threshold: held?.foldRatio == null ? null : percentOf(held.foldRatio),
    keepsCache: held?.keepsCache ?? false,
    prompt: held?.prompt ?? "",
    bundles: [...(held?.bundles ?? [])],
    skills: [...(held?.skills ?? [])]
  };
}

const form = ref<AgentForm>(formOf(null));
// The agent as the agency holds it now, which a save is read against.
const saved = computed<AgentForm>(() => formOf(agent.value));
const busy = ref(false);
const refusal = ref<{ field: string | null; text: string } | null>(null);

const changes = useOpenedWith(() => form.value, { open, ready: () => agent.value !== null });

const sessionItems = computed(() => (["keep", "fresh"] as const).map((value) => ({ value, label: sessionsText(t, value) })));

// The threshold the provider of the road written declares, which an empty box stands for; the box writes its unit
// after it.
const thresholdPlaceholder = computed(() => {
  const declared = defaultThreshold(providers.value, form.value.road.provider === "" ? null : form.value.road.provider);

  return declared === null ? undefined : markedDefault(t, String(percentOf(declared)), true);
});

const bundleItems = computed(() => (view.value?.bundles ?? []).map((one) => ({ label: one.label, value: one.name })));

// What an empty list runs on, the role's own, marked as the default: its bundles, none where it gives none, and its
// skills where it names them; a role naming no skills leaves its runs the whole plugin, which no list can say.
const roleBundles = computed(() => {
  const given = (role.value?.bundles ?? []).map((one) => one.label);

  return markedDefault(t, given.length === 0 ? t("common.label.none") : given.join(", "), true);
});
const roleSkills = computed(() => (role.value?.skills == null ? undefined : markedDefault(t, role.value.skills.length === 0 ? t("common.label.none") : role.value.skills.join(", "), true)));

// Every skill the agency's release carries, with any the agent names that it carries no longer, so a name once chosen
// can still be taken out.
const skillItems = computed(() => {
  const carried = view.value?.skills ?? [];

  return [...carried, ...form.value.skills.filter((one) => !carried.includes(one))].map((one) => ({ label: one, value: one }));
});

// The texts of the system prompt: the agent's own, then the role's prompt and each provider text the role holds, in the
// agency's order of providers.
const OWN = "own";
const ROLE = "role";
const section = ref(OWN);

const promptProviders = computed<string[]>(() => {
  const held = Object.keys(role.value?.providerPrompts ?? {});
  const ordered = (providers.value ?? []).map((one) => one.name).filter((one) => held.includes(one));

  return [...ordered, ...held.filter((one) => !ordered.includes(one))];
});

const sectionItems = computed(() => [
  { label: t("agents.label.agent_prompt_own"), value: OWN },
  { label: t("agents.label.role_prompt"), value: ROLE },
  ...promptProviders.value.map((one) => ({ label: t("agents.aria.provider_prompt_of", { provider: providerWord(providers.value, one) }), value: one }))
]);

const sectionLinks = computed<NavigationMenuItem[]>(() =>
  sectionItems.value.map((one) => ({ label: one.label, active: one.value === section.value, onSelect: () => (section.value = one.value) }))
);

const sectionLabel = computed(() => sectionItems.value.find((one) => one.value === section.value)?.label ?? "");

// The role's text the chosen section shows, empty where it holds none.
const roleText = computed(() => (section.value === ROLE ? (role.value?.prompt ?? "") : (role.value?.providerPrompts[section.value] ?? "")));

// Where each field a refusal may name stands, so the tab holding it is chosen with the refusal under it.
const FIELD_TABS: Record<string, Tab> = {
  enabled: "general",
  provider: "general",
  model: "general",
  effort: "general",
  thinking: "general",
  answerTokens: "general",
  advisor: "general",
  followsAsker: "general",
  sessions: "sessions",
  foldRatio: "sessions",
  keepsCache: "sessions",
  prompt: "prompt",
  bundles: "features",
  skills: "features"
};

function errorAt(place: string): string | undefined {
  if (refusal.value === null) return undefined;

  const field = refusal.value.field;
  const at = field !== null && field in FIELD_TABS ? field : "form";

  return at === place ? refusal.value.text : undefined;
}

function load(): void {
  form.value = formOf(agent.value);
  refusal.value = null;
}

// Every opening and closing is counted, so a read knows whether the opening it was made for still stands.
let turns = 0;

watch(open, async (now) => {
  const turn = ++turns;

  if (!now) return;

  tab.value = "general";
  section.value = OWN;
  load();
  failed.value = false;

  let read = true;

  try {
    await refresh();
  } catch {
    read = false;
  }

  // A read that lands once the dialog has closed, or has opened again, belongs to no form standing now (docs/web.md,
  // 「Forms」).
  if (turn !== turns) return;

  failed.value = !read && agent.value === null;

  // A form nobody has changed takes what was read; one being written keeps what was written, read against what it
  // opened with.
  if (!changes.dirty.value) {
    load();
    await changes.take();
  }
}, { immediate: true });

function emptied(text: string): string | null {
  return text.trim() === "" ? null : text;
}

function listed(names: string[]): string[] | null {
  return names.length === 0 ? null : names;
}

// What a save sends: the fields that differ, the road whole once any part of it does, so a provider or a model changed
// carries nothing over from the one before; an emptied text or list is the role's own.
function body(): Partial<RoleAgentView> {
  const now = form.value;
  const before = saved.value;
  const sent: Partial<RoleAgentView> = {};

  if (now.enabled !== before.enabled) sent.enabled = now.enabled;
  if (!sameValue(now.road, before.road)) {
    const named = now.road.provider !== "";

    Object.assign(sent, {
      provider: named ? now.road.provider : null,
      model: named && now.road.model !== "" ? now.road.model : null,
      effort: named ? now.road.effort : null,
      thinking: named ? now.road.thinking : null,
      answerTokens: named ? now.road.answerTokens : null,
      advisor: named ? now.road.advisor : null
    });
  }
  // The role's setting chosen is the role's own, so the agent follows the role from then on.
  if (now.follows !== before.follows) sent.followsAsker = (now.follows === "on") === roleFollows.value ? null : now.follows === "on";
  if (now.sessions !== before.sessions) sent.sessions = now.sessions;
  if (now.threshold !== before.threshold) sent.foldRatio = now.threshold === null ? null : fractionOf(now.threshold);
  if (now.keepsCache !== before.keepsCache) sent.keepsCache = now.keepsCache;
  if (!sameValue(now.prompt, before.prompt)) sent.prompt = emptied(now.prompt);
  if (!sameValue(now.bundles, before.bundles)) sent.bundles = listed(now.bundles);
  if (!sameValue(now.skills, before.skills)) sent.skills = listed(now.skills);

  return sent;
}

// The agent as the agency answered it stands in every table reading the same answer at once.
function seat(answered: RoleAgentView): void {
  if (!view.value) return;

  view.value = { ...view.value, roles: view.value.roles.map((one) => (one.name === answered.role ? { ...one, agents: one.agents.map((held) => (held.name === answered.name ? answered : held)) } : one)) };
}

async function save(): Promise<void> {
  if (props.name === null) return;

  busy.value = true;
  refusal.value = null;

  try {
    const answered = await $fetch<RoleAgentView>(`/api/role-agents/${encodeURIComponent(props.name)}`, { method: "PATCH", body: body() });

    seat(answered);
    await changes.take();
    open.value = false;
    // How many of a role's runs go at once is the count of its agents switched on, which the roles read anew.
    await refresh();
  } catch (failure) {
    refusal.value = refusalOf(t, failure);

    const field = refusal.value.field;

    if (field !== null && field in FIELD_TABS) tab.value = FIELD_TABS[field] as Tab;
  } finally {
    busy.value = false;
  }
}
</script>
