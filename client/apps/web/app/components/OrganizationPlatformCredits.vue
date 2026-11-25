<template>
  <!-- The supply tab's platform policy and credits (docs/web.md, 「System and organisation」, the supply tab with the platform
       chosen): the platform's own supply standing — the default policy, the conversion, the reservation and the switch
       that makes limits refuse; its ledger and audit stand last on the tab (OrganizationPlatformRecords). No balance of anyone's is shown, and no top-up stands:
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

      <p v-if="failure !== ''" role="alert" class="break-words text-sm text-error">{{ failure }}</p>
    </template>

    <SupplyPolicyDialog v-model:open="editing" :title="$t('supply.title.platform_policy')" :draft="draft" :cap="false" overrides :send="writePolicy" @saved="void read()" />

  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import { POLICY_SOURCES, policyDraft, sourceLabel } from "~/domain/supply";

import type { PolicyDraft, PolicyWrite } from "~/domain/supply";
import type { SupplyPlatformView, SupplyPolicy } from "#shared/supply";

// The platform's supply standing, the administrator's (docs/web.md, 「System and organisation」,
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

onMounted(() => {
  void read();
});
</script>
