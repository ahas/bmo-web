<template>
  <!-- The one screen that stands on no shell, so it holds itself to what is visible the way the
       shell does: a phone lays its keyboard over the page rather than cutting it out, and a card
       centred on the window would put its last field and its button behind the keys. Centred with
       margins rather than by the box's own alignment, so a card taller than the room scrolls to
       its top instead of having it cut off. An account holding a second factor is asked its code in
       the same card once its password matched (docs/web.md, 「Access」). -->
  <div
    class="relative flex overflow-y-auto bg-default p-4 text-default"
    :style="{ top: 'var(--bmo-screen-top)', height: 'var(--bmo-screen)' }"
  >
    <UCard class="m-auto w-full max-w-sm">
      <template #header>
        <h1 class="text-xl font-semibold text-highlighted">{{ consoleName($t) }}</h1>
      </template>

      <UForm v-if="ticket === null" id="login-form" :state="form" @submit="submit">
        <div class="flex flex-col gap-4">
          <UAlert v-if="ended && !failure" color="warning" variant="subtle" :title="$t('app.message.session_ended')" :description="$t('app.message.login_again')" />
          <UAlert v-else-if="pairing" data-login-pairing color="neutral" variant="subtle" icon="i-material-symbols-computer-outline" :description="`${$t('pairing.message.sign_in')}\n${$t('pairing.message.sign_in_invited')}`" :ui="{ description: 'whitespace-pre-line break-keep' }" />

          <UFormField :label="$t('app.label.user_id')" name="name" required>
            <UInput v-model="form.name" class="w-full" autocomplete="username" />
          </UFormField>

          <UFormField :label="$t('app.label.password')" name="password" required>
            <UInput v-model="form.password" class="w-full" type="password" autocomplete="current-password" />
            <template #hint>
              <ULink to="/forgot-password" class="text-sm text-muted hover:text-default active:text-highlighted" data-login-forgot>{{ $t("security.label.forgot") }}</ULink>
            </template>
          </UFormField>

          <UCheckbox v-model="form.remember" :label="$t('app.label.remember')" />

          <UAlert v-if="failure" color="error" variant="subtle" :description="failure" :ui="{ description: 'whitespace-pre-line' }" />
        </div>
      </UForm>

      <UForm v-else id="code-form" :state="codeForm" @submit="submitCode">
        <div class="flex flex-col gap-4">
          <p class="text-sm text-muted">{{ recovering ? $t("security.message.recovery_asked") : $t("security.message.code_asked") }}</p>

          <UFormField :label="recovering ? $t('security.label.recovery_code') : $t('security.label.code')" name="code" required>
            <UInput
              v-model="codeForm.code"
              class="w-full"
              :inputmode="recovering ? 'text' : 'numeric'"
              autocomplete="one-time-code"
              :maxlength="recovering ? 11 : 6"
              data-login-code
            />
          </UFormField>

          <UCheckbox v-model="codeForm.rememberDevice" :label="$t('security.label.remember_device')" data-login-remember-device />

          <div>
            <UButton color="neutral" variant="link" class="px-0" :label="recovering ? $t('security.action.use_code') : $t('security.action.use_recovery')" data-login-recovery @click="toggleRecovery()" />
          </div>

          <UAlert v-if="failure" color="error" variant="subtle" :description="failure" :ui="{ description: 'whitespace-pre-line' }" />
        </div>
      </UForm>

      <!-- The one action of the screen, in the card's own footer rather than loose under the
           fields, so it stands where every other form of this console puts what saves it: at the
           footer's right end, at its own width. -->
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton v-if="ticket !== null" color="neutral" variant="ghost" :label="$t('security.action.back')" data-login-back @click="back()" />
          <UButton type="submit" :form="ticket === null ? 'login-form' : 'code-form'" :label="$t('app.action.login')" :loading="pending" />
        </div>
      </template>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { consoleName } from "#shared/agent-names";
import { returnPath } from "~/domain/login-end";
import { isPairingPath } from "#shared/desktop-pairing";
import { useVisibleShell } from "~/domain/overlay";
import { useEnrolAsked } from "~/domain/account-security";

const { t } = useI18n();
definePageMeta({ layout: false });

useVisibleShell();

const { fetch: refreshSession } = useUserSession();
const route = useRoute();
const enrolAsked = useEnrolAsked();

// Sent here by a login that ended, which the screen says until a try of the login says otherwise.
const ended = computed(() => route.query.ended === "1");
// Sent here by the desktop pairing page, which the screen names so a person the app sent knows why.
const pairing = computed(() => isPairingPath(returnPath(route.query.to)));

const failure = ref<string | null>(null);
const pending = ref(false);

// Keeping the login is off until it is asked for: the console is one account's own and reachable
// from outside, so a browser left on a machine is not logged in again by itself unless it was said.
// A login named in the address, as the join page hands over the one it just made, stands filled in.
const form = reactive({ name: typeof route.query.name === "string" ? route.query.name : "", password: "", remember: false });

// The second factor's step: the ticket the password earned, and the code that finishes it.
const ticket = ref<string | null>(null);
const recovering = ref(false);
const codeForm = reactive({ code: "", rememberDevice: false });

interface LoginAnswer {
  user?: { name: string };
  ticket?: string;
  enrol?: boolean;
}

// Signed in: the session read, and the reader taken where they were going, or to the account's enrolment where their
// organisation asks a second factor they do not hold yet.
async function signedIn(answer: LoginAnswer): Promise<void> {
  await refreshSession();

  if (answer.enrol === true) {
    enrolAsked.value = true;
    await navigateTo({ path: "/", query: { settings: "account" } });

    return;
  }

  await navigateTo(returnPath(route.query.to));
}

async function submit(): Promise<void> {
  pending.value = true;
  failure.value = null;

  try {
    const answer = await $fetch<LoginAnswer>("/api/auth/login", {
      method: "POST",
      body: { name: form.name, password: form.password, remember: form.remember }
    });

    if (typeof answer.ticket === "string") {
      ticket.value = answer.ticket;
      codeForm.code = "";

      return;
    }

    await signedIn(answer);
  } catch (error) {
    failure.value = failureText(error, t("app.error.login_failed"));
  } finally {
    pending.value = false;
  }
}

async function submitCode(): Promise<void> {
  pending.value = true;
  failure.value = null;

  try {
    const answer = await $fetch<LoginAnswer>("/api/auth/second-factor", {
      method: "POST",
      body: { ticket: ticket.value, code: codeForm.code, remember: form.remember, rememberDevice: codeForm.rememberDevice }
    });

    await signedIn(answer);
  } catch (error) {
    const said = failureText(error, t("app.error.login_failed"));

    // A ticket past its time takes the card back to the password, saying so.
    if ((error as { statusCode?: number }).statusCode === 410) back();

    failure.value = said;
    codeForm.code = "";
  } finally {
    pending.value = false;
  }
}

function toggleRecovery(): void {
  recovering.value = !recovering.value;
  codeForm.code = "";
  failure.value = null;
}

function back(): void {
  ticket.value = null;
  recovering.value = false;
  codeForm.code = "";
  failure.value = null;
}
</script>
