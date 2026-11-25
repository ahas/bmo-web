<template>
  <!-- The providers tab of the administration screen (docs/web.md, 「System and organisation」, the providers tab): every
       provider the agency carries, in its order, with whose its gateway road is where one person owns it all, what it
       has left, why it cannot answer now and the owner's switch, each taking effect as it is thrown; under them the
       secrets the agency's provider tools read, and last the minutes between the agency's flushes of the deploy queue.
       The platform's own keys and Claude accounts stand on the organisation screen's supply tab with the platform
       chosen. No key the agency holds is read here. Each stands as a group under its heading, keeping its place with a
       skeleton while it is first read. -->
  <div class="flex flex-col gap-4">
    <ReadFailure :failure="usageFailure" :message="usageFailureText" :reading="usageReading" @retry="refreshUsage()" />

    <SettingsGroup :title="$t('agents.title.providers')">
      <ContentSkeleton v-if="providers === undefined && status !== 'error' && !providersRetrying" :rows="4" listClass="flex flex-col divide-y divide-default" :label="$t('agents.status.providers_loading')">
        <div class="flex items-center gap-4 py-3">
          <div class="flex min-w-0 flex-1 flex-col">
            <SkeletonLine width="w-1/3" />
            <SkeletonLine width="w-1/2" />
          </div>
          <SkeletonBar class="h-5 w-9 shrink-0 rounded-full" />
        </div>
      </ContentSkeleton>

      <div v-else-if="providers === undefined" class="flex flex-col items-end gap-3 py-3">
        <UAlert class="w-full" color="error" variant="subtle" :description="$t('agents.error.providers_read_failed')" />
        <UButton color="neutral" variant="subtle" icon="i-material-symbols-refresh" :label="$t('common.action.refresh')" :loading="providersRetrying" @click="retryProviders" />
      </div>

      <template v-else>
      <div v-for="one in providers" :key="one.name" :data-provider="one.name" class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3" :class="one.enabled ? '' : 'opacity-60'">
        <!-- The status mark follows the name on its line, so the row's words start at the group's edge. -->
        <div class="flex min-w-0 grow basis-40 flex-col">
          <span class="flex min-w-0 items-center gap-2">
            <span class="text-sm text-highlighted">{{ one.label }}</span>
            <UIcon :name="markOf(one).icon" class="size-4 shrink-0" :class="markOf(one).tone" />
          </span>
          <span v-if="owners.has(one.name)" class="text-sm text-muted" data-provider-owner>{{ ownerText($t, owners.get(one.name), names) }}</span>
          <!-- What the provider itself has left — the slot the chat runs on where it holds no login, its own road's
               balance, and each of its accounts the Claude list below does not carry, under that account's name — as
               the title bar's panel reads it. An account the list carries stands on its own row there. -->
          <div v-for="group in groupsOf(one)" :key="group.id" class="flex min-w-0 flex-col gap-1 pt-1" :data-provider-usage="group.id">
            <span v-if="group.name !== null" class="min-w-0 truncate text-sm text-muted">{{ loginText($t, group.name, group.loginNumber) }}</span>
            <UsageFigures :group="group" :now="now" />
          </div>
          <HintTip v-if="one.reason !== null" :text="one.reasonEnglish ?? undefined" :disabled="one.reasonEnglish === null" class="min-w-0">
            <span class="break-words text-sm text-warning">{{ one.reason }}</span>
          </HintTip>
        </div>
        <USwitch
          class="ms-auto"
          :model-value="one.enabled"
          :loading="switching === one.name"
          :disabled="switching !== ''"
          :aria-label="$t('agents.aria.switch_on', { name: one.label })"
          @update:model-value="(on: boolean) => void throwSwitch(one, on)"
        />
      </div>
      </template>
    </SettingsGroup>

    <ProviderSecretSettings />

    <DeployFlushSetting />

    <NoticeSwitchSetting />
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { useIsland } from "bmo-ui/app/domain/island";

import { loginText } from "#shared/claude-logins";
import { emptyFallbackView } from "~/domain/agent-settings";

import { useProviders } from "~/domain/axes";
import { useReadFailure } from "~/domain/events";
import { useAccountNames } from "~/domain/nodes";
import { ownerText, roadOwner } from "~/domain/supply";
import { providerGroups, usageGroups } from "~/domain/usage";
import { useUsageRead } from "~/domain/usage-read";

import type { ProviderView } from "#shared/axes";
import type { GatewayMember } from "#shared/supply";
import type { FallbackView } from "#shared/types";
import type { UsageGroup } from "~/domain/usage";

const { t } = useI18n();
const island = useIsland(t);

const { data: providers, refresh, status } = useProviders();

// Whose each gateway road and each Claude account is, read off the gateway's members and the accounts' own owners, the
// person named as their account goes by. A read that fails leaves a road's line unsaid, as a road no one person owns.
const { data: members } = useFetch<GatewayMember[]>("/api/gateway-members", { key: "gateway-members", lazy: true, server: false, default: () => [] });
const { names } = useAccountNames();
// Each provider's road owned whole by one person, by the provider's name.
const owners = computed(() => new Map((providers.value ?? []).flatMap((one) => {
  const owner = roadOwner(members.value ?? [], one.name);

  return owner === null ? [] : [[one.name, owner] as const];
})));
const { data: fallback } = useFetch<FallbackView>("/api/fallback", { key: "fallback", lazy: true, server: false, default: emptyFallbackView });


// What every provider and account has left, read as the title bar's panel reads it and under the same key, so both
// stand the same figures; a failed read is said once above the groups and keeps what was read last.
const { usage, now, refresh: rereadUsage, error: usageError, reading: usageReading } = useUsageRead();
const groups = computed(() => usageGroups(usage.value));
// The accounts the Claude accounts list carries, on the organisation screen's supply tab.
const listedAccounts = computed(() => new Set(fallback.value.accounts.map((account) => account.id)));
const usageFailureText = computed(() => failureText(usageError.value, t("usage.error.read_failed")));

function refreshUsage(): void {
  void rereadUsage();
}

const usageFailure = useReadFailure({
  failed: () => usageError.value !== undefined && usageError.value !== null,
  reading: () => usageReading.value,
  reread: refreshUsage
});

function groupsOf(provider: ProviderView): UsageGroup[] {
  return providerGroups(groups.value, provider.name, listedAccounts.value);
}

// A failed first read of the providers asked again: the failure stands, its button spinning, until the answer lands.
const providersRetrying = ref(false);

async function retryProviders(): Promise<void> {
  providersRetrying.value = true;
  try {
    await refresh();
  } finally {
    providersRetrying.value = false;
  }
}

// A provider that is off, one that cannot answer now, and one that can.
function markOf(provider: ProviderView): { icon: string; tone: string } {
  if (!provider.enabled) return { icon: "i-material-symbols-block", tone: "text-muted" };

  return provider.reason === null ? { icon: "i-material-symbols-check-circle-outline", tone: "text-success" } : { icon: "i-material-symbols-warning-outline", tone: "text-warning" };
}

const switching = ref("");

// The owner's switch thrown at once; the agency refuses turning off the last one on, which a notice says.
async function throwSwitch(provider: ProviderView, on: boolean): Promise<void> {
  switching.value = provider.name;

  try {
    const answered = await $fetch<ProviderView>(`/api/providers/${encodeURIComponent(provider.name)}`, { method: "PATCH", body: { enabled: on } });

    providers.value = (providers.value ?? []).map((one) => (one.name === provider.name ? answered : one));
  } catch (error) {
    island.say({ key: `provider:${provider.name}`, title: t("common.error.not_saved_named", { name: provider.label }), description: failureText(error, t("common.error.save_failed")), tone: "error" });
  } finally {
    switching.value = "";
  }
}

</script>
