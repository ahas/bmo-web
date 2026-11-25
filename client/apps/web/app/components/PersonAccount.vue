<template>
  <!-- One person's account tab (docs/web.md, 「System and organisation」, the people tab): their account as the one read of the person
       stands, its group with no heading of its own, and the account's security under it; a failure of a read stands in
       its place. -->
  <div class="flex flex-col gap-4">
    <SettingsGroup data-person-account>
      <FailedRead v-if="props.person === null && props.failure !== ''" class="py-3" :message="props.failure" :reading="props.reading" @retry="emit('retry')" />
      <PairRows v-else :rows="rows" :skeleton="labels" :label="$t('roster.status.person_loading')" />
    </SettingsGroup>

    <!-- The account's security, for the administrator and the person's heads, read on its own; a reader the service
         answers nothing of is shown no group. -->
    <SettingsGroup v-if="security !== null || securityFailure !== ''" :title="$t('security.label.security')" data-person-security>
      <FailedRead v-if="security === null" class="py-3" :message="securityFailure" :reading="false" @retry="void readSecurity()" />
      <PairRows v-else :rows="securityRows" :skeleton="[]" :label="$t('security.message.loading')" />
    </SettingsGroup>
  </div>
</template>

<script setup lang="ts">
import { formatStamp, toUnixSeconds } from "bmo-ui/app/domain/time";

import { useAdministrator } from "~/domain/access";
import { usePersonSecurity } from "~/domain/account-security";
import { ROSTER_STATE_FACES } from "~/domain/roster";

import type { PairRow } from "~/domain/pair-rows";
import type { PersonPaneProps } from "~/domain/person-panes";

const props = defineProps<PersonPaneProps>();
const emit = defineEmits<{ retry: [] }>();

const { t } = useI18n();
const administrator = useAdministrator();

function stamp(at: number | null): string {
  return at === null ? t("common.label.no_record") : formatStamp(toUnixSeconds(at));
}

// The login, the name, the job title, the contact details for the administrator alone, the state with who marked the
// person left and when, when the account was made and when they last signed in.
const labels = computed(() => [
  t("account.label.user_id"),
  t("account.label.full_name"),
  t("account.label.job_title"),
  t("account.label.rank"),
  t("account.label.duty"),
  ...(administrator.value ? [t("account.label.landline"), t("account.label.mobile"), t("account.label.email")] : []),
  t("roster.label.state"),
  t("roster.label.made_at"),
  t("roster.label.last_sign_in")
]);

const rows = computed<PairRow[] | null>(() => {
  const one = props.person;

  if (one === null) return null;

  const contact = (label: string, value: string | undefined): PairRow[] => (value === undefined ? [] : [{ key: label, label, value: value === "" ? "—" : value }]);

  return [
    { key: "login", label: t("account.label.user_id"), value: one.login },
    { key: "name", label: t("account.label.full_name"), value: one.name },
    { key: "job", label: t("account.label.job_title"), value: one.jobTitle === "" ? "—" : one.jobTitle },
    { key: "rank", label: t("account.label.rank"), value: one.rank === "" ? "—" : one.rank },
    { key: "duty", label: t("account.label.duty"), value: one.duty === "" ? "—" : one.duty },
    ...contact(t("account.label.landline"), one.landline),
    ...contact(t("account.label.mobile"), one.mobile),
    ...contact(t("account.label.email"), one.email),
    {
      key: "state",
      label: t("roster.label.state"),
      value: t(ROSTER_STATE_FACES[one.state].label),
      under: one.left === null ? undefined : t("roster.label.left_by", { time: formatStamp(toUnixSeconds(one.left.at)), name: one.left.byName })
    },
    { key: "made", label: t("roster.label.made_at"), value: formatStamp(toUnixSeconds(one.madeAt)) },
    { key: "sign-in", label: t("roster.label.last_sign_in"), value: stamp(one.lastSignInAt) }
  ];
});

// The account's security: the email's verification, the second factor and whether the account signs in.
const { security, failure: securityFailure, read } = usePersonSecurity(() => String(props.user));

async function readSecurity(): Promise<void> {
  await read(t("security.error.read_failed"));
}

const securityRows = computed<PairRow[] | null>(() => {
  const one = security.value;

  if (one === null) return null;

  return [
    {
      key: "email",
      label: t("security.label.email_verification"),
      value: one.email === "" ? t("security.label.no_email") : one.emailVerified ? t("security.label.verified") : t("security.label.unverified")
    },
    {
      key: "factor",
      label: t("security.label.second_factor"),
      value: one.secondFactor ? t("security.label.factor_on") : t("security.label.factor_off"),
      under: one.secondFactorRequired ? t("security.label.required_by_org") : undefined
    },
    { key: "enabled", label: t("security.label.sign_in_state"), value: one.enabled ? t("security.label.enabled") : t("security.label.disabled") }
  ];
});

onMounted(() => void readSecurity());
watch(() => props.user, () => void readSecurity());
</script>
