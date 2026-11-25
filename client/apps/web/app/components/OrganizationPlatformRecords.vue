<template>
  <!-- The supply tab's credit records with the platform chosen (docs/web.md, 「System and organisation」, the supply tab): the
       ledger and the audit, one at a time by the switch at the group's head. They stand last on the tab, so the list
       shown runs on with the tab's own scroll and reads its next page as its end comes into view, with nothing under
       it; each keeps the pages it read while the other is shown. -->
  <section class="flex flex-col" data-credit-records>
    <div class="flex min-h-8 items-center">
      <TabSwitch v-model="record" :items="records" :label="$t('supply.aria.records')" :compact="narrow" />
    </div>

    <div v-show="record === 'ledger'" class="flex flex-col" data-credit-ledger>
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
      <div v-else>
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
    </div>

    <div v-show="record === 'audit'" class="flex flex-col" data-credit-audit>
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
      <div v-else>
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
    </div>
  </section>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { useNarrow } from "bmo-ui/app/domain/screen";
import { formatStamp } from "bmo-ui/app/domain/time";

import { countText } from "~/domain/numbers";

import type { SwitchItem } from "bmo-ui/app/domain/tabs";
import type { SupplyAuditPage, SupplyLedgerPage } from "#shared/supply";
import type { Translate } from "#shared/wording";

// The platform's ledger and audit, the administrator's (docs/web.md, 「System and organisation」, the supply tab with the platform
// chosen). Each is read when the tab opens and keeps what it read while the other is shown.

type CreditRecord = "ledger" | "audit";

const { t } = useI18n();

// On a phone the switch shows its icons alone, each named by its tooltip.
const narrow = useNarrow();
const record = ref<CreditRecord>("ledger");
const records = computed<SwitchItem<CreditRecord>[]>(() => [
  { value: "ledger", label: t("supply.title.ledger"), icon: "i-material-symbols-receipt-long-outline" },
  { value: "audit", label: t("supply.title.audit"), icon: "i-material-symbols-manage-history" }
]);

const ledger = ref<SupplyLedgerPage | null>(null);
const ledgerFailure = ref("");
const ledgerReading = ref(false);
const audit = ref<SupplyAuditPage | null>(null);
const auditFailure = ref("");
const auditReading = ref(false);

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
  void readLedger();
  void readAudit();
});
</script>
