<template>
  <!-- Invitations (docs/web.md, 「Organisation settings」, the invitations tab): a link made into a unit the reader
       heads, or any for the administrator, in a dialog the screen's create button opens, copied with its words and
       when it closes; the open ones listed, each copied again or taken back. -->
  <div class="flex flex-col gap-6">
    <p v-if="units !== null && units.length === 0" class="text-sm text-muted">{{ $t("invites.label.no_units") }}</p>

    <SettingsGroup :title="$t('invites.label.open')">
      <SettingsRow v-if="invites.length === 0" :label="$t('invites.label.none')" />
      <SettingsRow
        v-for="invite in invites"
        :key="invite.token"
        :label="`${invite.unit.name}${invite.head ? ` · ${$t('invites.label.head')}` : ''}`"
        :description="$t('invites.label.until', { time: formatStamp(invite.expiresAt / 1000) })"
      >
        <UButton color="neutral" variant="ghost" size="xs" :label="copied === invite.token ? $t('invites.status.copied') : $t('invites.action.copy')" @click="copy(invite)" />
        <UButton color="error" variant="ghost" size="xs" :label="$t('invites.action.drop')" @click="drop(invite.token)" />
      </SettingsRow>
    </SettingsGroup>

    <p v-if="failure !== ''" role="alert" class="text-sm text-error">{{ failure }}</p>

    <SettingsDialog v-model:open="making" :title="$t('invites.label.make')">
      <form id="invite-form" class="flex flex-col gap-4" @submit.prevent="make">
        <UFormField :label="$t('invites.label.unit')" name="unit">
          <USelect v-model="unit" :items="(units ?? []).map((one) => ({ label: one.name, value: String(one.id) }))" class="w-full" :aria-label="$t('invites.label.unit')" />
        </UFormField>

        <UFormField v-if="administrator" :label="$t('invites.label.head')" :description="$t('invites.label.head_note')" name="head">
          <USwitch v-model="head" :aria-label="$t('invites.label.head')" />
        </UFormField>

        <UFormField :label="$t('invites.label.hours')" name="hours">
          <USelect v-model="hours" :items="spans" class="w-full" :aria-label="$t('invites.label.hours')" />
        </UFormField>

        <p v-if="makeFailure !== ''" role="alert" class="break-words text-sm text-error">{{ makeFailure }}</p>
      </form>

      <template #footer="{ close }">
        <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="busy" @click="close()" />
        <UButton type="submit" form="invite-form" :label="$t('invites.action.make')" :loading="busy" :disabled="busy || unit === ''" />
      </template>
    </SettingsDialog>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { formatStamp } from "bmo-ui/app/domain/time";

import { placeOf } from "~/domain/invites";

import { useAdministrator } from "~/domain/access";

import type { Invite } from "@web/server-client";

const { t } = useI18n();
const administrator = useAdministrator();
const config = useRuntimeConfig();

const units = ref<{ id: number; name: string }[] | null>(null);
const invites = ref<Invite[]>([]);
const unit = ref("");
const head = ref(false);
const hours = ref("72");
const busy = ref(false);
const failure = ref("");
const making = ref(false);
const makeFailure = ref("");
const copied = ref("");

const spans = computed(() => [24, 72, 168, 720].map((span) => ({ label: t("invites.label.span", { hours: span }), value: String(span) })));

function link(token: string): string {
  return `${window.location.origin}${config.app.baseURL.replace(/\/$/, "")}/join/${token}`;
}

async function read(): Promise<void> {
  failure.value = "";
  try {
    [units.value, invites.value] = await Promise.all([$fetch<{ id: number; name: string }[]>("/api/invites/units"), $fetch<Invite[]>("/api/invites")]);
    if (unit.value === "" && units.value.length > 0) unit.value = String(units.value[0]!.id);
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
    const made = await $fetch<Invite>("/api/invites", { method: "POST", body: { unit: Number(unit.value), head: head.value, hours: Number(hours.value) } });

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
