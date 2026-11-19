<!-- The node list's filter, at the right end of the monitor's own tab row (docs/web.md, 「The node list」): every node,
     the shared ones or the personal ones, kept in the address. -->
<template>
  <ChoiceSelect
    :model-value="filter"
    :items="choices"
    value-key="value"
    :content="{ align: 'end' }"
    class="w-24"
    size="sm"
    color="neutral"
    variant="subtle"
    :aria-label="$t('hardware.aria.ownership_filter')"
    data-ownership-filter
    @update:model-value="(value: unknown) => change(ownershipFilterOf(value))"
  />
</template>

<script setup lang="ts">
import { ownershipFilterOf, useOwnershipFilter } from "~/domain/nodes";

const { t } = useI18n();
const { filter, change } = useOwnershipFilter();

const choices = computed(() => [
  { value: "all", label: t("hardware.label.ownership_all") },
  { value: "shared", label: t("hardware.label.ownership_shared") },
  { value: "personal", label: t("hardware.label.ownership_personal") }
]);
</script>
