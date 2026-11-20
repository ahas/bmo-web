<template>
  <!-- The organisation screen's plans tab (docs/web.md, 「Organisation」, the plans tab): the plan the organisation
       chosen runs on, changed in a dialog among the plans it is shown, and the plans it is shown — every
       organisation-scope plan with its switch for the administrator, the plans shown alone, read only, for anyone
       else. The plans themselves are designed on the administrator's plans tab; the account service owns every
       refusal, said in the dialog or under the row. -->
  <div class="flex flex-col gap-4">
    <FailedRead v-if="plans === null && failure !== ''" :message="failure" :reading="reading" @retry="read" />

    <template v-else>
      <SettingsGroup :title="$t('supply.title.plan_applied')" data-plans-applied>
        <template #aside>
          <UButton size="sm" color="neutral" variant="outline" :label="$t('supply.action.plan_change')" :disabled="plans === null" data-plans-change @click="openApply" />
        </template>

        <ContentSkeleton v-if="plans === null" :rows="1" list-class="flex flex-col divide-y divide-default" :label="$t('supply.status.loading')">
          <div class="flex items-center gap-4 py-3">
            <div class="flex min-w-0 flex-1 flex-col">
              <SkeletonLine width="w-1/3" />
              <SkeletonLine width="w-1/2" />
            </div>
            <SkeletonBar class="h-4 w-16 shrink-0" />
          </div>
        </ContentSkeleton>
        <SettingsRow v-else-if="appliedPlan === null" :label="$t('supply.label.plan_applied_none')" />
        <template v-else>
          <SupplyPlanRow :plan="appliedPlan" data-plans-applied-row />
          <SettingsRow :label="$t('supply.label.plan_term')" data-plans-term>
            <span class="text-sm tabular-nums text-highlighted">{{ termText }}</span>
          </SettingsRow>
        </template>
      </SettingsGroup>

      <SettingsGroup :title="$t('supply.title.plan_exposed')" data-plans-exposed>
        <ContentSkeleton v-if="plans === null" :rows="2" list-class="flex flex-col divide-y divide-default" :label="$t('supply.status.loading')">
          <div class="flex items-center gap-4 py-3">
            <div class="flex min-w-0 flex-1 flex-col">
              <SkeletonLine width="w-1/3" />
              <SkeletonLine width="w-1/2" />
            </div>
            <SkeletonBar class="h-4 w-16 shrink-0" />
          </div>
        </ContentSkeleton>

        <!-- The administrator's: every organisation-scope plan, each with its switch; the plan applied stays shown. -->
        <template v-else-if="plans.catalogue !== null">
          <SettingsRow v-if="plans.catalogue.length === 0" :label="$t('supply.label.plans_none')" />
          <SupplyPlanRow v-for="one in plans.catalogue" :key="one.id" :plan="one" :data-plans-catalogue="one.id">
            <template #under>
              <span v-if="refusals[one.id]" role="alert" class="text-sm break-words text-error">{{ refusals[one.id] }}</span>
            </template>
            <HintTip v-if="one.id === applied?.plan" :text="$t('supply.label.plan_applied_locked')" data-plans-applied-switch>
              <span class="inline-flex">
                <USwitch :model-value="true" disabled :aria-label="$t('supply.aria.plan_exposed', { name: one.name })" />
              </span>
            </HintTip>
            <USwitch
              v-else
              :model-value="one.exposed"
              :loading="exposing === one.id"
              :disabled="exposing !== null"
              :aria-label="$t('supply.aria.plan_exposed', { name: one.name })"
              @update:model-value="(on: boolean) => void expose(one.id, on)"
            />
          </SupplyPlanRow>
        </template>

        <!-- Anyone else's: the plans the organisation is shown, read only. -->
        <template v-else>
          <SettingsRow v-if="plans.exposed.length === 0" :label="$t('supply.label.plan_exposed_none')" />
          <SupplyPlanRow v-for="one in plans.exposed" :key="one.id" :plan="one" />
        </template>
      </SettingsGroup>
    </template>

    <!-- The plan applied, chosen among the plans shown, none first; one way through at the foot, open only while the
         choice differs from what stands. -->
    <SettingsDialog v-model:open="applying" :title="$t('supply.title.plan_applied')" :dirty="applyChanges">
      <p v-if="exposedChoices.length === 0" class="text-sm text-muted" data-plans-apply-none>{{ $t("supply.label.plan_exposed_none") }}</p>
      <URadioGroup v-else v-model="choice" :items="choiceItems" :aria-label="$t('supply.title.plan_applied')" data-plans-apply-choices />
      <p v-if="applyFailure !== ''" role="alert" class="text-sm break-words text-error">{{ applyFailure }}</p>

      <template #footer="{ close }">
        <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="applyBusy" @click="close()" />
        <UButton :label="$t('supply.action.plan_apply')" :loading="applyBusy" :disabled="applyBusy || exposedChoices.length === 0 || choice === standingChoice" data-plans-apply @click="void apply()" />
      </template>
    </SettingsDialog>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { useOpenedWith } from "bmo-ui/app/domain/form-save";

import { NO_PLAN, planChoice, planTermText, withExposure } from "~/domain/supply";

import type { Organization } from "~/domain/organization";
import type { SupplyOrgPlans, SupplyPlanEntry } from "#shared/supply";

interface Props {
  // The organisation chosen, whose plans the tab holds.
  company: Organization;
}

const props = defineProps<Props>();

const { t } = useI18n();

const plans = ref<SupplyOrgPlans | null>(null);
const failure = ref("");
const reading = ref(false);

const applied = computed(() => plans.value?.applied ?? null);
// The plan applied, read whole from the plans the organisation is shown, or from every plan for the administrator.
const appliedPlan = computed<SupplyPlanEntry | null>(() => {
  const standing = applied.value;

  if (standing === null || plans.value === null) return null;

  return [...plans.value.exposed, ...(plans.value.catalogue ?? [])].find((one) => one.id === standing.plan) ?? null;
});
const termText = computed(() => (applied.value === null ? "" : planTermText(t, applied.value)));

// The read is answered whole; a failure stands until a read goes through, so a read asked again spins on its button.
async function read(): Promise<void> {
  reading.value = true;
  try {
    plans.value = await $fetch<SupplyOrgPlans>(`/api/supply/org/${props.company.id}/plans`);
    failure.value = "";
  } catch (error) {
    failure.value = failureText(error, t("supply.error.read_failed"));
  } finally {
    reading.value = false;
  }
}

// --- What the organisation is shown, each plan's switch set as it is thrown ---

const exposing = ref<number | null>(null);
const refusals = ref<Record<number, string>>({});

async function expose(plan: number, on: boolean): Promise<void> {
  const standing = plans.value?.catalogue;

  if (standing === null || standing === undefined) return;

  exposing.value = plan;
  refusals.value = { ...refusals.value, [plan]: "" };
  try {
    plans.value = await $fetch<SupplyOrgPlans>(`/api/supply/org/${props.company.id}/plans/exposed`, { method: "PUT", body: { plans: withExposure(standing, plan, on) } });
  } catch (error) {
    refusals.value = { ...refusals.value, [plan]: failureText(error, t("supply.error.plan_failed")) };
  } finally {
    exposing.value = null;
  }
}

// --- The plan applied, chosen in its dialog ---

const applying = ref(false);
const applyBusy = ref(false);
const applyFailure = ref("");
const choice = ref(NO_PLAN);
const standingChoice = computed(() => planChoice(applied.value));
const applyChanges = useOpenedWith(() => choice.value, { open: applying });

const exposedChoices = computed(() => plans.value?.exposed ?? []);
const choiceItems = computed(() => [{ label: t("supply.label.plan_choice_none"), value: NO_PLAN }, ...exposedChoices.value.map((one) => ({ label: one.name, value: String(one.id) }))]);

function openApply(): void {
  choice.value = standingChoice.value;
  applyFailure.value = "";
  applying.value = true;
}

async function apply(): Promise<void> {
  applyBusy.value = true;
  applyFailure.value = "";
  try {
    plans.value = await $fetch<SupplyOrgPlans>(`/api/supply/org/${props.company.id}/plans/applied`, { method: "PUT", body: { plan: choice.value === NO_PLAN ? null : Number(choice.value) } });
    applying.value = false;
  } catch (error) {
    applyFailure.value = failureText(error, t("supply.error.plan_failed"));
  } finally {
    applyBusy.value = false;
  }
}

onMounted(() => void read());
</script>
