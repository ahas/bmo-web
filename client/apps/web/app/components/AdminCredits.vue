<template>
  <!-- The administration screen's credits tab (docs/web.md, 「Administration」, the supply tab): the platform's
       own supply standing — the default policy, the conversion, the reservation and the switch that makes limits
       refuse — beside the grants, the ledger and the audit. No balance of anyone's is shown, and no top-up stands:
       payments are off, and every credit here is the platform's own. -->
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

      <SettingsGroup :title="$t('supply.label.credits')">
        <template #aside>
          <UTooltip :text="$t('supply.action.grant')">
            <UButton size="sm" color="neutral" variant="ghost" icon="i-material-symbols-add" :aria-label="$t('supply.action.grant')" :disabled="busy" @click="openGrant" />
          </UTooltip>
        </template>

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
        <template v-else>
          <SettingsRow v-if="ledger.entries.length === 0" :label="$t('supply.label.ledger_none')" />
          <template v-else>
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
          </template>
          <div v-if="ledger.next !== null" class="flex justify-end py-3">
            <UButton color="neutral" variant="outline" :label="$t('supply.action.more')" :loading="ledgerReading" :disabled="ledgerReading" @click="void moreLedger()" />
          </div>
        </template>
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
        <template v-else>
          <SettingsRow v-if="audit.entries.length === 0" :label="$t('supply.label.audit_none')" />
          <template v-else>
            <SettingsRow v-for="one in audit.entries" :key="one.id" :label="one.subject === '' ? kindText(t, one.kind) : `${kindText(t, one.kind)} · ${one.subject}`">
              <template #description>
                <span class="flex min-w-0 flex-wrap items-center gap-x-2 text-sm text-muted">
                  <span class="tabular-nums">{{ formatStamp(Math.floor(one.at / 1000)) }}</span>
                  <span>{{ one.byName }}</span>
                  <span v-if="one.detail !== ''">{{ one.detail }}</span>
                </span>
              </template>
            </SettingsRow>
          </template>
          <div v-if="audit.next !== null" class="flex justify-end py-3">
            <UButton color="neutral" variant="outline" :label="$t('supply.action.more')" :loading="auditReading" :disabled="auditReading" @click="void moreAudit()" />
          </div>
        </template>
      </SettingsGroup>

      <p v-if="failure !== ''" role="alert" class="break-words text-sm text-error">{{ failure }}</p>
    </template>

    <SupplyPolicyDialog v-model:open="editing" :title="$t('supply.title.platform_policy')" :draft="draft" :cap="false" overrides :send="writePolicy" @saved="void read()" />

    <!-- A grant: a person found by name or an organisation chosen by its path, an amount and the words kept with it
         (docs/web.md, 「Administration」, the supply tab). The person search is the directory's own. -->
    <SettingsDialog v-model:open="granting" :title="$t('supply.title.credit_grant')" :dirty="grantChanges">
      <form id="supply-credit-form" class="flex flex-col gap-4" @submit.prevent="void grant()">
        <UFormField :label="$t('supply.label.scope')" name="scope">
          <SettingsSegment v-model="ownerKind" :items="ownerKindItems" :label="$t('supply.label.scope')" />
        </UFormField>

        <UFormField :label="$t('supply.label.owner')" name="owner">
          <ChoiceSelect v-if="ownerKind === 'user'" v-model="ownerId" :items="[]" :find="findPeople" value-key="value" class="w-full" :placeholder="$t('supply.placeholder.find_person')" :aria-label="$t('supply.label.owner')" />
          <ChoiceSelect v-else v-model="ownerId" :items="unitChoices" value-key="value" class="w-full" :aria-label="$t('supply.label.owner')" />
        </UFormField>

        <UFormField :label="$t('supply.label.amount')" name="amount">
          <UInput v-model="amount" class="w-full text-end tabular-nums" inputmode="numeric" placeholder="0" :aria-label="$t('supply.label.amount')" />
        </UFormField>
        <UFormField :label="$t('supply.label.words')" name="words">
          <UInput v-model="words" class="w-full" autocomplete="off" :placeholder="$t('supply.label.words_placeholder')" :aria-label="$t('supply.label.words')" />
        </UFormField>

        <p v-if="grantFailed !== ''" role="alert" class="break-words text-sm text-error">{{ grantFailed }}</p>
      </form>

      <template #footer="{ close }">
        <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="reading" @click="close()" />
        <UButton type="submit" form="supply-credit-form" :label="$t('supply.action.grant')" :loading="reading" :disabled="reading || ownerId === '' || !whole(amount) || !grantChanges.dirty.value" @click="void grant()" />
      </template>
    </SettingsDialog>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { useOpenedWith } from "bmo-ui/app/domain/form-save";
import { formatStamp } from "bmo-ui/app/domain/time";

import { POLICY_SOURCES, policyDraft, sourceLabel, unitPathLabel, useSupplyUnits } from "~/domain/supply";

import { countText } from "~/domain/numbers";

import type { PolicyDraft, PolicyWrite } from "~/domain/supply";
import type { SupplyAuditPage, SupplyLedgerPage, SupplyPlatformView, SupplyPolicy } from "#shared/supply";
import type { PersonView } from "#shared/people";
import type { Translate } from "#shared/wording";
import type { SelectMenuItem } from "@nuxt/ui";

// The platform's supply standing and the credit road, all the administrator's (docs/web.md, 「Administration」,
// the supply tab). Every switch and field here takes effect as it is changed; the service is the owner of each
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

// The grant's organisation choice: every unit the administrator manages — which for them is every unit.
const managed = useSupplyUnits();
const granting = ref(false);
const ownerKind = ref<"user" | "organisation">("user");
const ownerId = ref("");
const amount = ref("");
const words = ref("");
const grantFailed = ref("");
const grantChanges = useOpenedWith(() => ({ kind: ownerKind.value, owner: ownerId.value, amount: amount.value, words: words.value }), { open: granting });

const ownerKindItems = [{ value: "user", label: t("supply.label.scope_personal") }, { value: "organisation", label: t("supply.label.scope_organisation") }];
const unitChoices = computed(() => managed.value.map((one) => ({ label: unitPathLabel(managed.value, one), value: String(one.id) })));
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

async function findPeople(words: string): Promise<SelectMenuItem[]> {
  if (words.trim() === "") return [];

  const found = await $fetch<PersonView[]>("/api/people/search", { query: { q: words } });

  return found.slice(0, 20).map((one) => ({ label: one.name, description: one.organization, value: one.user }));
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

async function moreLedger(): Promise<void> {
  const after = ledger.value?.next;

  if (after === null || after === undefined || ledgerReading.value) return;

  ledgerReading.value = true;
  try {
    const page = await $fetch<SupplyLedgerPage>("/api/supply/credits/ledger", { query: { after } });

    ledger.value = { entries: [...(ledger.value?.entries ?? []), ...page.entries], next: page.next };
  } catch (error) {
    ledgerFailure.value = failureText(error, t("supply.error.ledger_failed"));
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

async function moreAudit(): Promise<void> {
  const after = audit.value?.next;

  if (after === null || after === undefined || auditReading.value) return;

  auditReading.value = true;
  try {
    const page = await $fetch<SupplyAuditPage>("/api/supply/credits/audit", { query: { after } });

    audit.value = { entries: [...(audit.value?.entries ?? []), ...page.entries], next: page.next };
  } catch (error) {
    auditFailure.value = failureText(error, t("supply.error.audit_failed"));
  } finally {
    auditReading.value = false;
  }
}

function openGrant(): void {
  ownerKind.value = "user";
  ownerId.value = "";
  amount.value = "";
  words.value = "";
  grantFailed.value = "";
  granting.value = true;
}

async function grant(): Promise<void> {
  if (!whole(amount.value) || ownerId.value === "" || reading.value) return;

  reading.value = true;
  grantFailed.value = "";
  try {
    const body = words.value.trim() === "" ? { ownerKind: ownerKind.value, ownerId: Number(ownerId.value), amount: Number(amount.value.trim()) } : { ownerKind: ownerKind.value, ownerId: Number(ownerId.value), amount: Number(amount.value.trim()), words: words.value.trim() };

    await $fetch("/api/supply/credits", { method: "POST", body });
    granting.value = false;
    await readLedger();
  } catch (error) {
    grantFailed.value = failureText(error, t("supply.error.grant_failed"));
  } finally {
    reading.value = false;
  }
}

onMounted(() => {
  void read();
  void readLedger();
  void readAudit();
});
</script>
