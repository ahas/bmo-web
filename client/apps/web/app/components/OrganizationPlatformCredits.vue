<template>
  <!-- The supply tab's platform policy and credits (docs/web.md, 「Organisation」, the supply tab with the platform
       chosen): the platform's own supply standing — the default policy, the conversion, the reservation and the switch
       that makes limits refuse — beside the ledger and the audit. No balance of anyone's is shown, and no top-up stands:
       payments are off, and every credit here is the platform's own; a grant is made at the wallet it fills. -->
  <div class="flex flex-col gap-4">
    <ContentSkeleton v-if="platform === null && failure === ''" :rows="4" list-class="flex flex-col divide-y divide-default" :label="$t('supply.status.loading')">
      <div class="flex items-center gap-4 py-3">
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <SkeletonLine width="w-1/3" />
          <SkeletonLine width="w-1/2" />
        </div>
        <SkeletonBar class="h-6 w-24 shrink-0 rounded-md" />
      </div>
    </ContentSkeleton>

    <div v-else-if="platform === null" class="flex flex-col items-end gap-3">
      <UAlert class="w-full" color="error" variant="subtle" :description="failure" />
      <UButton color="neutral" variant="subtle" icon="i-material-symbols-refresh" :label="$t('common.action.refresh')" :loading="reading" @click="read" />
    </div>

    <template v-else>
      <SettingsGroup :title="$t('supply.title.platform_policy')">
        <template #aside>
          <IconButton size="sm" icon="i-material-symbols-edit" :label="$t('common.action.edit')" :disabled="busy" @click="editing = true" />
        </template>
        <!-- Each source's value, and under it whether a person's own setting may change it; the order the same. -->
        <SettingsRow v-for="one in POLICY_SOURCES" :key="one.value" :label="$t(one.label)" :description="overridableText(platform.overridable.includes(one.value))" :data-platform-source="one.value">
          <span class="text-sm text-highlighted">{{ platform.policy.allowed.includes(one.value) ? $t("supply.label.source_on") : $t("supply.label.source_off") }}</span>
        </SettingsRow>
        <SettingsRow :label="$t('supply.label.order')" :description="overridableText(platform.orderOverridable)" data-platform-order>
          <span class="text-sm text-highlighted" data-platform-allowed>{{ policyLine(platform.policy) }}</span>
        </SettingsRow>
        <SettingsRow :label="$t('supply.label.rate')" :description="$t('supply.label.rate_note')">
          <UInput v-model="rateWords" class="w-28 text-end tabular-nums" inputmode="numeric" :aria-label="$t('supply.label.rate')" :disabled="busy" @keyup.enter="saveField('creditsPerDollar')" @blur="saveField('creditsPerDollar')" />
        </SettingsRow>
        <SettingsRow :label="$t('supply.label.reservation')" :description="$t('supply.label.reservation_note')">
          <UInput v-model="reservationWords" class="w-28 text-end tabular-nums" inputmode="numeric" :aria-label="$t('supply.label.reservation')" :disabled="busy" @keyup.enter="saveField('reservationCredits')" @blur="saveField('reservationCredits')" />
        </SettingsRow>
        <SettingsRow :label="$t('supply.label.enforce')" :description="$t('supply.label.enforce_note')">
          <USwitch :model-value="platform.enforce" :loading="busy" :disabled="busy" :aria-label="$t('supply.label.enforce')" @update:model-value="(on: boolean) => void throwEnforce(on)" />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup :title="$t('supply.title.ledger')">
        <FailedRead v-if="ledgerFailure !== ''" class="py-3" :message="ledgerFailure" :reading="false" @retry="void readLedger()" />
        <ContentSkeleton v-else-if="ledger === null" :rows="3" list-class="flex flex-col divide-y divide-default" :label="$t('supply.status.ledger_loading')">
          <div class="flex items-center gap-4 py-3">
            <div class="flex min-w-0 flex-1 flex-col gap-1">
              <SkeletonLine width="w-1/3" />
              <SkeletonLine width="w-1/2" />
            </div>
            <SkeletonBar class="h-4 w-16 shrink-0 rounded-md" />
          </div>
        </ContentSkeleton>
        <SettingsRow v-else-if="ledger.entries.length === 0" :label="$t('supply.label.ledger_none')" />
        <!-- The ledger scrolls in a box of its own, so its end comes into view and asks the next page while the audit
             under it stays reachable. -->
        <div v-else class="max-h-96 overflow-y-auto" tabindex="0" :aria-label="$t('supply.title.ledger')" data-credit-ledger>
          <div class="flex flex-col divide-y divide-default">
            <SettingsRow v-for="one in ledger.entries" :key="one.id" :label="$t(one.ownerKind === 'organisation' ? 'supply.label.owner_organisation' : 'supply.label.owner_user') + ' ' + one.ownerId">
              <template #description>
                <span class="flex min-w-0 flex-wrap items-center gap-x-2 text-sm text-muted">
                  <span>{{ kindText(t, one.kind) }}</span>
                  <span class="tabular-nums">{{ formatStamp(Math.floor(one.at / 1000)) }}</span>
                  <span v-if="one.words !== null && one.words !== ''">{{ one.words }}</span>
                </span>
              </template>
              <span class="text-sm tabular-nums" :class="one.amount < 0 ? 'text-toned' : 'text-highlighted'" data-credit-amount>{{ (one.amount < 0 ? '' : '+') + countText(one.amount) }}</span>
            </SettingsRow>
          </div>
          <NextPageFoot inset="" :more="ledger.next !== null" :busy="ledgerReading" :next="moreLedger" :failed-words="$t('supply.error.ledger_failed')" :loading-label="$t('supply.status.ledger_loading')" list-class="flex flex-col">
            <div class="flex items-center gap-4 border-t border-default py-3">
              <div class="flex min-w-0 flex-1 flex-col gap-1">
                <SkeletonLine width="w-1/3" />
                <SkeletonLine width="w-1/2" />
              </div>
              <SkeletonBar class="h-4 w-16 shrink-0 rounded-md" />
            </div>
          </NextPageFoot>
        </div>
      </SettingsGroup>

      <SettingsGroup :title="$t('supply.title.audit')">
        <FailedRead v-if="auditFailure !== ''" class="py-3" :message="auditFailure" :reading="false" @retry="void readAudit()" />
        <ContentSkeleton v-else-if="audit === null" :rows="3" list-class="flex flex-col divide-y divide-default" :label="$t('supply.status.audit_loading')">
          <div class="flex items-center gap-4 py-3">
            <div class="flex min-w-0 flex-1 flex-col gap-1">
              <SkeletonLine width="w-1/3" />
              <SkeletonLine width="w-1/2" />
            </div>
          </div>
        </ContentSkeleton>
        <SettingsRow v-else-if="audit.entries.length === 0" :label="$t('supply.label.audit_none')" />
        <div v-else class="max-h-96 overflow-y-auto" tabindex="0" :aria-label="$t('supply.title.audit')" data-credit-audit>
          <div class="flex flex-col divide-y divide-default">
            <SettingsRow v-for="one in audit.entries" :key="one.id" :label="one.subject === '' ? kindText(t, one.kind) : `${kindText(t, one.kind)} · ${one.subject}`">
              <template #description>
                <span class="flex min-w-0 flex-wrap items-center gap-x-2 text-sm text-muted">
                  <span class="tabular-nums">{{ formatStamp(Math.floor(one.at / 1000)) }}</span>
                  <span>{{ one.byName }}</span>
                  <span v-if="one.detail !== ''">{{ one.detail }}</span>
                </span>
              </template>
            </SettingsRow>
          </div>
          <NextPageFoot inset="" :more="audit.next !== null" :busy="auditReading" :next="moreAudit" :failed-words="$t('supply.error.audit_failed')" :loading-label="$t('supply.status.audit_loading')" list-class="flex flex-col">
            <div class="flex items-center gap-4 border-t border-default py-3">
              <div class="flex min-w-0 flex-1 flex-col gap-1">
                <SkeletonLine width="w-1/3" />
                <SkeletonLine width="w-1/2" />
              </div>
            </div>
          </NextPageFoot>
        </div>
      </SettingsGroup>

      <p v-if="failure !== ''" role="alert" class="break-words text-sm text-error">{{ failure }}</p>
    </template>

    <SupplyPolicyDialog v-model:open="editing" :title="$t('supply.title.platform_policy')" :draft="draft" :cap="false" overrides :send="writePolicy" @saved="void read()" />

  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { formatStamp } from "bmo-ui/app/domain/time";

import { POLICY_SOURCES, policyDraft, sourceLabel } from "~/domain/supply";

import { countText } from "~/domain/numbers";

import type { PolicyDraft, PolicyWrite } from "~/domain/supply";
import type { SupplyAuditPage, SupplyLedgerPage, SupplyPlatformView, SupplyPolicy } from "#shared/supply";
import type { Translate } from "#shared/wording";

// The platform's supply standing, its ledger and its audit, all the administrator's (docs/web.md, 「Organisation」,
// the supply tab with the platform chosen). Every switch and field here takes effect as it is changed; the service is the owner of each
// refusal, which is said under the group.

const { t } = useI18n();

const platform = ref<SupplyPlatformView | null>(null);
const failure = ref("");
const reading = ref(false);
const editing = ref(false);
const rateWords = ref("");
const reservationWords = ref("");
const busy = computed(() => reading.value);

const ledger = ref<SupplyLedgerPage | null>(null);
const ledgerFailure = ref("");
const ledgerReading = ref(false);
const audit = ref<SupplyAuditPage | null>(null);
const auditFailure = ref("");
const auditReading = ref(false);

const draft = computed<PolicyDraft>(() => policyDraft(platform.value?.policy ?? null, platform.value ?? undefined));

function whole(value: string): boolean {
  return /^[1-9][0-9]*$/.test(value.trim());
}

// The order a run falls through the sources on, the end of the fall alone where none is.
function policyLine(policy: SupplyPolicy): string {
  const open = policy.order.filter((one) => one !== "stop" && policy.allowed.includes(one));

  return (open.length === 0 ? ["stop" as const] : open).map((one) => sourceLabel(t, one)).join(", ");
}

// Whether a person's own setting may change a source or the order, in the one muted line under its row.
function overridableText(overridable: boolean): string {
  return overridable ? t("supply.label.overridable") : t("supply.label.fixed");
}

// The kinds the two records answer, in the console's words where they are known and named by their code where they
// are not: sumida's ledger kinds beside the audited acts the supply routes keep.
function kindText(t: Translate, kind: string): string {
  const keys: Record<string, string> = {
    grant: "supply.label.kind_grant",
    consume: "supply.label.kind_consume",
    reserve: "supply.label.kind_reserve",
    capture: "supply.label.kind_capture",
    refund: "supply.label.kind_refund",
    debit: "supply.label.kind_debit",
    policy: "supply.label.kind_policy",
    settings: "supply.label.kind_settings",
    plan: "supply.label.kind_plan"
  };
  const key = keys[kind];

  return key === undefined ? t("supply.label.kind_named", { kind }) : t(key);
}

async function read(): Promise<void> {
  reading.value = true;
  failure.value = "";
  try {
    platform.value = await $fetch<SupplyPlatformView>("/api/supply/platform");
    rateWords.value = String(platform.value.creditsPerDollar);
    reservationWords.value = String(platform.value.reservationCredits);
  } catch (error) {
    failure.value = failureText(error, t("supply.error.read_failed"));
  } finally {
    reading.value = false;
  }
}

async function writePolicy(policy: PolicyWrite): Promise<void> {
  await $fetch("/api/supply/platform", { method: "PUT", body: { allowed: policy.allowed, order: policy.order, overridable: policy.overridable, orderOverridable: policy.orderOverridable } });
}

// One number field, written when it is done being written: an unchanged or unreadable value is let go in silence,
// the standing one written back into the box.
async function saveField(field: "creditsPerDollar" | "reservationCredits"): Promise<void> {
  const wordsOf = field === "creditsPerDollar" ? rateWords : reservationWords;
  const standing = platform.value === null ? "" : String(platform.value[field]);

  if (!whole(wordsOf.value) || Number(wordsOf.value) === platform.value?.[field]) {
    wordsOf.value = standing;
    return;
  }

  reading.value = true;
  try {
    platform.value = await $fetch<SupplyPlatformView>("/api/supply/platform", { method: "PUT", body: { [field]: Number(wordsOf.value) } });
    wordsOf.value = String(platform.value[field]);
  } catch (error) {
    failure.value = failureText(error, t("supply.error.platform_failed"));
    wordsOf.value = standing;
  } finally {
    reading.value = false;
  }
}

async function throwEnforce(on: boolean): Promise<void> {
  reading.value = true;
  try {
    platform.value = await $fetch<SupplyPlatformView>("/api/supply/platform", { method: "PUT", body: { enforce: on } });
  } catch (error) {
    failure.value = failureText(error, t("supply.error.platform_failed"));
  } finally {
    reading.value = false;
  }
}

async function readLedger(): Promise<void> {
  ledgerReading.value = true;
  ledgerFailure.value = "";
  try {
    ledger.value = await $fetch<SupplyLedgerPage>("/api/supply/credits/ledger");
  } catch (error) {
    ledgerFailure.value = failureText(error, t("supply.error.ledger_failed"));
  } finally {
    ledgerReading.value = false;
  }
}

// One page more of the ledger, read as its foot comes into view; a failure is thrown to the foot, which keeps the
// rows already read and offers the retry in the failed page's place.
async function moreLedger(): Promise<void> {
  const after = ledger.value?.next;

  if (after === null || after === undefined) return;

  ledgerReading.value = true;
  try {
    const page = await $fetch<SupplyLedgerPage>("/api/supply/credits/ledger", { query: { after } });

    ledger.value = { entries: [...(ledger.value?.entries ?? []), ...page.entries], next: page.next };
  } finally {
    ledgerReading.value = false;
  }
}

async function readAudit(): Promise<void> {
  auditReading.value = true;
  auditFailure.value = "";
  try {
    audit.value = await $fetch<SupplyAuditPage>("/api/supply/credits/audit");
  } catch (error) {
    auditFailure.value = failureText(error, t("supply.error.audit_failed"));
  } finally {
    auditReading.value = false;
  }
}

// One page more of the audit, read as its foot comes into view; a failure is thrown to the foot, which keeps the
// rows already read and offers the retry in the failed page's place.
async function moreAudit(): Promise<void> {
  const after = audit.value?.next;

  if (after === null || after === undefined) return;

  auditReading.value = true;
  try {
    const page = await $fetch<SupplyAuditPage>("/api/supply/credits/audit", { query: { after } });

    audit.value = { entries: [...(audit.value?.entries ?? []), ...page.entries], next: page.next };
  } finally {
    auditReading.value = false;
  }
}

onMounted(() => {
  void read();
  void readLedger();
  void readAudit();
});
</script>
