<template>
  <!-- Invitations (docs/web.md, 「Organisation settings」, the invitations tab): a link made into a unit the reader
       heads, or any for the administrator, chosen as a company and then a unit of its tree, with the role the person
       takes there and, where the maker gives it, the person's name, in a dialog the tab row's add opens; copied with its words and when it closes; the open
       ones listed, each copied again or taken back by its two marks. While they are first read the list keeps its
       place with a skeleton, and a read that failed says why in its place. -->
  <div class="flex flex-col gap-4">
    <p v-if="units !== null && units.length === 0" class="text-sm text-muted">{{ $t("invites.label.no_units") }}</p>

    <SettingsGroup :title="$t('invites.label.open')">
      <ContentSkeleton v-if="!loaded && readFailure === ''" :rows="1" listClass="flex flex-col divide-y divide-default" :label="$t('invites.status.loading')">
        <div class="flex items-center gap-4 py-3">
          <div class="flex min-w-0 flex-1 flex-col">
            <SkeletonLine width="w-1/2" />
            <SkeletonLine width="w-1/3" />
          </div>
          <SkeletonBar class="size-8 shrink-0 rounded-md" />
          <SkeletonBar class="size-8 shrink-0 rounded-md" />
        </div>
      </ContentSkeleton>
      <div v-else-if="!loaded" class="flex flex-col items-end gap-3 py-3">
        <UAlert class="w-full" color="error" variant="subtle" :description="readFailure" />
        <UButton color="neutral" variant="subtle" icon="i-material-symbols-refresh" :label="$t('common.action.refresh')" :loading="reading" @click="load" />
      </div>
      <SettingsRow v-else-if="invites.length === 0" :label="$t('invites.label.none')" />
      <SettingsRow
        v-for="invite in invites"
        :key="invite.token"
        :label="inviteLine(invite)"
        :description="$t('invites.label.until', { time: formatStamp(invite.expiresAt / 1000) })"
        data-invite
      >
        <IconButton
          :icon="copied === invite.token ? 'i-material-symbols-check' : 'i-material-symbols-content-copy-outline'"
          :label="copied === invite.token ? $t('invites.status.copied') : $t('invites.action.copy')"
          data-invite-copy
          @click="copy(invite)"
        />
        <IconButton color="error" icon="i-material-symbols-link-off" :label="$t('invites.action.drop')" data-invite-drop @click="drop(invite.token)" />
      </SettingsRow>
    </SettingsGroup>

    <p v-if="failure !== ''" role="alert" class="text-sm text-error">{{ failure }}</p>

    <SettingsDialog v-model:open="making" :title="$t('invites.label.make')">
      <form id="invite-form" class="flex flex-col gap-4" @submit.prevent="make">
        <UFormField :label="$t('invites.label.full_name')" name="fullName" :hint="$t('common.label.optional')">
          <UInput v-model="fullName" class="w-full" autocomplete="off" data-invite-name />
        </UFormField>

        <UFormField :label="$t('invites.label.company')" name="company">
          <ChoiceSelect :model-value="company" :items="companyItems" value-key="value" class="w-full" :aria-label="$t('invites.label.company')" data-invite-company @update:model-value="chooseCompany" />
        </UFormField>

        <!-- The chosen company's tree, as the units tab draws it; the path down to the unit chosen reads above it. -->
        <UFormField :label="$t('invites.label.unit')" :description="chosenPath" name="unit">
          <div role="group" class="overflow-x-auto [scrollbar-width:thin]" :aria-label="$t('invites.label.unit')" data-invite-unit-tree>
            <OrganizationUnitTree v-model:expanded="expanded" class="w-max min-w-full" :units="treeUnits" :chosen="unit" @choose="(id: number) => (unit = id)" />
          </div>
        </UFormField>

        <UFormField :label="$t('invites.label.role')" name="role">
          <ChoiceSelect v-model="role" :items="roleItems" value-key="value" class="w-full" :aria-label="$t('invites.label.role')" data-invite-role />
        </UFormField>

        <UFormField :label="$t('invites.label.hours')" name="hours">
          <ChoiceSelect v-model="hours" :items="spans" value-key="value" class="w-full" :aria-label="$t('invites.label.hours')" />
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
// The person's name the invitation is made for, empty where the maker gives none.
const fullName = ref("");
const busy = ref(false);
// Whether the units and the open links have been read, a read under way, and why the last read failed.
const loaded = ref(false);
const reading = ref(false);
const readFailure = ref("");
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

// A failure stands until a read goes through, so a read asked again from it spins on its button.
async function load(): Promise<void> {
  reading.value = true;
  try {
    [units.value, invites.value] = await Promise.all([$fetch<InviteUnit[]>("/api/invites/units"), $fetch<Invite[]>("/api/invites")]);
    readFailure.value = "";
    loaded.value = true;
    if (unit.value === null && companyItems.value.length > 0) chooseCompany(companyItems.value[0]!.value);
  } catch (error) {
    readFailure.value = failureText(error, t("invites.error.failed"));
  } finally {
    reading.value = false;
  }
}

// An open invitation's line: the person it was made for where it names one, where it leads and the role it gives.
function inviteLine(invite: Invite): string {
  const parts = [placeOf(invite), t(invite.head ? "organization.label.role_head" : "organization.label.role_member")];

  return (invite.fullName ? [invite.fullName, ...parts] : parts).join(" · ");
}

// The words copied with a link: who invites whom into what, the link, and when it closes.
async function copy(invite: Invite): Promise<void> {
  const words = { place: placeOf(invite), link: link(invite.token), time: formatStamp(invite.expiresAt / 1000) };
  const text = invite.fullName ? t("invites.message.text_named", { ...words, name: invite.fullName }) : t("invites.message.text", words);

  await navigator.clipboard?.writeText(text).catch(() => undefined);
  copied.value = invite.token;
}

function openMake(): void {
  makeFailure.value = "";
  fullName.value = "";
  making.value = true;
}

async function make(): Promise<void> {
  busy.value = true;
  makeFailure.value = "";
  try {
    const made = await $fetch<Invite>("/api/invites", { method: "POST", body: { unit: unit.value, head: role.value === "head", hours: Number(hours.value), fullName: fullName.value.trim() } });

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

onMounted(() => void load());

// The tab's create: a link, by its dialog, standing off until the units the reader may invite into are read and
// while there are none.
defineExpose({ addLabel: computed(() => t("invites.label.make")), addDisabled: computed(() => (units.value ?? []).length === 0), openAdd: openMake });
</script>
