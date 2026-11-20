<template>
  <!-- The administration screen's plans tab (docs/web.md, 「Administration」, the supply tab): the membership plans
       the platform sells, each with its price, scope, period, included credits and whether credits may be used on
       it. The service owns every rule a plan breaks; its refusal is said in the dialog or under the row. -->
  <div class="flex flex-col gap-4">
    <ContentSkeleton v-if="plans === null && failure === ''" :rows="3" list-class="flex flex-col divide-y divide-default" :label="$t('supply.status.loading')">
      <div class="flex items-center gap-4 py-3">
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <SkeletonLine width="w-1/3" />
          <SkeletonLine width="w-1/2" />
        </div>
        <SkeletonBar class="h-6 w-10 shrink-0 rounded-md" />
      </div>
    </ContentSkeleton>

    <div v-else-if="plans === null" class="flex flex-col items-end gap-3">
      <UAlert class="w-full" color="error" variant="subtle" :description="failure" />
      <UButton color="neutral" variant="subtle" icon="i-material-symbols-refresh" :label="$t('common.action.refresh')" :loading="reading" @click="read" />
    </div>

    <template v-else>
      <SettingsGroup>
        <SettingsRow v-if="plans.length === 0" :label="$t('supply.label.plans_none')" />
        <template v-else>
          <SupplyPlanRow v-for="one in plans" :key="one.id" :plan="one">
            <IconButton size="sm" icon="i-material-symbols-edit" :label="$t('common.action.edit')" :disabled="busy !== ''" @click="openEdit(one)" />
            <IconButton size="sm" color="error" icon="i-material-symbols-delete-outline" :label="$t('common.action.delete')" :disabled="busy !== ''" @click="remove(one)" />
          </SupplyPlanRow>
        </template>
      </SettingsGroup>

      <p v-if="failure !== ''" role="alert" class="break-words text-sm text-error">{{ failure }}</p>
    </template>

    <SettingsDialog v-model:open="editing" :title="adding ? $t('supply.title.plan_add') : $t('supply.title.plan_edit')" :dirty="planChanges">
      <form id="plan-form" class="flex flex-col gap-4" @submit.prevent="void save()">
        <UFormField :label="$t('common.label.name')" name="name" required>
          <UInput v-model="name" class="w-full" :aria-label="$t('common.label.name')" />
        </UFormField>

        <UFormField :label="$t('supply.label.price')" name="price" :help="$t('supply.label.price_whole')">
          <UInput v-model="price" class="w-full text-end tabular-nums" inputmode="numeric" placeholder="0" :aria-label="$t('supply.label.price')" />
        </UFormField>

        <UFormField :label="$t('supply.label.scope')" name="scope">
          <!-- A plan's scope stands from the day it is made: the service retires and remakes rather than moves a
               plan between the kinds, so an edit names the scope and does not offer it as a field. -->
          <SettingsSegment v-if="adding" v-model="scope" :items="scopeItems" :label="$t('supply.label.scope')" />
          <span v-else class="text-sm text-highlighted">{{ scope === "personal" ? $t("supply.label.scope_personal") : $t("supply.label.scope_organisation") }}</span>
        </UFormField>

        <UFormField :label="$t('supply.label.period')" name="period">
          <ChoiceSelect v-model="period" :items="periodItems" value-key="value" create-item class="w-full" :aria-label="$t('supply.label.period')" />
        </UFormField>

        <UFormField :label="$t('supply.label.included')" name="included">
          <UInput v-model="included" class="w-full text-end tabular-nums" inputmode="numeric" placeholder="0" :aria-label="$t('supply.label.included')" />
        </UFormField>

        <UFormField :label="$t('supply.label.credits_usable')" name="usable">
          <USwitch v-model="usable" :aria-label="$t('supply.label.credits_usable')" />
        </UFormField>

        <p v-if="formFailed !== ''" role="alert" class="break-words text-sm text-error">{{ formFailed }}</p>
      </form>

      <template #footer="{ close }">
        <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="busy !== ''" @click="close()" />
        <UButton type="submit" form="plan-form" :label="adding ? $t('common.action.add') : $t('common.action.save')" :loading="busy === 'save'" :disabled="busy !== '' || !planChanges.dirty.value || name.trim() === '' || !whole(price) || !whole(included)" @click="void save()" />
      </template>
    </SettingsDialog>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { useOpenedWith } from "bmo-ui/app/domain/form-save";

import { useConfirm } from "~/domain/confirm";

import type { SupplyPlanEntry } from "#shared/supply";

// The plans the platform sells, read whole (docs/web.md, 「Administration」, the supply tab). The tab row's add opens
// the form; each row edits and removes on its own.
const { t } = useI18n();
const confirm = useConfirm();

const plans = ref<SupplyPlanEntry[] | null>(null);
const failure = ref("");
const reading = ref(false);
const busy = ref("");
const editing = ref(false);
const adding = ref(true);
const editId = ref<number | null>(null);
const name = ref("");
const price = ref("0");
const scope = ref("personal");
const period = ref("month");
const included = ref("0");
const usable = ref(false);
const formFailed = ref("");

// The form opened with the plan as it stands, or with its blanks where it adds one (docs/web.md, 「Forms」).
const planChanges = useOpenedWith(() => ({ name: name.value, price: price.value, scope: scope.value, period: period.value, included: included.value, usable: usable.value }), { open: editing });

const scopeItems = computed(() => [{ value: "personal", label: t("supply.label.scope_personal") }, { value: "organisation", label: t("supply.label.scope_organisation") }]);
const periodItems = computed(() => [{ value: "month", label: t("supply.label.period_month") }, { value: "year", label: t("supply.label.period_year") }]);

function whole(value: string): boolean {
  return /^(0|[1-9][0-9]*)$/.test(value.trim());
}

async function read(): Promise<void> {
  reading.value = true;
  failure.value = "";
  try {
    plans.value = await $fetch<SupplyPlanEntry[]>("/api/supply/plans");
  } catch (error) {
    failure.value = failureText(error, t("supply.error.read_failed"));
  } finally {
    reading.value = false;
  }
}

function openAdd(): void {
  adding.value = true;
  editId.value = null;
  name.value = "";
  price.value = "0";
  scope.value = "personal";
  period.value = "month";
  included.value = "0";
  usable.value = true;
  formFailed.value = "";
  editing.value = true;
}

function openEdit(plan: SupplyPlanEntry): void {
  adding.value = false;
  editId.value = plan.id;
  name.value = plan.name;
  price.value = String(plan.price);
  scope.value = plan.scope;
  period.value = plan.period;
  included.value = String(plan.includedCredits ?? 0);
  usable.value = plan.creditsUsable;
  formFailed.value = "";
  editing.value = true;
}

async function save(): Promise<void> {
  if (busy.value !== "") return;

  busy.value = "save";
  formFailed.value = "";
  const body = {
    name: name.value.trim(),
    price: Number(price.value.trim()),
    scope: scope.value,
    period: period.value.trim(),
    includedCredits: Number(included.value.trim()),
    creditsUsable: usable.value
  };

  try {
    if (adding.value) await $fetch("/api/supply/plans", { method: "POST", body });
    else await $fetch(`/api/supply/plans/${String(editId.value)}`, { method: "PATCH", body });

    editing.value = false;
    plans.value = await $fetch<SupplyPlanEntry[]>("/api/supply/plans");
  } catch (error) {
    formFailed.value = failureText(error, t("supply.error.plan_failed"));
  } finally {
    busy.value = "";
  }
}

async function remove(plan: SupplyPlanEntry): Promise<void> {
  const taken = await confirm({ title: t("supply.message.plan_delete", { name: plan.name }), effect: t("supply.message.plan_delete_effect"), confirm: t("common.action.delete") });

  if (!taken) return;

  busy.value = "remove";
  failure.value = "";
  try {
    // The retirement is answered with the plans as they now stand.
    plans.value = await $fetch<SupplyPlanEntry[]>(`/api/supply/plans/${String(plan.id)}`, { method: "DELETE" });
  } catch (error) {
    failure.value = failureText(error, t("supply.error.plan_failed"));
  } finally {
    busy.value = "";
  }
}

// The tab row's add, which the screen hands this component by its own name (docs/web.md, 「Administration」).
defineExpose({ addLabel: computed(() => t("supply.action.plan_add")), openAdd });

onMounted(() => void read());
</script>
