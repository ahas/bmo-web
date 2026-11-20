<template>
  <!-- The organisation screen's BMO tab (docs/web.md, 「Organisation」, the BMO tab): the organisation chosen, where the
       reader heads a unit of it; its default for its people's BMOs, for the administrator and the company's own heads,
       its text parts changed in a form and its picture set in place; and who may personalise their BMO, the company's
       tree from the reader's highest unit down, each unit and, opened, each person with a choice saved as it is made. -->
  <div class="flex flex-col gap-4">
    <ContentSkeleton v-if="units === null && unitsFailure === ''" :rows="2" listClass="flex flex-col divide-y divide-default" :label="$t('bmo_profile.status.loading')">
      <div class="flex items-center gap-4 py-3">
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <SkeletonLine width="w-1/3" />
          <SkeletonLine width="w-1/2" />
        </div>
      </div>
    </ContentSkeleton>

    <div v-else-if="units === null" class="flex flex-col items-end gap-3">
      <UAlert class="w-full" color="error" variant="subtle" :description="unitsFailure" />
      <UButton color="neutral" variant="subtle" icon="i-material-symbols-refresh" :label="$t('common.action.refresh')" :loading="unitsPending" @click="refreshUnits()" />
    </div>

    <p v-else-if="company === ''" class="text-sm text-muted">{{ $t("bmo_profile.label.no_companies") }}</p>

    <template v-else>
      <SettingsGroup v-if="mayDefault" :title="$t('bmo_profile.label.company_default')">
        <template v-if="companyDefault !== null">
          <SettingsRow :label="$t('bmo_profile.label.name')" :description="nameShown(t, companyDefault.name)" data-bmo-default="name">
            <UButton color="neutral" variant="outline" :label="$t('account.action.change')" data-bmo-default-change @click="editing = true" />
          </SettingsRow>
          <SettingsRow
            :label="$t('bmo_profile.label.call_names')"
            :description="companyDefault.callNames.length > 0 ? companyDefault.callNames.join(', ') : $t('bmo_profile.label.no_call_names')"
            data-bmo-default="call-names"
          />
          <div class="py-3">
            <PictureSetting :key="company" kind="company-bmo" :subject="company" :avatar="defaultPicture" />
          </div>
        </template>
        <p v-else-if="defaultFailure !== ''" role="alert" class="py-3 text-sm text-error">{{ defaultFailure }}</p>
        <ContentSkeleton v-else :rows="2" listClass="flex flex-col divide-y divide-default" :label="$t('bmo_profile.status.loading')">
          <div class="flex items-center gap-4 py-3">
            <SkeletonLine width="w-1/3" />
          </div>
        </ContentSkeleton>
      </SettingsGroup>

      <SettingsGroup :title="$t('bmo_profile.label.permission')">
        <p v-if="treeFailure !== ''" role="alert" class="py-3 text-sm text-error">{{ treeFailure }}</p>
        <ContentSkeleton v-else-if="tree === null" :rows="3" listClass="flex flex-col divide-y divide-default" :label="$t('bmo_profile.status.loading')">
          <div class="flex items-center gap-4 py-3">
            <SkeletonLine width="w-1/3" />
            <SkeletonBar class="ms-auto h-8 w-32 shrink-0 rounded-md" />
          </div>
        </ContentSkeleton>
        <ul v-else role="tree" :aria-label="$t('bmo_profile.aria.tree')" class="flex flex-col divide-y divide-default" data-bmo-permissions>
          <li v-for="row in rows" :key="row.key" role="treeitem" :aria-expanded="row.kind === 'unit' && row.people > 0 ? open.has(Number(row.subject)) : undefined" class="flex flex-col gap-1 py-2" :data-bmo-permission="row.key">
            <div class="flex min-w-0 items-center gap-2" :style="{ paddingInlineStart: `${row.depth * 16}px` }">
              <IconButton
                v-if="row.kind === 'unit' && row.people > 0"
                size="sm"
                color="neutral"
                variant="ghost"
                :icon="open.has(Number(row.subject)) ? 'i-material-symbols-keyboard-arrow-down' : 'i-material-symbols-keyboard-arrow-right'"
                :label="row.name"
                class="shrink-0"
                @click="toggle(Number(row.subject))"
              />
              <span v-else class="flex size-8 shrink-0 items-center justify-center">
                <UIcon :name="row.kind === 'person' ? 'i-material-symbols-person-outline' : 'i-material-symbols-account-tree-outline'" class="size-5 text-muted" />
              </span>
              <div class="flex min-w-0 flex-1 flex-col">
                <span class="truncate text-sm text-highlighted">{{ row.name }}</span>
                <span v-if="followsLine(t, row) !== null" class="text-sm text-muted">{{ followsLine(t, row) }}</span>
              </div>
              <ChoiceSelect
                :model-value="shownSetting(row)"
                :items="settingItems(t, row.company)"
                value-key="value"
                size="sm"
                class="w-36 shrink-0"
                :aria-label="row.name"
                :loading="saving === row.key"
                :disabled="saving !== null"
                @update:model-value="(value: PermissionSetting) => setPermission(row, value)"
              />
            </div>
            <p v-if="refusals[row.key]" role="alert" class="text-sm text-error" :style="{ paddingInlineStart: `${row.depth * 16 + 40}px` }">{{ refusals[row.key] }}</p>
          </li>
        </ul>
      </SettingsGroup>

      <BmoProfileForm
        v-if="companyDefault !== null"
        v-model:open="editing"
        :title="$t('bmo_profile.label.company_default')"
        :parts="{ name: companyDefault.name, callNames: companyDefault.callNames, persona: null }"
        :persona="false"
        :save="saveDefault"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import { followsLine, headsCompany, nameShown, permissionRows, permissionTops, settingItems, shownSetting } from "~/domain/bmo-profile";
import { inviteCompanies } from "~/domain/invites";

import type { PermissionRow } from "~/domain/bmo-profile";
import type { Organization } from "~/domain/organization";
import type { CompanyBmoView, OwnBmoParts, PermissionSetting, PermissionTree } from "#shared/bmo-profile";
import type { InviteUnit } from "@web/server-client";
import type { AvatarProps } from "@nuxt/ui";

interface Props {
  // The organisation chosen, the company the tab sets.
  company: Organization;
}

const props = defineProps<Props>();

const { t } = useI18n();
const route = useRoute();

// The same read the shell's invitations entry makes, so the tab opens on what it already holds.
const { data: unitData, status: unitsStatus, error: unitsError, pending: unitsPending, refresh: refreshUnits } = useFetch<InviteUnit[]>("/api/invites/units", { key: "invite-units", server: false, lazy: true, default: () => [] });

// The units the reader heads, or null until the first read has answered.
const units = computed(() => (unitsStatus.value === "success" ? unitData.value : null));
const unitsFailure = computed(() => (unitsError.value ? failureText(unitsError.value, t("bmo_profile.error.read_failed")) : ""));
// The organisation chosen, where the reader heads a unit of it; none where they head none there.
const company = computed(() => (inviteCompanies(units.value ?? []).some((one) => one.id === props.company.id) ? String(props.company.id) : ""));
const mayDefault = computed(() => company.value !== "" && headsCompany(units.value ?? [], Number(company.value)));

const companyDefault = ref<CompanyBmoView | null>(null);
const defaultFailure = ref("");
const editing = ref(false);
const pictureAt = ref(Date.now());

const tree = ref<PermissionTree | null>(null);
const treeFailure = ref("");
const open = ref(new Set<number>());
const saving = ref<string | null>(null);
const refusals = ref<Record<string, string>>({});
const rows = computed<PermissionRow[]>(() => (tree.value === null ? [] : permissionRows(tree.value, open.value)));

const defaultPicture = computed<AvatarProps>(() => ({
  src: companyDefault.value?.picture === true ? `/api/organization/companies/${company.value}/agent/picture?at=${pictureAt.value}` : undefined,
  alt: nameShown(t, companyDefault.value?.name ?? null)
}));

// The unit the address names is opened with its people once its company's tree stands, and brought into view: the
// people tab's BMO permission opens the tab at a person's unit. Each unit asked is opened once, so the tree read again
// after a choice leaves the reader where they are.
let openedAsked = "";

async function openAsked(): Promise<void> {
  const unit = Number(route.query.unit);
  const asked = `${company.value}:${unit}`;

  if (tree.value === null || asked === openedAsked || !tree.value.units.some((one) => one.id === unit)) return;

  openedAsked = asked;
  open.value = new Set([...open.value, unit]);
  await nextTick();
  document.querySelector(`[data-bmo-permission="unit:${unit}"]`)?.scrollIntoView({ block: "center" });
}

watch([tree, () => route.query.unit], () => void openAsked());

watch(company, () => void readCompany(), { immediate: true });

async function readCompany(): Promise<void> {
  const chosen = company.value;

  companyDefault.value = null;
  defaultFailure.value = "";
  tree.value = null;
  treeFailure.value = "";
  refusals.value = {};

  if (chosen === "") return;

  if (mayDefault.value) {
    $fetch<CompanyBmoView>(`/api/organization/companies/${chosen}/agent`)
      .then((answer) => {
        if (company.value === chosen) companyDefault.value = answer;
      })
      .catch((error: unknown) => {
        if (company.value === chosen) defaultFailure.value = failureText(error, t("bmo_profile.error.read_failed"));
      });
  }

  await readTree(chosen);
}

// The tree from each of the reader's highest units in the company down, laid one after another.
async function readTree(chosen: string): Promise<void> {
  try {
    const parts = await Promise.all(permissionTops(units.value ?? [], Number(chosen)).map((unit) => $fetch<PermissionTree>(`/api/organization/units/${unit}/agent-permissions`)));

    if (company.value !== chosen) return;

    tree.value = { units: parts.flatMap((part) => part.units), people: parts.flatMap((part) => part.people) };
  } catch (error) {
    if (company.value === chosen) treeFailure.value = failureText(error, t("bmo_profile.error.read_failed"));
  }
}

function toggle(unit: number): void {
  const next = new Set(open.value);

  if (next.has(unit)) next.delete(unit);
  else next.add(unit);

  open.value = next;
}

// A choice saved as it is made; the tree is read again, since a unit's choice moves what every row under it resolves
// to. A refusal is said under the row, which goes back to what stood.
async function setPermission(row: PermissionRow, setting: PermissionSetting): Promise<void> {
  if (setting === shownSetting(row)) return;

  const path = row.kind === "unit" ? `/api/organization/units/${row.subject}/agent-permission` : `/api/organization/users/${row.subject}/agent-permission`;

  saving.value = row.key;
  refusals.value = { ...refusals.value, [row.key]: "" };

  try {
    await $fetch(path, { method: "PUT", body: { setting } });
    await readTree(company.value);
  } catch (error) {
    refusals.value = { ...refusals.value, [row.key]: failureText(error, t("bmo_profile.error.failed")) };
  } finally {
    saving.value = null;
  }
}

async function saveDefault(parts: OwnBmoParts): Promise<void> {
  companyDefault.value = await $fetch<CompanyBmoView>(`/api/organization/companies/${company.value}/agent`, { method: "PUT", body: { name: parts.name, callNames: parts.callNames } });
  pictureAt.value = Date.now();
}
</script>
