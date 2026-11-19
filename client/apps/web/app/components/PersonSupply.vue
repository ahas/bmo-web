<template>
  <!-- One person's supply tab, for a reader who may set their supply (docs/web.md, 「Organisation」, the people
       tab): the per-user policy or the organisation's they follow, the providers their own credentials serve —
       names alone, never a credential — and the order resolved for them. -->
  <div class="flex flex-col gap-4" data-person-supply>
    <ContentSkeleton v-if="view === null && failure === '' && unknown === ''" :rows="3" list-class="flex flex-col divide-y divide-default" :label="$t('supply.status.loading')">
      <div class="flex items-center gap-4 py-3">
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <SkeletonLine width="w-1/3" />
          <SkeletonLine width="w-1/2" />
        </div>
      </div>
    </ContentSkeleton>

    <p v-else-if="unknown !== ''" class="text-sm text-muted" data-person-supply-unknown>{{ unknown }}</p>

    <div v-else-if="view === null" class="flex flex-col items-end gap-3">
      <UAlert class="w-full" color="error" variant="subtle" :description="failure" />
      <UButton color="neutral" variant="subtle" icon="i-material-symbols-refresh" :label="$t('common.action.refresh')" :loading="reading" @click="read" />
    </div>

    <template v-else>
      <SettingsGroup :title="$t('supply.title.policy')">
        <template #aside>
          <UButton v-if="view.inherits" size="sm" color="neutral" variant="outline" :label="$t('supply.action.policy_set')" :disabled="busy" @click="editing = true" />
          <template v-else>
            <IconButton size="sm" icon="i-material-symbols-edit" :label="$t('common.action.edit')" :disabled="busy" @click="editing = true" />
            <IconButton size="sm" icon="i-material-symbols-delete-outline" color="error" :label="$t('supply.action.policy_delete')" :disabled="busy" @click="removePolicy" />
          </template>
        </template>

        <SettingsRow :label="$t('supply.label.policy')" :data-person-supply-policy="view.inherits ? 'inherits' : 'own'">
          <span class="text-sm" :class="view.inherits ? 'text-muted' : 'text-highlighted'">{{ view.inherits ? $t('supply.label.follows_unit') : allowedLine }}</span>
        </SettingsRow>
        <SettingsRow v-if="!view.inherits" :label="$t('supply.label.member_credit_cap')">
          <span class="text-sm tabular-nums text-highlighted">{{ view.policy?.memberCreditCredits === null || view.policy?.memberCreditCredits === undefined ? $t('supply.label.cap_none') : creditsText(t, view.policy.memberCreditCredits) }}</span>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup :title="$t('supply.label.personal')">
        <SettingsRow :label="$t('supply.label.providers')">
          <span class="text-sm text-highlighted" data-person-supply-providers>{{ view.providers.length === 0 ? $t('supply.label.personal_none') : view.providers.map((one) => providerLabel(t, one)).join(", ") }}</span>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup :title="$t('supply.title.order')">
        <SettingsRow :label="$t('supply.label.resolved_order')">
          <span class="text-sm text-highlighted" data-person-supply-order>{{ orderLine }}</span>
        </SettingsRow>
      </SettingsGroup>

      <p v-if="failure !== ''" role="alert" class="break-words text-sm text-error">{{ failure }}</p>
    </template>

    <SupplyPolicyDialog v-model:open="editing" :title="$t('supply.title.policy_set')" :draft="draft" :send="writePolicy" @saved="void read()" />
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import { useConfirm } from "~/domain/confirm";
import { creditsText, policyDraft, providerLabel, sourceLabel } from "~/domain/supply";

import type { PersonPaneProps } from "~/domain/person-panes";
import type { PolicyDraft } from "~/domain/supply";
import type { SupplyPolicy, SupplyUserView } from "#shared/supply";

// A person's supply, read where the tab first opens and written whole by the form. The service answers this view to
// readers who manage the person's unit alone, and its refusal says the reason here. Where the deployment names no
// agency the read itself is refused, `no-agency`: the personal supply is not known here, and one line says so
// rather than the tab failing.
const props = defineProps<PersonPaneProps>();

const { t } = useI18n();
const confirm = useConfirm();

const view = ref<SupplyUserView | null>(null);
const failure = ref("");
const unknown = ref("");
const reading = ref(false);
const editing = ref(false);
const busy = computed(() => reading.value);

const draft = computed<PolicyDraft>(() => policyDraft(view.value?.policy ?? null));

function policyLine(policy: SupplyPolicy | null): string {
  if (policy === null) return "";

  return policy.order.filter((one) => one !== "stop" && policy.allowed.includes(one)).map((one) => sourceLabel(t, one)).join(", ");
}

const allowedLine = computed(() => (view.value === null ? "" : policyLine(view.value.policy)));
const orderLine = computed(() => (view.value ?? { order: [] }).order.map((one) => sourceLabel(t, one)).join(" › "));

async function read(): Promise<void> {
  reading.value = true;
  unknown.value = "";

  try {
    view.value = await $fetch<SupplyUserView>(`/api/supply/user/${encodeURIComponent(props.user)}`);
    failure.value = "";
  } catch (error) {
    view.value = null;
    if ((error as { data?: { code?: string } }).data?.code === "no-agency") unknown.value = t("supply.error.no_agency");
    else failure.value = failureText(error, t("supply.error.read_failed"));
  } finally {
    reading.value = false;
  }
}

async function writePolicy(policy: SupplyPolicy): Promise<void> {
  await $fetch(`/api/supply/user/${encodeURIComponent(props.user)}`, { method: "PUT", body: policy });
}

async function removePolicy(): Promise<void> {
  const taken = await confirm({ title: t("supply.message.policy_delete"), effect: t("supply.message.policy_delete_effect_user"), confirm: t("supply.action.policy_delete") });

  if (!taken) return;

  failure.value = "";

  try {
    // The taking-away is answered with the person as they now stand, following their organisation's again.
    view.value = await $fetch<SupplyUserView>(`/api/supply/user/${encodeURIComponent(props.user)}`, { method: "DELETE" });
  } catch (error) {
    failure.value = failureText(error, t("supply.error.policy_failed"));
  }
}

onMounted(() => void read());
</script>
