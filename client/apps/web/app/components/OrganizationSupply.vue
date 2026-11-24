<template>
  <!-- The supply tab's policy and credits (docs/web.md, 「Organisation」, the supply tab): of the unit chosen in the
       tree, the company where none is — its policy or what it follows, the monthly cap on organisation credits, its
       credit wallet and this month's spend by member — and the way to grant it credits, for a reader holding its
       policy and credits. No credential stands here; credits are the platform's own, not a payment. -->
  <div class="flex flex-col gap-4">
    <ContentSkeleton v-if="view === null && failure === ''" :rows="4" list-class="flex flex-col divide-y divide-default" :label="$t('supply.status.loading')">
      <div class="flex items-center gap-4 py-3">
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <SkeletonLine width="w-1/3" />
          <SkeletonLine width="w-1/2" />
        </div>
        <SkeletonBar class="h-6 w-20 shrink-0 rounded-md" />
      </div>
    </ContentSkeleton>

    <div v-else-if="view === null" class="flex flex-col items-end gap-3">
      <UAlert class="w-full" color="error" variant="subtle" :description="failure" />
      <UButton color="neutral" variant="subtle" icon="i-material-symbols-refresh" :label="$t('common.action.refresh')" :loading="reading" @click="read" />
    </div>

    <template v-else-if="view.wallet !== null">
      <SettingsGroup :title="$t('supply.title.policy')">
        <template #aside>
          <UButton v-if="view.inherits" size="sm" color="neutral" variant="outline" :label="$t('supply.action.policy_set')" :disabled="busy" @click="editing = true" />
          <template v-else>
            <IconButton size="sm" icon="i-material-symbols-edit" :label="$t('common.action.edit')" :disabled="busy" @click="editing = true" />
            <IconButton size="sm" icon="i-material-symbols-delete-outline" color="error" :label="$t('supply.action.policy_delete')" :disabled="busy" @click="removePolicy" />
          </template>
        </template>

        <SettingsRow :label="$t('supply.label.policy')" :description="view.inherits ? forceLine : ''" :data-supply-policy="view.inherits ? 'inherits' : 'own'">
          <span class="text-sm" :class="view.inherits ? 'text-muted' : 'text-highlighted'">{{ view.inherits ? fromLine : allowedLine }}</span>
        </SettingsRow>
        <SettingsRow :label="$t('supply.label.member_credit_cap')" :description="view.inherits ? $t('supply.label.cap_follows') : ''" data-supply-cap>
          <span class="text-sm tabular-nums text-highlighted">{{ view.policy?.memberCreditCredits === null || view.policy?.memberCreditCredits === undefined ? $t('supply.label.cap_none') : creditsText(t, view.policy.memberCreditCredits) }}</span>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup :title="$t('supply.label.credits')">
        <template #aside>
          <UTooltip :text="$t('supply.action.credit_grant')">
            <UButton size="sm" color="neutral" variant="ghost" icon="i-material-symbols-add" :aria-label="$t('supply.action.credit_grant')" :disabled="busy" @click="granting = true" />
          </UTooltip>
        </template>

        <SettingsRow :label="$t('supply.label.balance')" data-supply-balance>
          <span class="text-sm tabular-nums text-highlighted">{{ view.wallet === null ? '—' : creditsText(t, view.wallet.balance) }}</span>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup :title="$t('supply.title.usage')">
        <SettingsRow v-if="view.usage.length === 0" :label="$t('supply.label.usage_none')" />
        <template v-else>
          <SettingsRow v-for="one in view.usage" :key="`${one.user}:${one.source}`" :label="one.user" :description="sourceLabel(t, one.source)">
            <span class="text-sm tabular-nums text-highlighted" data-supply-member-usage>{{ creditsText(t, one.credits) }}</span>
          </SettingsRow>
        </template>
      </SettingsGroup>

      <p v-if="failure !== ''" role="alert" class="break-words text-sm text-error">{{ failure }}</p>
    </template>

    <SupplyPolicyDialog v-model:open="editing" :title="$t('supply.title.policy_set')" :draft="draft" :available="view?.available ?? []" :send="writePolicy" @saved="void read()" />

    <!-- Credits granted to the unit's wallet: an amount and a line of words kept with it. A grant is the reader's
         act on the platform's credits, not a payment; the top-up road payments would open stands closed. -->
    <SettingsDialog v-model:open="granting" :title="$t('supply.title.credit_grant')" :dirty="grantChanges">
      <form id="supply-grant-form" class="flex flex-col gap-4" @submit.prevent="void grant()">
        <UFormField :label="$t('supply.label.amount')" name="amount">
          <UInput v-model="grantAmount" class="w-full text-end tabular-nums" inputmode="numeric" placeholder="0" :aria-label="$t('supply.label.amount')" />
        </UFormField>
        <UFormField :label="$t('supply.label.words')" name="words">
          <UInput v-model="grantWords" class="w-full" autocomplete="off" :placeholder="$t('supply.label.words_placeholder')" :aria-label="$t('supply.label.words')" />
        </UFormField>
        <p v-if="grantFailed !== ''" role="alert" class="break-words text-sm text-error">{{ grantFailed }}</p>
      </form>

      <template #footer="{ close }">
        <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="busy" @click="close()" />
        <UButton type="submit" form="supply-grant-form" :label="$t('supply.action.grant')" :loading="busy" :disabled="busy || !grantChanges.dirty.value || !/^[1-9][0-9]*$/.test(grantAmount.trim())" />
      </template>
    </SettingsDialog>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { useOpenedWith } from "bmo-ui/app/domain/form-save";

import { useConfirm } from "~/domain/confirm";
import { useChosenUnit } from "~/domain/organization";
import { creditsText, policyDraft, sourceLabel, useSupplyUnits } from "~/domain/supply";

import type { Organization } from "~/domain/organization";
import type { PolicyDraft } from "~/domain/supply";
import type { SupplyOrgView, SupplyPolicy } from "#shared/supply";

interface Props {
  // The organisation chosen, the unit the tab reads and writes.
  company: Organization;
}

const props = defineProps<Props>();

// The tab stands for the organisation chosen alone (docs/web.md, 「Organisation」, the supply tab); the units the
// reader manages supply for name the unit a followed policy comes from where the reader can see it.
const { t } = useI18n();
const confirm = useConfirm();
const managed = useSupplyUnits();

const unit = useChosenUnit(() => props.company.id);
const view = ref<SupplyOrgView | null>(null);
const failure = ref("");
const reading = ref(false);
const editing = ref(false);
const granting = ref(false);
const grantAmount = ref("");
const grantWords = ref("");
const grantFailed = ref("");
const grantChanges = useOpenedWith(() => ({ amount: grantAmount.value, words: grantWords.value }), { open: granting });
const busy = computed(() => reading.value);

const draft = computed<PolicyDraft>(() => policyDraft(view.value?.policy ?? null));

// The sources a policy allows, in order, each one line of the sources' words. Where the unit inherits, the read
// carries the row standing for it from all the way above, named by the unit whose it is; the follower line names
// that unit where the reader can see it.
function policyLine(policy: SupplyPolicy | null): string {
  if (policy === null) return "";

  return [...policy.order].filter((one) => one !== "stop" && policy.allowed.includes(one)).map((one) => sourceLabel(t, one)).join(", ");
}

const forceLine = computed(() => (view.value === null ? "" : policyLine(view.value.policy)));
const allowedLine = computed(() => (view.value === null ? "" : policyLine(view.value.policy)));
const fromLine = computed(() => {
  const standing = view.value?.policy;
  const from = standing?.from;

  if (from === null || from === undefined) return t("supply.label.follows_above");
  const unit = managed.value.find((one) => one.id === from);

  return unit === undefined ? t("supply.label.follows_above") : `${t("supply.label.follows_above")} · ${unit.name}`;
});

async function read(): Promise<void> {
  reading.value = true;
  failure.value = "";
  try {
    view.value = await $fetch<SupplyOrgView>(`/api/supply/org/${unit.value}`);
  } catch (error) {
    view.value = null;
    failure.value = failureText(error, t("supply.error.read_failed"));
  } finally {
    reading.value = false;
  }
}

async function writePolicy(policy: SupplyPolicy): Promise<void> {
  await $fetch(`/api/supply/org/${unit.value}`, { method: "PUT", body: policy });
}

async function removePolicy(): Promise<void> {
  const taken = await confirm({ title: t("supply.message.policy_delete"), effect: t("supply.message.policy_delete_effect"), confirm: t("supply.action.policy_delete") });

  if (!taken) return;

  reading.value = true;
  failure.value = "";
  try {
    // The taking-away is answered with the unit as it now stands, inheriting again.
    view.value = await $fetch<SupplyOrgView>(`/api/supply/org/${unit.value}`, { method: "DELETE" });
  } catch (error) {
    failure.value = failureText(error, t("supply.error.policy_failed"));
  } finally {
    reading.value = false;
  }
}

async function grant(): Promise<void> {
  const amount = grantAmount.value.trim();

  if (!/^[1-9][0-9]*$/.test(amount) || busy.value) return;

  reading.value = true;
  grantFailed.value = "";
  try {
    const words = grantWords.value.trim();

    await $fetch(`/api/supply/org/${unit.value}/credits`, { method: "POST", body: words === "" ? { amount: Number(amount) } : { amount: Number(amount), words } });
    view.value = await $fetch<SupplyOrgView>(`/api/supply/org/${unit.value}`);
    granting.value = false;
    grantAmount.value = "";
    grantWords.value = "";
  } catch (error) {
    grantFailed.value = failureText(error, t("supply.error.grant_failed"));
  } finally {
    reading.value = false;
  }
}

watch(unit, () => void read());
onMounted(() => void read());
</script>
