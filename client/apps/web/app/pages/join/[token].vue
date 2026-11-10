<template>
  <!-- The join page (docs/web.md, 「The join page」): an invitation's link, opened with no sign-in. It shows the unit
       and its company, takes a name and a password, hands back the one-line install of the person's machine, and
       says the account is ready once the machine has attached. Like the login, it stands on no shell. -->
  <div class="relative flex overflow-y-auto bg-default p-4 text-default" :style="{ top: 'var(--bmo-screen-top)', height: 'var(--bmo-screen)' }">
    <UCard class="m-auto w-full max-w-lg">
      <template #header>
        <h1 class="text-xl font-semibold text-highlighted">{{ $t("join.title.create") }}</h1>
      </template>

      <div class="flex flex-col gap-4">
        <UAlert v-if="failure" color="error" variant="subtle" :description="failure" />

        <template v-if="view && view.state !== 'open' && accepted === null">
          <UAlert color="warning" variant="subtle" :description="view.state === 'used' ? $t('join.message.used') : $t('join.message.expired')" />
        </template>

        <template v-else-if="view && accepted === null">
          <p>{{ $t(view.head ? "join.message.invited_head" : "join.message.invited", { company: view.company.name, unit: view.unit.name }) }}</p>
          <p class="text-sm text-muted">{{ $t("join.message.until", { time: formatStamp(view.expiresAt) }) }}</p>
          <UForm id="join-form" :state="form" class="flex flex-col gap-4" @submit="accept">
            <UFormField :label="$t('app.label.user_id')" name="name" required>
              <UInput v-model="form.name" class="w-full" autocomplete="username" />
            </UFormField>
            <UFormField :label="$t('app.label.password')" name="password" required>
              <UInput v-model="form.password" class="w-full" type="password" autocomplete="new-password" />
            </UFormField>
          </UForm>
        </template>

        <template v-else-if="accepted">
          <p>{{ $t("join.message.install") }}</p>
          <div v-for="install in installs" :key="install.label" class="flex flex-col gap-1">
            <span class="text-sm font-medium">{{ install.label }}</span>
            <div class="flex items-start gap-2">
              <code class="min-w-0 flex-1 break-all rounded-md bg-elevated p-2 text-xs">{{ install.line }}</code>
              <UButton color="neutral" variant="ghost" size="xs" icon="i-material-symbols-content-copy-outline" :aria-label="$t('join.action.copy')" @click="copy(install.line)" />
            </div>
          </div>
          <UAlert v-if="active" color="success" variant="subtle" :description="$t('join.message.active')" />
          <p v-else class="text-sm text-muted">{{ $t("join.message.waiting") }}</p>
        </template>
      </div>

      <template #footer>
        <UButton v-if="view && view.state === 'open' && accepted === null" type="submit" form="join-form" block :label="$t('join.action.accept')" :loading="pending" />
        <UButton v-else-if="accepted && !active" block color="neutral" variant="subtle" :label="$t('join.action.check')" :loading="pending" @click="prove" />
        <UButton v-else-if="active" block to="/login" :label="$t('app.action.login')" />
      </template>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { formatStamp } from "bmo-ui/app/domain/time";

import { useVisibleShell } from "~/domain/overlay";

import type { Accepted, InviteView } from "@web/server-client";

definePageMeta({ layout: false });

useVisibleShell();

const { t } = useI18n();
const route = useRoute();
const token = computed(() => String(route.params.token ?? ""));

const view = ref<InviteView | null>(null);
const accepted = ref<Accepted | null>(null);
const active = ref(false);
const failure = ref("");
const pending = ref(false);
const form = reactive({ name: "", password: "" });
const installs = computed(() =>
  accepted.value === null
    ? []
    : [
        { label: t("join.label.linux"), line: accepted.value.install.linux },
        { label: t("join.label.windows"), line: accepted.value.install.windows }
      ]
);
let timer: ReturnType<typeof setInterval> | undefined;

async function read(): Promise<void> {
  try {
    view.value = await $fetch<InviteView>(`/api/join/${token.value}`);
  } catch (error) {
    failure.value = failureText(error, t("invites.error.not_found"));
  }
}

async function accept(): Promise<void> {
  pending.value = true;
  failure.value = "";
  try {
    accepted.value = await $fetch<Accepted>(`/api/join/${token.value}/accept`, { method: "POST", body: { name: form.name.trim(), password: form.password } });
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
    active.value = (await $fetch<{ active: boolean }>(`/api/join/${token.value}/proof`, { method: "POST" })).active;
    if (active.value && timer !== undefined) clearInterval(timer);
  } catch (error) {
    failure.value = failureText(error, t("invites.error.failed"));
  }
}

async function copy(text: string): Promise<void> {
  await navigator.clipboard?.writeText(text).catch(() => undefined);
}

onMounted(() => void read());
onBeforeUnmount(() => {
  if (timer !== undefined) clearInterval(timer);
});
</script>
