<template>
  <!-- The providers tab of the administration screen (docs/web.md, 「Administration」, the providers tab): every
       provider the agency carries, in its order, with what it has left, why it cannot answer now and the owner's
       switch, each taking effect as it is thrown; under them the secrets the agency's provider tools read, then the
       Claude accounts the Claude Code provider walks, a new one added from the tab row's add. No key the agency holds
       is read here. Each stands as a group under its heading, keeping its place with a skeleton while it is first
       read. -->
  <div class="flex flex-col gap-4">
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
          <span v-if="quotaText($t, one.quota) !== ''" class="text-sm tabular-nums text-muted">{{ quotaText($t, one.quota) }}</span>
          <HintTip v-if="one.reason !== null" :text="one.reasonEnglish ?? undefined" :disabled="one.reasonEnglish === null" class="min-w-0">
            <span class="break-words text-sm text-warning">{{ one.reason }}</span>
          </HintTip>
          <!-- Where its own key is read from a file, whether that file stands and the way to set it: the words take
               the room and the way to set it stands at the line's end, so the words changing never move it. -->
          <span v-if="one.keyFile !== null" class="flex min-w-0 items-center gap-2 text-sm text-muted" :data-provider-key="one.keyFile">
            <span v-if="keyOf(one.keyFile) !== null" class="min-w-0 flex-1 break-words tabular-nums">{{ $t("agents.label.key_held", { time: formatStamp(Math.floor(keyOf(one.keyFile)!.changedAt / 1000)) }) }}</span>
            <span v-else class="min-w-0 flex-1 break-words text-warning">{{ $t("agents.label.key_missing") }}</span>
            <UButton size="xs" color="neutral" variant="link" class="shrink-0 px-0" :label="$t('agents.action.key_set')" @click="keyFor = one" />
          </span>
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

    <ProviderKeyDialog v-if="keyFor !== null && keyFor.keyFile !== null" v-model:open="keyOpen" :label="keyFor.label" :file="keyFor.keyFile" @kept="keyKept" />

    <ProviderSecretSettings />

    <AgentsAccounts v-if="fallback.accounts.length > 0 || fallbackStatus === 'success'" ref="accountsRef" :accounts="fallback.accounts" :reread="rereadFallback" />
    <SettingsGroup v-else :title="$t('agents.title.accounts')">
      <div v-if="fallbackStatus === 'error' || retrying" class="flex flex-col items-end gap-3 py-3">
        <UAlert class="w-full" color="error" variant="subtle" :description="$t('agents.error.accounts_read_failed')" />
        <UButton color="neutral" variant="subtle" icon="i-material-symbols-refresh" :label="$t('common.action.refresh')" :loading="retrying" @click="retryAccounts" />
      </div>
      <ContentSkeleton v-else :rows="1" listClass="flex flex-col divide-y divide-default" :label="$t('agents.status.accounts_loading')">
        <div class="grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-x-1 py-1">
          <span class="flex size-11 items-center justify-center"><SkeletonBar class="size-5 rounded-sm" /></span>
          <span class="flex min-w-0 flex-col py-1">
            <SkeletonLine width="w-1/3" />
            <SkeletonLine width="w-1/2" />
          </span>
          <SkeletonBar class="h-5 w-40 shrink-0 rounded-md" />
        </div>
      </ContentSkeleton>
    </SettingsGroup>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { useIsland } from "bmo-ui/app/domain/island";

import { emptyFallbackView } from "~/domain/agent-settings";
import { formatStamp } from "bmo-ui/app/domain/time";

import { quotaText, useProviders } from "~/domain/axes";

import type { ProviderView } from "#shared/axes";
import type { FallbackView, SecretList } from "#shared/types";

const { t } = useI18n();
const island = useIsland(t);

const { data: providers, refresh, status } = useProviders();
const { data: fallback, refresh: refreshFallback, status: fallbackStatus } = useFetch<FallbackView>("/api/fallback", { key: "fallback", lazy: true, server: false, default: emptyFallbackView });

async function rereadFallback(): Promise<void> {
  await refreshFallback();
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

// A failed first read of the accounts asked again: the failure stands, its button spinning, until the answer lands.
const retrying = ref(false);

async function retryAccounts(): Promise<void> {
  retrying.value = true;
  try {
    await refreshFallback();
  } finally {
    retrying.value = false;
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
