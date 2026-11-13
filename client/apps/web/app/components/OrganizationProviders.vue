<template>
  <!-- The providers tab of the organisation settings screen (docs/web.md, 「Organisation settings」, the providers
       tab): every provider the agency carries, in its order, with what it has left, why it cannot answer now and the
       owner's switch, each taking effect as it is thrown; under them the Claude accounts the Claude Code provider
       walks, a new one added from the screen's create button. No key the agency holds is read here. -->
  <div class="flex flex-col gap-6">
    <SettingsGroup :title="$t('agents.title.providers')">
      <ContentSkeleton v-if="providers === undefined && status !== 'error'" :rows="4" listClass="flex flex-col divide-y divide-default" :label="$t('agents.status.providers_loading')">
        <div class="flex items-center gap-4 py-3">
          <SkeletonBar class="size-4 shrink-0 rounded-full" />
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <SkeletonLine width="w-1/3" />
            <SkeletonLine width="w-1/2" />
          </div>
          <SkeletonBar class="h-5 w-9 shrink-0 rounded-full" />
        </div>
      </ContentSkeleton>

      <div v-else-if="providers === undefined" class="flex flex-col items-end gap-3 py-3">
        <UAlert class="w-full" color="error" variant="subtle" :description="$t('agents.error.providers_read_failed')" />
        <UButton color="neutral" variant="subtle" icon="i-material-symbols-refresh" :label="$t('common.action.refresh')" :loading="status === 'pending'" @click="refresh()" />
      </div>

      <template v-else>
      <div v-for="one in providers" :key="one.name" :data-provider="one.name" class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3" :class="one.enabled ? '' : 'opacity-60'">
        <div class="flex min-w-0 grow basis-40 items-start gap-2">
          <UIcon :name="markOf(one).icon" class="mt-0.5 size-4 shrink-0" :class="markOf(one).tone" />
          <div class="flex min-w-0 flex-col">
            <span class="text-sm text-highlighted">{{ one.label }}</span>
            <span v-if="quotaText($t, one.quota) !== ''" class="text-sm tabular-nums text-muted">{{ quotaText($t, one.quota) }}</span>
            <HintTip v-if="one.reason !== null" :text="one.reasonEnglish ?? undefined" :disabled="one.reasonEnglish === null" class="min-w-0">
              <span class="break-words text-sm text-warning">{{ one.reason }}</span>
            </HintTip>
          </div>
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

    <AgentsAccounts v-if="fallback.accounts.length > 0 || fallbackStatus === 'success'" ref="accountsRef" :accounts="fallback.accounts" :reread="rereadFallback" />
    <p v-else-if="fallbackStatus === 'error'" role="alert" class="text-sm text-error">{{ $t("agents.error.accounts_read_failed") }}</p>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { useIsland } from "bmo-ui/app/domain/island";

import { emptyFallbackView } from "~/domain/agent-settings";
import { quotaText, useProviders } from "~/domain/axes";

import type { ProviderView } from "#shared/axes";
import type { FallbackView } from "#shared/types";

const { t } = useI18n();
const island = useIsland(t);

const { data: providers, refresh, status } = useProviders();
const { data: fallback, refresh: refreshFallback, status: fallbackStatus } = useFetch<FallbackView>("/api/fallback", { key: "fallback", lazy: true, server: false, default: emptyFallbackView });

async function rereadFallback(): Promise<void> {
  await refreshFallback();
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

// The tab's create: a Claude login, by the accounts' box, standing off until the accounts are read.
const accountsRef = useTemplateRef<{ openAdd: () => void }>("accountsRef");

defineExpose({ addLabel: computed(() => t("agents.title.account_add")), addDisabled: computed(() => accountsRef.value === null), openAdd: () => accountsRef.value?.openAdd() });
</script>
