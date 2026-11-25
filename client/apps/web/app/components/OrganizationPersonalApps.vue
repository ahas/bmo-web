<template>
  <!-- What the people under the node chosen may do with personal apps (docs/web.md, 「System and organisation」, the apps tab): make
       them, let them reach the network or be handed secrets, share them and with whom, have a head approve a shared
       version, and install a shared one — each the node's own word or following above, with what the links below may
       do with it. Network and secrets are opened by the platform one company at a time, the administrator's switch on
       the company's row. Each choice is saved as it is made. -->
  <SettingsGroup v-if="view !== null || failure !== ''" :title="$t('apps.title.personal_apps')" data-org-personal-apps>
    <p v-if="view === null" role="alert" class="py-3 text-sm text-error">{{ failure }}</p>
    <template v-else>
      <SettingsRow v-for="one in view.settings" :key="one.setting" :label="$t(LABELS[one.setting])" :description="lineOf(one)" :data-personal-app-setting="one.setting">
        <div class="flex flex-wrap items-center justify-end gap-2">
          <USwitch
            v-if="one.offered !== null"
            :model-value="one.offered"
            :loading="busy === `${one.setting}:offered`"
            :disabled="busy !== ''"
            :aria-label="$t('apps.label.personal_offered', { name: $t(LABELS[one.setting]) })"
            data-personal-app-offered
            @update:model-value="(on: boolean) => void write(`${one.setting}:offered`, { setting: one.setting, offered: on })"
          />
          <ChoiceSelect
            v-if="one.setting === 'shareScope'"
            :model-value="scopeChoice(one)"
            :items="scopeItems"
            value-key="value"
            class="w-44"
            :loading="busy === one.setting"
            :disabled="busy !== '' || !one.writable"
            :aria-label="$t(LABELS[one.setting])"
            data-personal-app-choice
            @update:model-value="(value: unknown) => void write(one.setting, { setting: one.setting, value: value === 'inherit' ? null : SCOPE_CHOICES[value as string] })"
          />
          <ChoiceSelect
            v-else
            :model-value="one.own === null ? 'inherit' : one.own ? 'allow' : 'deny'"
            :items="flagItems"
            value-key="value"
            class="w-36"
            :loading="busy === one.setting"
            :disabled="busy !== '' || !one.writable"
            :aria-label="$t(LABELS[one.setting])"
            data-personal-app-choice
            @update:model-value="(value: unknown) => void write(one.setting, { setting: one.setting, value: value === 'inherit' ? null : value === 'allow' })"
          />
          <ChoiceSelect
            :model-value="one.delegation"
            :items="delegations"
            value-key="value"
            class="w-36"
            :disabled="busy !== '' || !one.writable"
            :aria-label="$t('org_agents.aria.delegation', { name: $t(LABELS[one.setting]) })"
            :data-personal-app-delegation="one.setting"
            @update:model-value="(value: unknown) => void write(`${one.setting}:delegation`, { setting: one.setting, delegation: value })"
          />
        </div>
      </SettingsRow>
      <p v-if="failure !== ''" role="alert" class="break-words py-3 text-sm text-error">{{ failure }}</p>
    </template>
  </SettingsGroup>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import { decidedLine } from "~/domain/chain-decided";
import { useChosenUnit } from "~/domain/organization";

import type { Organization } from "~/domain/organization";
import type { PersonalAppSetting, PersonalAppSettings, PersonalAppSettingView, ShareScope } from "#shared/personal-apps-settings";

interface Props {
  // The organisation chosen, the node read the unit the tree chooses under it; none where the platform's own link is
  // read instead.
  company?: Organization;
  platform?: boolean;
}

const props = withDefaults(defineProps<Props>(), { company: undefined, platform: false });

const { t } = useI18n();
const unit = useChosenUnit(() => props.company?.id ?? 0);
const base = computed(() => (props.platform ? "/api/organization/platform/personal-apps" : `/api/organization/units/${unit.value}/personal-apps`));

const view = ref<PersonalAppSettings | null>(null);
const failure = ref("");
const busy = ref("");

// Each setting by the pack's name for it.
const LABELS: Readonly<Record<PersonalAppSetting, string>> = {
  make: "apps.label.personal_make",
  network: "apps.label.personal_network",
  secrets: "apps.label.personal_secrets",
  shareScope: "apps.label.personal_share_scope",
  shareReview: "apps.label.personal_share_review",
  install: "apps.label.personal_install"
};

// The share scope's choices, each a whole list of whom an app may be shared with, widest last.
const SCOPE_CHOICES: Readonly<Record<string, ShareScope[]>> = { team: ["team"], heads: ["team", "heads"], company: ["team", "heads", "company"] };

const inheritLabel = computed(() => (props.platform ? t("org_agents.label.choice_default") : t("org_agents.label.choice_inherit")));
const flagItems = computed(() => [
  { value: "inherit", label: inheritLabel.value },
  { value: "allow", label: t("org_agents.label.manage_allow") },
  { value: "deny", label: t("org_agents.label.choice_off") }
]);
const scopeItems = computed(() => [
  { value: "inherit", label: inheritLabel.value },
  { value: "team", label: t("apps.label.scope_team") },
  { value: "heads", label: t("apps.label.scope_heads") },
  { value: "company", label: t("apps.label.scope_company") }
]);
const delegations = computed(() => [
  { value: "inherit", label: t("org_agents.label.delegation_inherit") },
  { value: "allow", label: t("org_agents.label.delegation_allow") },
  { value: "lock", label: t("org_agents.label.delegation_lock") }
]);

// The share scope's own word as one of its choices: the widest whom it names.
function scopeChoice(one: PersonalAppSettingView): string {
  if (!Array.isArray(one.own)) return "inherit";

  return one.own.includes("company") ? "company" : one.own.includes("heads") ? "heads" : "team";
}

// What a row says under its name: a lock above, or what following above comes to.
function lineOf(one: PersonalAppSettingView): string {
  if (one.lockedBy !== null) return decidedLine(t, one.locker) ?? t("org_agents.label.decided_unit");
  if (one.own !== null || props.platform) return "";
  if (Array.isArray(one.stands)) return t("apps.label.personal_follows", { value: scopeItems.value.find((item) => item.value === scopeChoice({ ...one, own: one.stands }))?.label ?? "" });

  return one.stands ? t("org_agents.label.manage_stands_allow") : t("org_agents.label.manage_stands_deny");
}

async function read(): Promise<void> {
  try {
    view.value = await $fetch<PersonalAppSettings>(base.value, { query: props.platform ? {} : { company: String(unit.value === props.company?.id) } });
    failure.value = "";
  } catch (error) {
    view.value = null;
    // A reader who writes none of them is shown no group at all.
    failure.value = (error as { statusCode?: number }).statusCode === 403 ? "" : failureText(error, t("org_agents.error.forbidden"));
  }
}

// One write, the group read again after it; a refusal is said under the group.
async function write(key: string, body: Record<string, unknown>): Promise<void> {
  busy.value = key;

  let refused = "";

  try {
    await $fetch(base.value, { method: "PUT", body });
  } catch (error) {
    refused = failureText(error, t("org_agents.error.forbidden"));
  } finally {
    busy.value = "";
  }

  await read();
  failure.value = refused;
}

watch(unit, () => void read());
onMounted(() => void read());
</script>
