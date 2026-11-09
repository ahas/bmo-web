<template>
  <!-- A role's agents (docs/web.md, 「Agent management screen」, the roles tab; the agency's docs/role-agents.md): one
       block per agent in the order a run looks for a free one, each a seat of the role on one road — its switch, its
       name, its provider, model and effort, its place moved by its arrows, and what it lays over its role's preset
       behind a fold. Each change is one agent's own and is saved as it is made. -->
  <div class="flex min-w-0 flex-col gap-3" data-role-agents>
    <p v-if="agents.length === 0" class="text-sm text-muted">{{ $t("agents.status.agents_none") }}</p>

    <ol v-else class="flex min-w-0 flex-col divide-y divide-default rounded-lg border border-default" :aria-label="$t('agents.label.role_agents')">
      <li v-for="(agent, index) in agents" :key="agent.name" class="flex min-w-0 flex-col gap-2 p-2" :data-agent="agent.name">
        <div class="flex min-w-0 items-center gap-2">
          <USwitch
            :model-value="agent.enabled"
            :disabled="locked"
            :aria-label="$t('agents.aria.agent_enabled_of', { name: agent.name })"
            @update:model-value="(on: boolean) => void save(agent, { enabled: on })"
          />
          <span class="w-5 shrink-0 text-sm tabular-nums text-muted">{{ index + 1 }}</span>
          <span class="min-w-0 flex-1 truncate font-mono text-sm font-medium" :class="agent.enabled ? 'text-highlighted' : 'text-muted'">{{ agent.name }}</span>
          <UBadge v-if="agent.carries" color="primary" variant="subtle" size="sm">{{ $t("agents.label.agent_carries") }}</UBadge>
          <UTooltip :text="$t('common.aria.move_up_named', { name: agent.name })">
            <UButton color="neutral" variant="ghost" size="sm" icon="i-material-symbols-arrow-upward" :aria-label="$t('common.aria.move_up_named', { name: agent.name })" :disabled="locked || index === 0" @click="void move(index, index - 1)" />
          </UTooltip>
          <UTooltip :text="$t('common.aria.move_down_named', { name: agent.name })">
            <UButton color="neutral" variant="ghost" size="sm" icon="i-material-symbols-arrow-downward" :aria-label="$t('common.aria.move_down_named', { name: agent.name })" :disabled="locked || index === agents.length - 1" @click="void move(index, index + 1)" />
          </UTooltip>
          <UTooltip :text="$t('agents.aria.agent_remove', { name: agent.name })">
            <UButton color="neutral" variant="ghost" size="sm" icon="i-material-symbols-close" :aria-label="$t('agents.aria.agent_remove', { name: agent.name })" :disabled="locked || agent.carries" @click="void remove(agent)" />
          </UTooltip>
        </div>

        <!-- Its road: the provider, or none where it follows the one that asks it, and under a provider its model and
             its effort. -->
        <div class="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start">
          <UFormField :label="$t('agents.label.agent_provider')" :name="`agent-${agent.name}-provider`" class="min-w-0 sm:w-48 sm:shrink-0">
            <USelect
              :model-value="agent.provider ?? FOLLOWS"
              :items="providerItems"
              value-key="value"
              class="w-full min-w-0"
              :disabled="locked"
              :aria-label="$t('agents.aria.agent_provider_of', { name: agent.name })"
              @update:model-value="(value: string) => void placed(agent, value)"
            />
          </UFormField>
          <UFormField v-if="agent.provider !== null" :label="$t('common.label.model')" :name="`agent-${agent.name}-model`" class="min-w-0 sm:flex-1">
            <USelect
              :model-value="agent.model ?? undefined"
              :items="modelItems(agent)"
              value-key="value"
              class="w-full min-w-0"
              :loading="modelsOf(agent.provider).reading"
              :disabled="locked"
              :aria-label="$t('agents.aria.order_model_of', { name: agent.name })"
              @update:model-value="(value: string) => void save(agent, { model: value, effort: keptEffort(agent, value) })"
            />
          </UFormField>
          <UFormField v-if="agent.provider !== null && effortItems(agent).length > 0" :label="$t('agents.label.effort')" :name="`agent-${agent.name}-effort`" class="sm:w-28 sm:shrink-0">
            <USelect
              :model-value="agent.effort ?? undefined"
              :items="effortItems(agent)"
              value-key="value"
              class="w-full"
              :disabled="locked"
              :aria-label="$t('agents.aria.order_effort_of', { name: agent.name })"
              @update:model-value="(value: string) => void save(agent, { effort: value })"
            />
          </UFormField>
        </div>

        <!-- What it lays over its role's preset, each left empty for the role's own, and whether its cache is kept
             warm. -->
        <UCollapsible :unmount-on-hide="false">
          <UButton color="neutral" variant="link" size="sm" class="px-0" trailing-icon="i-material-symbols-keyboard-arrow-down" :label="overridesLabel(agent)" />

          <template #content>
            <div class="flex min-w-0 flex-col gap-2 pt-2">
              <USwitch
                :model-value="agent.keepsCache"
                :label="$t('agents.label.agent_keeps_cache')"
                :disabled="locked"
                @update:model-value="(on: boolean) => void save(agent, { keepsCache: on })"
              />
              <UFormField :label="$t('agents.label.agent_prompt')" :name="`agent-${agent.name}-prompt`" :hint="$t('agents.label.agent_inherits')">
                <UTextarea
                  :model-value="written(agent, 'prompt', agent.prompt ?? '')"
                  :rows="3"
                  autoresize
                  class="w-full"
                  :disabled="locked"
                  :aria-label="$t('agents.label.agent_prompt')"
                  @update:model-value="(value: string) => write(agent, 'prompt', value)"
                  @change="() => void settle(agent, 'prompt', (value) => ({ prompt: emptied(value) }))"
                />
              </UFormField>
              <UFormField :label="$t('agents.label.agent_bundles')" :name="`agent-${agent.name}-bundles`" :hint="$t('agents.label.agent_inherits')">
                <USelectMenu
                  :model-value="agent.bundles ?? []"
                  :items="props.bundles"
                  value-key="value"
                  multiple
                  class="w-full min-w-0"
                  :disabled="locked"
                  :aria-label="$t('agents.label.agent_bundles')"
                  @update:model-value="(value: string[]) => void save(agent, { bundles: value.length === 0 ? null : value })"
                />
              </UFormField>
              <UFormField :label="$t('agents.label.agent_skills')" :name="`agent-${agent.name}-skills`" :hint="$t('agents.label.agent_skills_hint')">
                <UInput
                  :model-value="written(agent, 'skills', (agent.skills ?? []).join(', '))"
                  class="w-full"
                  :disabled="locked"
                  :aria-label="$t('agents.label.agent_skills')"
                  @update:model-value="(value: string) => write(agent, 'skills', value)"
                  @change="() => void settle(agent, 'skills', (value) => ({ skills: listed(value) }))"
                />
              </UFormField>
            </div>
          </template>
        </UCollapsible>
      </li>
    </ol>

    <div class="flex justify-end">
      <UButton color="neutral" variant="subtle" icon="i-material-symbols-add" :label="$t('agents.action.agent_add')" :loading="adding" :disabled="locked" @click="void add()" />
    </div>

    <p v-if="refusal !== ''" role="alert" class="break-words text-sm text-error">{{ refusal }}</p>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import { effortChoices, useProviderModels, useProviders } from "~/domain/axes";
import { agentOverrides, movedPlaces } from "~/domain/role-agents";

import type { RoleAgentView } from "#shared/axes";

interface Props {
  // The role whose agents these are, and the line its runs go out on, which a provider's program must carry.
  role: string;
  line: string;
  // Every bundle a role may give, as the choices of an agent's own.
  bundles: { label: string; value: string }[];
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), { disabled: false });
const agents = defineModel<RoleAgentView[]>({ required: true });
const emit = defineEmits<{ changed: [] }>();

const { t } = useI18n();
const { data: providers } = useProviders();
const models = useProviderModels();

// The choice that names no road: the agent follows the one that asks it. A select takes no empty value, and no
// provider's name holds a colon.
const FOLLOWS = ":follows";

const busy = ref(false);
const adding = ref(false);
const refusal = ref("");
const locked = computed(() => props.disabled || busy.value || adding.value);

function modelsOf(provider: string) {
  return models.stateOf(provider).value;
}

function providerOf(name: string) {
  return providers.value?.find((one) => one.name === name);
}

// Each provider's models are read as an agent first stands on it.
watch(() => agents.value.map((one) => one.provider ?? "").join(" "), () => {
  for (const agent of agents.value) {
    if (agent.provider !== null) void models.read(agent.provider, (error) => failureText(error, t("agents.error.provider_models_read_failed")));
  }
}, { immediate: true });

// No road first, then every provider whose program carries the role's line.
const providerItems = computed<{ label: string; value: string }[]>(() => [
  { label: t("agents.label.agent_follows"), value: FOLLOWS },
  ...(providers.value ?? [])
    .filter((one) => one.lines.length === 0 || one.lines.includes(props.line))
    .map((one) => ({ label: one.label, value: one.name }))
]);

function modelItems(agent: RoleAgentView): { label: string; value: string }[] {
  const held = agent.provider === null ? [] : (modelsOf(agent.provider).view?.models ?? []);
  const items = held.map((one) => ({ label: one.id, value: one.id }));

  return agent.model === null || items.some((one) => one.value === agent.model) ? items : [{ label: agent.model, value: agent.model }, ...items];
}

function effortItems(agent: RoleAgentView): { label: string; value: string }[] {
  if (agent.provider === null || agent.model === null) return [];

  return effortChoices(providerOf(agent.provider), modelsOf(agent.provider).view, agent.model).map((level) => ({ label: level, value: level }));
}

// A model chosen keeps the effort set where it takes it, and lets it go where it does not.
function keptEffort(agent: RoleAgentView, model: string): string | null {
  if (agent.provider === null || agent.effort === null) return null;

  return effortChoices(providerOf(agent.provider), modelsOf(agent.provider).view, model).includes(agent.effort) ? agent.effort : null;
}

function overridesLabel(agent: RoleAgentView): string {
  const laid = agentOverrides(agent);

  return laid === 0 ? t("agents.label.agent_overrides") : t("agents.label.agent_overrides_n", { n: laid });
}

function emptied(value: string): string | null {
  return value.trim() === "" ? null : value;
}

function listed(value: string): string[] | null {
  const names = value.split(",").map((one) => one.trim()).filter((one) => one !== "");

  return names.length === 0 ? null : names;
}

// What is being written into an agent's text fields and is not sent yet, by agent and field, so a field keeps its
// text however the list is drawn again.
const drafts = reactive<Record<string, string>>({});

function written(agent: RoleAgentView, field: string, held: string): string {
  return drafts[`${agent.name}:${field}`] ?? held;
}

function write(agent: RoleAgentView, field: string, value: string): void {
  drafts[`${agent.name}:${field}`] = value;
}

// A written field is sent as it is left; a save that stood lets its draft go, and a refused one keeps the text.
async function settle(agent: RoleAgentView, field: string, body: (value: string) => Partial<RoleAgentView>): Promise<void> {
  const key = `${agent.name}:${field}`;
  const value = drafts[key];

  if (value === undefined) return;
  if (await save(agent, body(value))) delete drafts[key];
}

/** One agent's change sent; the list stands as the agency answered it, or the refusal under the list. Whether it
 * stood. */
async function save(agent: RoleAgentView, body: Partial<RoleAgentView>): Promise<boolean> {
  busy.value = true;
  refusal.value = "";

  try {
    const answered = await $fetch<RoleAgentView>(`/api/role-agents/${encodeURIComponent(agent.name)}`, { method: "PATCH", body });

    agents.value = agents.value.map((one) => (one.name === agent.name ? answered : one));
    emit("changed");

    return true;
  } catch (failure) {
    refusal.value = failureText(failure, t("agents.error.agent_save_failed"));

    return false;
  } finally {
    busy.value = false;
  }
}

// A provider chosen stands on the first model its catalogue serves; no provider clears the road whole.
async function placed(agent: RoleAgentView, provider: string): Promise<void> {
  if (provider === FOLLOWS) {
    await save(agent, { provider: null, model: null, effort: null });

    return;
  }

  await models.read(provider, (error) => failureText(error, t("agents.error.provider_models_read_failed")));

  const held = modelsOf(provider).view?.models ?? [];
  const first = held.find((one) => one.inService !== false) ?? held[0];

  if (first === undefined) {
    refusal.value = t("agents.error.provider_models_read_failed");

    return;
  }

  await save(agent, { provider, model: first.id, effort: null });
}

// Two agents trade places: each is sent the place the other held.
async function move(from: number, to: number): Promise<void> {
  const moved = movedPlaces(agents.value, from, to);

  if (moved === null) return;

  busy.value = true;
  refusal.value = "";

  try {
    for (const { name, position } of moved.sent) {
      await $fetch<RoleAgentView>(`/api/role-agents/${encodeURIComponent(name)}`, { method: "PATCH", body: { position } });
    }

    agents.value = moved.agents;
    emit("changed");
  } catch (failure) {
    refusal.value = failureText(failure, t("agents.error.agent_save_failed"));
  } finally {
    busy.value = false;
  }
}

// An agent added stands last, on the road of the role's last agent, so a seat more of the same kind is one press.
async function add(): Promise<void> {
  adding.value = true;
  refusal.value = "";

  try {
    const last = agents.value.at(-1);
    const body = last === undefined || last.provider === null ? { role: props.role } : { role: props.role, provider: last.provider, model: last.model, effort: last.effort };
    const answered = await $fetch<RoleAgentView>("/api/role-agents", { method: "POST", body });

    agents.value = [...agents.value, answered];
    emit("changed");
  } catch (failure) {
    refusal.value = failureText(failure, t("agents.error.agent_save_failed"));
  } finally {
    adding.value = false;
  }
}

async function remove(agent: RoleAgentView): Promise<void> {
  busy.value = true;
  refusal.value = "";

  try {
    await $fetch(`/api/role-agents/${encodeURIComponent(agent.name)}`, { method: "DELETE" });
    agents.value = agents.value.filter((one) => one.name !== agent.name);
    emit("changed");
  } catch (failure) {
    refusal.value = failureText(failure, t("agents.error.agent_save_failed"));
  } finally {
    busy.value = false;
  }
}
</script>
