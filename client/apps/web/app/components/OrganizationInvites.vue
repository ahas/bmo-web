<template>
  <!-- Invitations (docs/web.md, 「Organisation settings」, the invitations tab): a link made into a unit the reader
       heads, or any for the administrator, chosen as a company and then a unit of its tree, with the role the person
       takes there, in a dialog the tab row's add opens; copied with its words and when it closes; the open
       ones listed, each copied again or taken back. -->
  <div class="flex flex-col gap-6">
    <p v-if="units !== null && units.length === 0" class="text-sm text-muted">{{ $t("invites.label.no_units") }}</p>

    <SettingsGroup :title="$t('invites.label.open')">
      <SettingsRow v-if="invites.length === 0" :label="$t('invites.label.none')" />
      <SettingsRow
        v-for="invite in invites"
        :key="invite.token"
        :label="`${placeOf(invite)} · ${$t(invite.head ? 'organization.label.role_head' : 'organization.label.role_member')}`"
        :description="$t('invites.label.until', { time: formatStamp(invite.expiresAt / 1000) })"
      >
        <UButton color="neutral" variant="ghost" size="xs" :label="copied === invite.token ? $t('invites.status.copied') : $t('invites.action.copy')" @click="copy(invite)" />
        <UButton color="error" variant="ghost" size="xs" :label="$t('invites.action.drop')" @click="drop(invite.token)" />
      </SettingsRow>
    </SettingsGroup>

    <p v-if="failure !== ''" role="alert" class="text-sm text-error">{{ failure }}</p>

    <SettingsDialog v-model:open="making" :title="$t('invites.label.make')">
      <form id="invite-form" class="flex flex-col gap-4" @submit.prevent="make">
        <UFormField :label="$t('invites.label.company')" name="company">
          <USelect :model-value="company" :items="companyItems" class="w-full" :aria-label="$t('invites.label.company')" data-invite-company @update:model-value="chooseCompany" />
        </UFormField>

        <!-- The chosen company's tree, as the units tab draws it; the path down to the unit chosen reads above it. -->
        <UFormField :label="$t('invites.label.unit')" :description="chosenPath" name="unit">
          <div role="group" :aria-label="$t('invites.label.unit')" data-invite-unit-tree>
            <OrganizationUnitTree v-model:expanded="expanded" :units="treeUnits" :chosen="unit" @choose="(id: number) => (unit = id)" />
          </div>
        </UFormField>

        <UFormField :label="$t('invites.label.role')" name="role">
          <USelect v-model="role" :items="roleItems" class="w-full" :aria-label="$t('invites.label.role')" data-invite-role />
        </UFormField>

        <UFormField :label="$t('invites.label.hours')" name="hours">
          <USelect v-model="hours" :items="spans" class="w-full" :aria-label="$t('invites.label.hours')" />
        </UFormField>

        <p v-if="makeFailure !== ''" role="alert" class="break-words text-sm text-error">{{ makeFailure }}</p>
      </form>

      <template #footer="{ close }">
        <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="busy" @click="close()" />
        <UButton type="submit" form="invite-form" :label="$t('invites.action.make')" :loading="busy" :disabled="busy || unit === null" />
      </template>
    </SettingsDialog>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { formatStamp } from "bmo-ui/app/domain/time";

import { companyUnits, inviteCompanies, placeOf } from "~/domain/invites";
import { unitBranches, unitPath } from "~/domain/organization";

import { useAdministrator } from "~/domain/access";

import type { Invite, InviteUnit } from "@web/server-client";

const { t } = useI18n();
const administrator = useAdministrator();
const config = useRuntimeConfig();

const units = ref<InviteUnit[] | null>(null);
const invites = ref<Invite[]>([]);
const company = ref("");
const unit = ref<number | null>(null);
const role = ref<"member" | "head">("member");
// The keys of the tree's branches standing open.
const expanded = ref<string[]>([]);
const hours = ref("72");
const busy = ref(false);
const failure = ref("");
const making = ref(false);
const makeFailure = ref("");
const copied = ref("");

const companyItems = computed(() => inviteCompanies(units.value ?? []).map((one) => ({ label: one.name, value: String(one.id) })));
const treeUnits = computed(() => companyUnits(units.value ?? [], Number(company.value)));
const chosenPath = computed(() =>
  unitPath(treeUnits.value, unit.value ?? Number.NaN)
    .map((one) => one.name)
    .join(" › ")
);
// A head gives no head (docs/accounts.md, 「Invitations and a person's machine」), so for them the head role stands off.
const roleItems = computed(() => [
  { label: t("organization.label.role_member"), value: "member" },
  { label: t("organization.label.role_head"), value: "head", disabled: !administrator.value }
]);

// A company chosen chooses the top of its tree, its first branches open.
function chooseCompany(value: string): void {
  company.value = value;

  const roots = unitBranches(treeUnits.value).map((branch) => branch.unit.id);

  unit.value = roots[0] ?? null;
  expanded.value = roots.map(String);
}

const spans = computed(() => [24, 72, 168, 720].map((span) => ({ label: t("invites.label.span", { hours: span }), value: String(span) })));

function link(token: string): string {
  return `${window.location.origin}${config.app.baseURL.replace(/\/$/, "")}/join/${token}`;
}

async function read(): Promise<void> {
  failure.value = "";
  try {
    [units.value, invites.value] = await Promise.all([$fetch<InviteUnit[]>("/api/invites/units"), $fetch<Invite[]>("/api/invites")]);
    if (unit.value === null && companyItems.value.length > 0) chooseCompany(companyItems.value[0]!.value);
  } catch (error) {
    failure.value = failureText(error, t("invites.error.failed"));
  }
}

// The words copied with a link: who invites into what, the link, and when it closes.
async function copy(invite: Invite): Promise<void> {
  const text = t("invites.message.text", { place: placeOf(invite), link: link(invite.token), time: formatStamp(invite.expiresAt / 1000) });

  await navigator.clipboard?.writeText(text).catch(() => undefined);
  copied.value = invite.token;
}

function openMake(): void {
  makeFailure.value = "";
  making.value = true;
}

async function make(): Promise<void> {
  busy.value = true;
  makeFailure.value = "";
  try {
    const made = await $fetch<Invite>("/api/invites", { method: "POST", body: { unit: unit.value, head: role.value === "head", hours: Number(hours.value) } });

    invites.value = [made, ...invites.value];
    await copy(made);
    making.value = false;
  } catch (error) {
    makeFailure.value = failureText(error, t("invites.error.failed"));
  } finally {
    busy.value = false;
  }
}

async function drop(token: string): Promise<void> {
  try {
    await $fetch(`/api/invites/${token}`, { method: "DELETE" });
    invites.value = invites.value.filter((invite: Invite) => invite.token !== token);
  } catch (error) {
    failure.value = failureText(error, t("invites.error.failed"));
  }
}

onMounted(() => void read());

// The tab's create: a link, by its dialog, standing off until the units the reader may invite into are read and
// while there are none.
defineExpose({ addLabel: computed(() => t("invites.label.make")), addDisabled: computed(() => (units.value ?? []).length === 0), openAdd: openMake });
</script>
