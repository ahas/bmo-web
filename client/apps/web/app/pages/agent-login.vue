<template>
  <!-- The agent login step (docs/web.md, 「The join page」): a person whose runs only their own supply can carry, and
       who holds none that is on, sets up a Claude login or a key here before anything else opens to them — the part of
       the supply tab their own node shows — and starts once one of their own is on. -->
  <UDashboardPanel id="agent-login">
    <template #body>
      <div class="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-4 p-4" data-agent-login>
        <h1 class="text-xl font-semibold text-highlighted">{{ $t("agent_login.title.page") }}</h1>
        <p class="whitespace-pre-line text-sm text-muted">{{ $t("agent_login.message.lead") }}</p>
        <SettingsSupply />
        <p v-if="still" role="alert" class="text-sm text-error" data-agent-login-still>{{ $t("agent_login.message.still_needed") }}</p>
        <div class="flex justify-end">
          <UButton :label="$t('agent_login.action.start')" :loading="checking" data-agent-login-start @click="void start()" />
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { agentLoginState } from "~/domain/agent-login";

definePageMeta({ member: true });

const checking = ref(false);
const still = ref(false);
const needed = agentLoginState();

// Asked again as the person starts: a login or a key of their own that is on lets them through to their home.
async function start(): Promise<void> {
  checking.value = true;
  try {
    const answer = await $fetch<{ needed: boolean }>("/api/me/agent-login");

    needed.value = answer.needed;
    still.value = answer.needed;
    if (!answer.needed) await navigateTo("/");
  } finally {
    checking.value = false;
  }
}
</script>
