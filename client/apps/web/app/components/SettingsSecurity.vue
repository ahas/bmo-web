<template>
  <!-- The account section's security (docs/web.md, 「Settings」, 계정's 보안): the email's verification and the second
       factor, the devices signed in with this one marked, and the newest sign-ins tried. -->
  <div class="flex flex-col gap-6" data-security>
    <SettingsGroup :title="$t('security.label.security')">
      <SkeletonStatus v-if="view === null && failure === ''" class="py-3" :label="$t('security.message.loading')">
        <div class="flex flex-col gap-4">
          <SkeletonBar class="block h-4 w-40" />
          <SkeletonBar class="block h-4 w-32" />
        </div>
      </SkeletonStatus>
      <FailedRead v-else-if="view === null" class="py-3" :message="failure" :reading="reading" @retry="void read()" />

      <template v-else>
        <SettingsRow :label="$t('security.label.email_verification')" data-email-row>
          <template #description>
            <span v-if="view.security.email === ''" class="text-sm text-muted">{{ $t("security.label.no_email") }}</span>
            <span v-else class="flex min-w-0 flex-wrap items-center gap-2">
              <span class="break-all text-sm text-muted">{{ view.security.email }}</span>
              <UBadge :color="view.security.emailVerified ? 'success' : 'neutral'" variant="subtle" size="sm" :label="view.security.emailVerified ? $t('security.label.verified') : $t('security.label.unverified')" data-email-state />
            </span>
            <span v-if="emailNote !== ''" class="whitespace-pre-line text-sm text-muted" data-email-note>{{ emailNote }}</span>
          </template>
          <UButton
            v-if="view.security.email !== '' && !view.security.emailVerified && view.security.mail"
            color="neutral"
            variant="outline"
            :label="$t('security.action.send_verification')"
            :loading="sending"
            :disabled="sending"
            data-email-send
            @click="void sendVerification()"
          />
        </SettingsRow>

        <SettingsRow :label="$t('security.label.second_factor')" data-factor-row>
          <template #description>
            <span class="text-sm text-muted" data-factor-state>{{ factorLine }}</span>
            <span v-if="view.security.secondFactorRequired" class="text-sm text-muted">{{ $t("security.label.required_by_org") }}</span>
          </template>
          <UButton v-if="!view.security.secondFactor" color="neutral" variant="outline" :label="$t('security.action.set_up')" data-factor-set-up @click="enrolling = true" />
          <UDropdownMenu v-else :items="factorMenu" :content="{ align: 'end' }">
            <IconButton icon="i-material-symbols-more-horiz" :label="$t('security.action.more')" data-factor-menu />
          </UDropdownMenu>
        </SettingsRow>
      </template>

      <p v-if="actFailure !== ''" role="alert" class="whitespace-pre-line break-words py-3 text-sm text-error" data-security-failure>{{ actFailure }}</p>
    </SettingsGroup>

    <SettingsGroup v-if="view !== null" :title="$t('security.label.devices')" data-devices>
      <SettingsRow v-for="device in view.devices" :key="device.id" :label="browserLine(device.userAgent)" :data-device="device.id">
        <template #description>
          <span class="text-sm text-muted tabular-nums">{{ coarseAddress(device.address) }} · {{ $t("security.label.last_active", { time: stamp(device.seenAt) }) }}</span>
        </template>
        <UBadge v-if="device.current" color="primary" variant="subtle" size="sm" :label="$t('security.label.this_device')" data-device-current />
        <UButton v-else color="neutral" variant="outline" :label="$t('security.action.sign_out')" :loading="ending === device.id" :disabled="ending !== null" data-device-end @click="void endDevice(device.id)" />
      </SettingsRow>
      <div v-if="view.devices.some((one) => !one.current)" class="flex justify-end py-3">
        <UButton color="error" variant="ghost" :label="$t('security.action.sign_out_others')" :loading="ending === 'others'" :disabled="ending !== null" data-devices-others @click="void endOthers()" />
      </div>
      <p v-if="view.devices.length === 0" class="py-3 text-sm text-muted">{{ $t("security.message.no_devices") }}</p>
    </SettingsGroup>

    <SettingsGroup v-if="view !== null" :title="$t('security.label.tries')" data-tries>
      <SettingsRow v-for="(one, index) in view.tries" :key="index" :label="$t(outcomeKey(one.outcome))">
        <template #description>
          <span class="text-sm tabular-nums" :class="failedTry(one.outcome) ? 'text-error' : 'text-muted'">{{ stamp(one.at) }} · {{ browserLine(one.userAgent) }} · {{ coarseAddress(one.address) }}</span>
        </template>
      </SettingsRow>
      <p v-if="view.tries.length === 0" class="py-3 text-sm text-muted">{{ $t("security.label.no_tries") }}</p>
    </SettingsGroup>

    <SecondFactorDialog v-model:open="enrolling" :required="enrolAsked" @done="void read()" />

    <SettingsDialog v-model:open="turningOff" :title="$t('security.action.turn_off')" :dirty="offPassword !== ''">
      <UForm id="factor-off-form" :state="{ offPassword }" class="flex flex-col gap-4" @submit="void turnOff()">
        <UFormField :label="$t('app.label.password')" :description="$t('security.message.off_asks_password')" name="offPassword" required>
          <UInput v-model="offPassword" class="w-full" type="password" autocomplete="current-password" />
        </UFormField>
        <p v-if="offFailure !== ''" role="alert" class="text-sm text-error">{{ offFailure }}</p>
      </UForm>
      <template #footer="{ close }">
        <UButton color="neutral" variant="ghost" :label="$t('security.action.cancel')" @click="close()" />
        <UButton type="submit" form="factor-off-form" color="error" :label="$t('security.action.turn_off')" :loading="busy" :disabled="busy || offPassword === ''" />
      </template>
    </SettingsDialog>

    <SettingsDialog v-model:open="showingCodes" :title="$t('security.label.recovery_codes')">
      <RecoveryCodes v-if="freshCodes !== null" :codes="freshCodes" />
      <template #footer>
        <UButton :label="$t('security.action.done')" @click="showingCodes = false" />
      </template>
    </SettingsDialog>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { formatStamp, toUnixSeconds } from "bmo-ui/app/domain/time";

import { browserOfAgent, coarseAddress, failedTry, outcomeKey } from "#shared/account-security";
import { useEnrolAsked } from "~/domain/account-security";

import type { OwnSecurity } from "#shared/account-security";
import type { DropdownMenuItem } from "@nuxt/ui";

const { t } = useI18n();
const { fetch: refreshSession } = useUserSession();
const asked = useEnrolAsked();

const view = ref<OwnSecurity | null>(null);
const failure = ref("");
const reading = ref(false);
const actFailure = ref("");
const emailNote = ref("");
const sending = ref(false);
const enrolling = ref(false);
const enrolAsked = ref(false);
const turningOff = ref(false);
const offPassword = ref("");
const offFailure = ref("");
const busy = ref(false);
const showingCodes = ref(false);
const freshCodes = ref<string[] | null>(null);
const ending = ref<number | "others" | null>(null);

function stamp(at: number): string {
  return formatStamp(toUnixSeconds(at));
}

// A row's browser and system as the console reads them off the user agent.
function browserLine(agent: string): string {
  const { browser, system } = browserOfAgent(agent);

  if (browser === "" && system === "") return t("security.label.unknown_browser");
  if (browser === "" || system === "") return browser || system;

  return t("security.label.browser_system", { browser, system });
}

const factorLine = computed(() => {
  const security = view.value?.security;

  if (security === undefined) return "";
  if (!security.secondFactor) return t("security.label.factor_off");

  return `${t("security.label.factor_on")} · ${t("security.label.codes_left", { count: security.recoveryCodesLeft })}`;
});

const factorMenu = computed<DropdownMenuItem[]>(() => [
  { label: t("security.action.fresh_codes"), icon: "i-material-symbols-key-outline", onSelect: () => void makeCodes() },
  { label: t("security.action.turn_off"), icon: "i-material-symbols-lock-open-outline", color: "error", onSelect: () => openOff() }
]);

async function read(): Promise<void> {
  reading.value = true;

  try {
    view.value = await $fetch<OwnSecurity>("/api/account/security");
    failure.value = "";
  } catch (error) {
    if (view.value === null) failure.value = failureText(error, t("security.error.read_failed"));
  } finally {
    reading.value = false;
  }
}

async function sendVerification(): Promise<void> {
  sending.value = true;
  actFailure.value = "";

  try {
    await $fetch("/api/account/email-verification", { method: "POST" });
    emailNote.value = t("security.message.verification_sent");
  } catch (error) {
    actFailure.value = failureText(error, t("security.error.failed"));
  } finally {
    sending.value = false;
  }
}

async function makeCodes(): Promise<void> {
  actFailure.value = "";

  try {
    freshCodes.value = (await $fetch<{ codes: string[] }>("/api/account/recovery-codes", { method: "POST" })).codes;
    showingCodes.value = true;
    await read();
  } catch (error) {
    actFailure.value = failureText(error, t("security.error.failed"));
  }
}

function openOff(): void {
  offPassword.value = "";
  offFailure.value = "";
  turningOff.value = true;
}

async function turnOff(): Promise<void> {
  busy.value = true;
  offFailure.value = "";

  try {
    await $fetch("/api/account/second-factor/off", { method: "POST", body: { password: offPassword.value } });
    offPassword.value = "";
    turningOff.value = false;
    await read();
  } catch (error) {
    offFailure.value = failureText(error, t("security.error.failed"));
  } finally {
    busy.value = false;
  }
}

async function endDevice(device: number): Promise<void> {
  ending.value = device;
  actFailure.value = "";

  try {
    await $fetch(`/api/account/devices/${device}`, { method: "DELETE" });
    await read();
  } catch (error) {
    actFailure.value = failureText(error, t("security.error.failed"));
  } finally {
    ending.value = null;
  }
}

async function endOthers(): Promise<void> {
  ending.value = "others";
  actFailure.value = "";

  try {
    await $fetch("/api/account/devices/others", { method: "POST" });
    await refreshSession();
    await read();
  } catch (error) {
    actFailure.value = failureText(error, t("security.error.failed"));
  } finally {
    ending.value = null;
  }
}

onMounted(async () => {
  await read();

  // A person whose organisation asks a second factor they do not hold is led here from the sign-in.
  if (asked.value && view.value !== null && !view.value.security.secondFactor) {
    enrolAsked.value = true;
    enrolling.value = true;
  }

  asked.value = false;
});
</script>
