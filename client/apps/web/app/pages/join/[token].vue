<template>
  <!-- The join page (docs/web.md, 「The join page」): an invitation's link, opened with no sign-in. It shows the unit
       and its company, takes the person's name, a login and a password, then connects the person's machine one of two
       ways — the desktop app, approving its pairing with the invitation, or jake's one-line install — and says the
       account is ready once the machine has attached, its login leading into the start guide, and, where only the
       person's own supply can carry their runs, that their own login or key comes first. Like the login, it stands on
       no shell. -->
  <div class="relative flex overflow-y-auto bg-default p-4 text-default" :style="{ top: 'var(--bmo-screen-top)', height: 'var(--bmo-screen)' }">
    <UCard class="m-auto w-full max-w-lg">
      <template #header>
        <h1 class="text-xl font-semibold text-highlighted">{{ $t("join.title.create") }}</h1>
      </template>

      <div class="flex flex-col gap-4">
        <UAlert v-if="failure" color="error" variant="subtle" :description="failure" />
        <!-- A session the browser already holds, which the way to the login ends before the new account signs in. -->
        <UAlert v-if="signedInAs !== null" color="neutral" variant="subtle" icon="i-material-symbols-account-circle-outline" :description="$t('join.message.signed_in_as', { name: signedInAs })" :ui="{ description: 'whitespace-pre-line break-keep' }" data-join-signed-in />

        <template v-if="view && view.state !== 'open' && accepted === null">
          <UAlert
            color="warning"
            variant="subtle"
            :description="view.state === 'used' ? $t('join.message.used') : $t('join.message.expired')"
            :ui="{ description: 'whitespace-pre-line' }"
          />
        </template>

        <template v-else-if="view && accepted === null">
          <p>{{ $t(view.head ? "join.message.invited_head" : "join.message.invited", { place: placeOf(view) }) }}</p>
          <p class="text-sm text-muted">{{ $t("join.message.until", { time: formatStamp(view.expiresAt / 1000) }) }}</p>
          <UForm id="join-form" :state="form" :validate="validate" class="flex flex-col gap-4" @submit="accept">
            <UFormField :label="$t('join.label.full_name')" name="fullName" required>
              <UInput v-model="form.fullName" class="w-full" autocomplete="name" />
            </UFormField>
            <UFormField :label="$t('app.label.user_id')" name="name" required>
              <UInput v-model="form.name" class="w-full" autocomplete="username" />
            </UFormField>
            <UFormField :label="$t('app.label.password')" name="password" required>
              <UInput v-model="form.password" class="w-full" type="password" autocomplete="new-password" />
            </UFormField>
          </UForm>
        </template>

        <template v-else-if="accepted">
          <p class="whitespace-pre-line break-keep">{{ $t("join.message.created") }}</p>

          <!-- The two ways at the card's full width, each label wrapping rather than cut at a phone's width. -->
          <UTabs
            v-model="way"
            :items="ways"
            :content="false"
            color="neutral"
            class="w-full"
            :ui="{ trigger: 'min-w-0 flex-1', label: 'whitespace-normal break-keep text-center' }"
            data-join-ways
          />

          <div v-if="way === 'desktop'" class="flex flex-col gap-4" data-join-desktop>
            <DesktopAppSteps form-id="join-pair" :address="serverAddress" :approved="approved !== null" :pairing="pairing" :code-failure="codeFailure" @pair="(code: string) => void pair(code)" @release="chooseWay" />
          </div>

          <div v-else class="flex flex-col gap-4" data-join-jake>
            <p class="whitespace-pre-line break-keep text-sm text-toned">{{ $t("join.message.install") }}</p>
            <div v-for="install in installs" :key="install.label" class="flex flex-col gap-1">
              <span class="text-sm font-medium">{{ install.label }}</span>
              <div class="flex items-start gap-2">
                <code class="min-w-0 flex-1 break-all rounded-md bg-elevated p-2 text-sm">{{ install.line }}</code>
                <IconButton
                  :icon="copied === install.line ? 'i-material-symbols-check' : 'i-material-symbols-content-copy-outline'"
                  :label="copied === install.line ? $t('invites.status.copied') : $t('join.action.copy')"
                  data-install-copy
                  @click="copy(install.line)"
                />
              </div>
            </div>
            <p class="break-keep text-sm text-muted">{{ $t("join.message.one_agent") }}</p>
          </div>

          <UAlert v-if="active" color="success" variant="subtle" :description="agentLogin ? $t('join.message.agent_login') : $t('join.message.active')" :ui="{ description: 'whitespace-pre-line' }" data-join-active />
          <p v-else class="text-sm text-muted">{{ $t("join.message.waiting") }}</p>
        </template>
      </div>

      <!-- The card's one action at the footer's right end, at its own width. -->
      <template #footer>
        <div class="flex justify-end">
          <UButton v-if="view && view.state === 'open' && accepted === null" type="submit" form="join-form" :label="$t('join.action.accept')" :loading="pending" />
          <UButton v-else-if="accepted && !active" color="neutral" variant="subtle" :label="$t('join.action.check')" :loading="pending" data-join-check @click="prove" />
          <UButton v-else-if="active && agentLogin" :label="$t('guide.action.login_setup')" :loading="leaving" data-join-agent-login @click="signInAsNew()" />
          <UButton v-else-if="active" :label="$t('app.action.login')" :loading="leaving" data-join-login @click="signInAsNew()" />
        </div>
      </template>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { useIsland } from "bmo-ui/app/domain/island";
import { formatStamp } from "bmo-ui/app/domain/time";

import { GUIDE_PATH } from "~/domain/guide";
import { copyText } from "~/domain/copy";

import { placeOf } from "~/domain/invites";

import { useVisibleShell } from "~/domain/overlay";

import type { FormError } from "@nuxt/ui";
import type { Accepted, InviteView, PairingApproved } from "@web/server-client";

definePageMeta({ layout: false });

useVisibleShell();

const { t } = useI18n();
const route = useRoute();
const token = computed(() => String(route.params.token ?? ""));

const view = ref<InviteView | null>(null);
const accepted = ref<Accepted | null>(null);
const active = ref(false);
// Whether the account, once ready, must set up a login of its own before it starts.
const agentLogin = ref(false);
const failure = ref("");
const pending = ref(false);
const copied = ref<string | null>(null);
const island = useIsland(t);
const form = reactive({ fullName: "", name: "", password: "" });
const installs = computed(() =>
  accepted.value === null
    ? []
    : [
        { label: t("join.label.linux"), line: accepted.value.install.linux },
        { label: t("join.label.windows"), line: accepted.value.install.windows }
      ]
);
let timer: ReturnType<typeof setInterval> | undefined;

// The session the browser already holds, named as people read it, which the way to the login ends first.
const { loggedIn, user, clear } = useUserSession();
const signedInAs = computed(() => (loggedIn.value ? ((user.value?.fullName || user.value?.name) ?? t("app.label.account")) : null));
const leaving = ref(false);

// The login opened for the account just made: any session the browser holds signed out through the console's own
// sign-out first, then the login with the new login filled in, leading into the start guide.
async function signInAsNew(): Promise<void> {
  leaving.value = true;
  try {
    if (loggedIn.value) {
      await $fetch("/api/auth/logout", { method: "POST" });
      await clear();
    }
    await navigateTo({ path: "/login", query: { name: form.name.trim(), to: GUIDE_PATH } });
  } catch (error) {
    failure.value = failureText(error, t("invites.error.failed"));
  } finally {
    leaving.value = false;
  }
}

// The two ways the machine is connected: the desktop app first, chosen where a release is published, and jake's
// command, chosen where none is.
type Way = "desktop" | "jake";

const way = ref<Way>("desktop");
const ways = computed(() => [
  { label: t("join.label.tab_desktop"), value: "desktop" },
  { label: t("join.label.tab_jake"), value: "jake" }
]);
// The address the app asks for: the console's public address, else the address the page was reached at.
const { baseURL } = useRuntimeConfig().app;
const serverAddress = ref(String(useRuntimeConfig().public.consoleAddress ?? "").trim());
const pairing = ref(false);
const codeFailure = ref("");
const approved = ref<PairingApproved | null>(null);

// The desktop way is chosen until the release is first read; where none stands to download, jake's command is chosen
// once, and the person may still open the desktop tab to read that it is not available yet.
let wayChosen = false;

function chooseWay(available: boolean): void {
  if (!wayChosen && !available) way.value = "jake";
  wayChosen = true;
}

// The code typed from the app's title bar, approved with the invitation; from there the page waits for the app's agent
// as for any machine.
async function pair(code: string): Promise<void> {
  codeFailure.value = "";
  pairing.value = true;
  try {
    approved.value = await $fetch<PairingApproved>(`/api/join/${token.value}/pair`, { method: "POST", body: { code } });
    void prove();
  } catch (error) {
    codeFailure.value = failureText(error, t("pairing.error.failed"));
  } finally {
    pairing.value = false;
  }
}

// The account is not taken without the person's name, so everyone made through an invitation has one.
function validate(state: typeof form): FormError[] {
  return state.fullName.trim() === "" ? [{ name: "fullName", message: t("join.error.full_name_empty") }] : [];
}

async function read(): Promise<void> {
  try {
    view.value = await $fetch<InviteView>(`/api/join/${token.value}`);
    // The name the invitation was made for stands for the person to correct.
    form.fullName = view.value.fullName ?? "";
  } catch (error) {
    failure.value = failureText(error, t("invites.error.not_found"));
  }
}

async function accept(): Promise<void> {
  pending.value = true;
  failure.value = "";
  try {
    accepted.value = await $fetch<Accepted>(`/api/join/${token.value}/accept`, { method: "POST", body: { fullName: form.fullName.trim(), name: form.name.trim(), password: form.password } });
    form.password = "";
    timer = setInterval(() => void prove(), 5000);
  } catch (error) {
    failure.value = failureText(error, t("invites.error.failed"));
  } finally {
    pending.value = false;
  }
}

// Asked again every few seconds while the person installs, and at once when they say they have.
async function prove(): Promise<void> {
  try {
    const proof = await $fetch<{ active: boolean; agentLogin?: boolean }>(`/api/join/${token.value}/proof`, { method: "POST" });

    agentLogin.value = proof.agentLogin === true;
    active.value = proof.active;
    if (active.value && timer !== undefined) clearInterval(timer);
  } catch (error) {
    failure.value = failureText(error, t("invites.error.failed"));
  }
}

// The install line copied last carries a check in place of its copy mark; a copy the browser refuses says so on the
// island, since nothing on the page would show it.
async function copy(text: string): Promise<void> {
  if (await copyText(text)) {
    copied.value = text;
  } else {
    copied.value = null;
    island.say({ title: t("common.error.copy_failed"), tone: "error" });
  }
}

onMounted(() => {
  if (serverAddress.value === "") serverAddress.value = `${location.origin}${baseURL}`;
  void read();
});
onBeforeUnmount(() => {
  if (timer !== undefined) clearInterval(timer);
});
</script>
