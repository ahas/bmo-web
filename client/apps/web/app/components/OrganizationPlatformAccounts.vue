<template>
  <!-- The platform's own credentials on the supply tab with the platform chosen (docs/web.md, 「Organisation」, the
       supply tab): the keys the providers read from a file of the platform administrator's secret space, each held or
       not with the way to set it, then the Claude accounts in the order the Claude Code provider walks them, each
       saying whose it is, a new one added from the group's heading. No key, token or credential is read here. -->
  <div class="flex flex-col gap-4" data-platform-credentials>
    <SettingsGroup :title="$t('supply.title.platform_keys')" data-platform-keys>
      <ContentSkeleton v-if="providers === undefined" :rows="2" list-class="flex flex-col divide-y divide-default" :label="$t('agents.status.providers_loading')">
        <div class="flex items-center gap-4 py-3"><SkeletonLine width="w-1/3" /></div>
      </ContentSkeleton>
      <SettingsRow v-else-if="keyed.length === 0" :label="$t('supply.label.platform_keys_none')" />
      <SettingsRow v-for="one in keyed" v-else :key="one.name" :label="one.label" :data-provider-key="one.keyFile">
        <template #description>
          <span v-if="keyOf(one.keyFile!) !== null" class="break-words text-sm tabular-nums text-muted">{{ $t("agents.label.key_held", { time: formatStamp(Math.floor(keyOf(one.keyFile!)!.changedAt / 1000)) }) }}</span>
          <span v-else class="break-words text-sm text-warning">{{ $t("agents.label.key_missing") }}</span>
        </template>
        <UButton color="neutral" variant="outline" :label="$t('agents.action.key_set')" @click="keyFor = one" />
      </SettingsRow>
    </SettingsGroup>

    <ProviderKeyDialog v-if="keyFor !== null && keyFor.keyFile !== null" v-model:open="keyOpen" :label="keyFor.label" :file="keyFor.keyFile" @kept="keyKept" />

    <AgentsAccounts v-if="fallback.accounts.length > 0 || fallbackStatus === 'success'" :accounts="fallback.accounts" :reread="rereadFallback" :usage="accountsUsage" :names="names" />
    <SettingsGroup v-else :title="$t('agents.title.accounts')">
      <FailedRead v-if="fallbackStatus === 'error'" class="py-3" :message="$t('agents.error.accounts_read_failed')" :reading="false" @retry="void rereadFallback()" />
      <ContentSkeleton v-else :rows="1" list-class="flex flex-col divide-y divide-default" :label="$t('agents.status.accounts_loading')">
        <div class="flex items-center gap-4 py-3"><SkeletonLine width="w-1/3" /></div>
      </ContentSkeleton>
    </SettingsGroup>
  </div>
</template>

<script setup lang="ts">
import { formatStamp } from "bmo-ui/app/domain/time";

import { emptyFallbackView } from "~/domain/agent-settings";
import { useProviders } from "~/domain/axes";
import { useAccountNames } from "~/domain/nodes";
import { usageGroups } from "~/domain/usage";
import { useUsageRead } from "~/domain/usage-read";

import type { ProviderView } from "#shared/axes";
import type { FallbackView, SecretList } from "#shared/types";
import type { UsageFiguresRead } from "~/domain/usage";

const { data: providers, refresh } = useProviders();
const { names } = useAccountNames();
const { data: fallback, refresh: refreshFallback, status: fallbackStatus } = useFetch<FallbackView>("/api/fallback", { key: "fallback", lazy: true, server: false, default: emptyFallbackView });

async function rereadFallback(): Promise<void> {
  await refreshFallback();
}

// What each account has left, read as the title bar's panel reads it and under the same key.
const { usage, now, initial } = useUsageRead();
const accountsUsage = computed<UsageFiguresRead>(() => ({ groups: usageGroups(usage.value), now: now.value, initial: initial.value }));

// The providers that read their own key from a file of the platform administrator's space.
const keyed = computed(() => (providers.value ?? []).filter((one) => one.keyFile !== null));

// The administrator's secrets by name, to say whether a provider's key file stands; none until read.
const { data: secrets, refresh: refreshSecrets } = useFetch<SecretList>("/api/secrets", { key: "provider-keys", lazy: true, server: false });

function keyOf(file: string): { changedAt: number } | null {
  return secrets.value?.secrets.find((one) => one.name === file) ?? null;
}

// The provider whose key is being set, its dialog open while it is.
const keyFor = ref<ProviderView | null>(null);
const keyOpen = computed({
  get: () => keyFor.value !== null,
  set: (open: boolean) => {
    if (!open) keyFor.value = null;
  }
});

// A key kept: the files and the providers read again, so the row says the key stands and its reason clears.
async function keyKept(): Promise<void> {
  await Promise.all([refreshSecrets(), refresh()]);
}
</script>
