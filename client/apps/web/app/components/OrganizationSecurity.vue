<template>
  <!-- The organisation screen's security tab (docs/web.md, 「Organisation」, the security tab): whether the people under the node
       chosen must hold a second factor — the node's own word or following above, with what that comes to — and what
       the units below may do with it, each saved as it is changed. At the platform's node it stands for the platform's own link. -->
  <div class="flex flex-col gap-4" data-org-security>
    <div v-if="view === null && failure !== ''" class="flex flex-col items-end gap-3">
      <UAlert class="w-full" color="error" variant="subtle" :description="failure" />
      <UButton color="neutral" variant="subtle" icon="i-material-symbols-refresh" :label="$t('common.action.refresh')" :loading="reading" @click="void read()" />
    </div>

    <SettingsGroup v-else :title="$t('security.label.second_factor')">
      <ContentSkeleton v-if="view === null" :rows="2" list-class="flex flex-col divide-y divide-default" :label="$t('security.message.loading')">
        <div class="flex items-center gap-4 py-3">
          <SkeletonLine width="w-1/3" />
          <SkeletonBar class="ms-auto h-5 w-9 shrink-0 rounded-full" />
        </div>
      </ContentSkeleton>

      <template v-else>
        <SettingsRow :label="$t('security.label.require_factor')" data-require-factor>
          <template #description>
            <span class="text-sm text-muted">{{ originLine }}</span>
            <span class="text-sm text-muted">{{ $t("security.message.require_detail") }}</span>
          </template>
          <ChoiceSelect
            :model-value="choice"
            :items="choices"
            value-key="value"
            class="w-40"
            :loading="busy"
            :disabled="busy || !view.writable"
            :aria-label="$t('security.label.require_factor')"
            data-require-choice
            @update:model-value="(value: unknown) => void choose(value)"
          />
        </SettingsRow>
        <SettingsRow :label="$t('security.label.below')" :description="view.lockedBy !== null ? (decidedLine($t, view.locker) ?? $t('org_agents.label.decided_unit')) : ''">
          <ChoiceSelect
            :model-value="view.delegation"
            :items="delegations"
            value-key="value"
            class="w-40"
            :loading="busy"
            :disabled="busy || !view.writable"
            :aria-label="$t('org_agents.aria.delegation', { name: $t('security.label.require_factor') })"
            data-require-delegation
            @update:model-value="(value: unknown) => void delegate(value)"
          />
        </SettingsRow>
        <p v-if="failure !== ''" role="alert" class="break-words py-3 text-sm text-error">{{ failure }}</p>
      </template>
    </SettingsGroup>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import { decidedLine } from "~/domain/chain-decided";
import { UNIT_KEY } from "~/domain/organization";

import type { Organization } from "~/domain/organization";
import type { SecondFactorRequirement } from "#shared/account-security";

interface Props {
  // The organisation chosen; the unit read is the one the tree chooses under it, the company itself where none is.
  company?: Organization | null;
  // The platform's own link, chosen in the tree.
  platform?: boolean;
}

const props = withDefaults(defineProps<Props>(), { company: null, platform: false });

const { t } = useI18n();
const route = useRoute();

const unit = computed(() => {
  const chosen = Number(route.query[UNIT_KEY]);

  return Number.isInteger(chosen) && chosen > 0 ? chosen : (props.company?.id ?? null);
});
const node = computed(() => (props.platform ? { link: "platform" } : { unit: unit.value }));
const view = ref<SecondFactorRequirement | null>(null);
const failure = ref("");
const reading = ref(false);
const busy = ref(false);

const FOLLOW = "follow";
const choice = computed(() => (view.value?.own === null || view.value === null ? FOLLOW : view.value.own ? "on" : "off"));
const choices = computed(() => [
  ...(props.platform ? [] : [{ value: FOLLOW, label: t("org_agents.label.delegation_inherit") }]),
  { value: "on", label: t("security.label.require_on") },
  { value: "off", label: t("security.label.require_off") }
]);
const delegations = computed(() => [
  { value: "inherit", label: t("org_agents.label.delegation_inherit") },
  { value: "allow", label: t("org_agents.label.delegation_allow") },
  { value: "lock", label: t("org_agents.label.delegation_lock") }
]);
// Where the word comes from: the node's own, or following above with what that comes to.
const originLine = computed(() => {
  if (view.value === null) return "";
  if (view.value.own !== null) return t("security.label.own_value");

  return view.value.stands ? t("security.label.follows_on") : t("security.label.follows_off");
});

async function read(): Promise<void> {
  reading.value = true;
  failure.value = "";

  try {
    view.value = await $fetch<SecondFactorRequirement>("/api/organization/security", { query: node.value });
  } catch (error) {
    view.value = null;
    failure.value = failureText(error, t("security.error.failed"));
  } finally {
    reading.value = false;
  }
}

async function put(body: Record<string, unknown>): Promise<void> {
  busy.value = true;
  failure.value = "";

  try {
    await $fetch("/api/organization/security", { method: "PUT", body: { ...node.value, ...body } });
  } catch (error) {
    failure.value = failureText(error, t("security.error.failed"));
  } finally {
    busy.value = false;
  }

  const kept = failure.value;

  await read();
  failure.value = kept;
}

async function choose(chosen: unknown): Promise<void> {
  if (typeof chosen !== "string" || chosen === choice.value) return;

  await put({ value: chosen === FOLLOW ? null : chosen === "on" });
}

async function delegate(chosen: unknown): Promise<void> {
  if (typeof chosen !== "string" || chosen === view.value?.delegation) return;

  await put({ delegation: chosen });
}

watch(node, () => void read());
onMounted(() => void read());
</script>
