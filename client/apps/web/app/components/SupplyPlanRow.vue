<template>
  <!-- One plan as every plan list stands it (docs/web.md, 「Administration」, the plans tab, and 「Organisation」, the
       plans tab): its name as the label, its scope, its period with the credits it includes, and whether credits may
       be used on it under it, and its price at the row's end before whatever the list lays beside it. -->
  <SettingsRow :label="props.plan.name" :data-plan="props.plan.id">
    <template #description>
      <span class="flex min-w-0 flex-wrap items-center gap-x-2 text-sm text-muted">
        <span>{{ props.plan.scope === "personal" ? $t("supply.label.scope_personal") : $t("supply.label.scope_organisation") }}</span>
        <span class="tabular-nums">{{ periodLabel(t, props.plan.period) }} · {{ props.plan.includedCredits === null ? "—" : creditsText(t, props.plan.includedCredits) }}</span>
        <span>{{ props.plan.creditsUsable ? $t("supply.label.credits_usable_on") : $t("supply.label.credits_usable_off") }}</span>
      </span>
      <slot name="under" />
    </template>
    <span class="text-sm tabular-nums text-highlighted">{{ wonText(t, props.plan.price) }}</span>
    <slot />
  </SettingsRow>
</template>

<script setup lang="ts">
import { creditsText, periodLabel, wonText } from "~/domain/supply";

import type { SupplyPlanEntry } from "#shared/supply";

interface Props {
  plan: SupplyPlanEntry;
}

const props = defineProps<Props>();

const { t } = useI18n();
</script>
