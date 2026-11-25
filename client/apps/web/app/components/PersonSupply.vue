<template>
  <!-- One person's supply tab, for a reader who may set their supply (docs/web.md, 「System and organisation」, the people
       tab): the per-user policy or the organisation's they follow, the providers their own credentials serve —
       names alone, never a credential — the order resolved for them, and for the platform administrator the way to
       grant credits into the person's own wallet. -->
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

      <!-- Credits into the person's own wallet, the platform administrator's act: an amount and a line of words kept
           with it. A grant is not a payment; no top-up stands. -->
      <SettingsGroup v-if="administrator" :title="$t('supply.label.personal_credits')" data-person-supply-credits>
        <SettingsRow :label="$t('supply.action.credit_grant')" :description="granted === null ? '' : $t('supply.label.personal_granted', { amount: creditsText(t, granted) })">
          <UButton color="neutral" variant="outline" :label="$t('supply.action.grant')" :disabled="busy" data-person-credit-grant @click="openGrant" />
        </SettingsRow>
      </SettingsGroup>

      <p v-if="failure !== ''" role="alert" class="break-words text-sm text-error">{{ failure }}</p>
    </template>

    <SettingsDialog v-model:open="granting" :title="$t('supply.title.credit_grant')" :dirty="grantChanges">
      <form id="person-grant-form" class="flex flex-col gap-4" @submit.prevent="void grant()">
        <UFormField :label="$t('supply.label.amount')" name="amount">
          <UInput v-model="grantAmount" class="w-full text-end tabular-nums" inputmode="numeric" placeholder="0" :aria-label="$t('supply.label.amount')" data-person-grant-amount />
        </UFormField>
        <UFormField :label="$t('supply.label.words')" name="words">
          <UInput v-model="grantWords" class="w-full" autocomplete="off" :placeholder="$t('supply.label.words_placeholder')" :aria-label="$t('supply.label.words')" />
        </UFormField>
        <p v-if="grantFailed !== ''" role="alert" class="break-words text-sm text-error">{{ grantFailed }}</p>
      </form>
      <template #footer="{ close }">
        <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="grantBusy" @click="close()" />
        <UButton type="submit" form="person-grant-form" :label="$t('supply.action.grant')" :loading="grantBusy" :disabled="grantBusy || !/^[1-9][0-9]*$/.test(grantAmount.trim())" />
      </template>
    </SettingsDialog>

    <SupplyPolicyDialog v-model:open="editing" :title="$t('supply.title.policy_set')" :draft="draft" :send="writePolicy" @saved="void read()" />
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { useOpenedWith } from "bmo-ui/app/domain/form-save";

import { useAdministrator } from "~/domain/access";
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

// --- A grant into the person's own wallet, the platform administrator's ---

const administrator = useAdministrator();
const granting = ref(false);
const grantBusy = ref(false);
const grantAmount = ref("");
const grantWords = ref("");
const grantFailed = ref("");
const granted = ref<number | null>(null);
const grantChanges = useOpenedWith(() => ({ amount: grantAmount.value, words: grantWords.value }), { open: granting });

function openGrant(): void {
  grantAmount.value = "";
  grantWords.value = "";
  grantFailed.value = "";
  granting.value = true;
}

async function grant(): Promise<void> {
  const amount = Number(grantAmount.value.trim());
  const words = grantWords.value.trim();

  grantBusy.value = true;
  grantFailed.value = "";
  try {
    await $fetch("/api/supply/credits", { method: "POST", body: { ownerKind: "user", ownerId: Number(props.user), amount, ...(words === "" ? {} : { words }) } });
    granted.value = amount;
    granting.value = false;
  } catch (error) {
    grantFailed.value = failureText(error, t("supply.error.grant_failed"));
  } finally {
    grantBusy.value = false;
  }
}

onMounted(() => void read());
</script>
