<template>
  <!-- The organisation screen's secrets tab with the reader's own node chosen (docs/web.md, 「System and organisation」, the secrets
       tab): their own space. An administrator's own space is the platform's, listed at the platform node, so for them this
       node says so with the way there, and the platform's space stands in one place. -->
  <SettingsGroup v-if="administrator" data-secrets-platform-door>
    <SettingsRow :label="$t('secrets.label.administrator_own')">
      <UButton color="neutral" variant="outline" trailing-icon="i-material-symbols-arrow-forward" :label="$t('common.action.open')" :to="platformAddress" />
    </SettingsRow>
  </SettingsGroup>
  <SecretSpace v-else ref="space" :unit="null" :note="$t('secrets.label.note')" />
</template>

<script setup lang="ts">
import { useAdministrator } from "~/domain/access";
import { PLATFORM_NODE, organizationLinkAddress } from "~/domain/organization";

const administrator = useAdministrator();
const route = useRoute();
const platformAddress = computed(() => organizationLinkAddress(PLATFORM_NODE, route.query, "secrets"));

// The space's add, handed on to the tab row; none at the administrator's door.
const space = useTemplateRef<{ addLabel: string; addDisabled: boolean; openAdd: () => void }>("space");

defineExpose({
  addLabel: computed(() => (administrator.value ? null : (space.value?.addLabel ?? null))),
  addDisabled: computed(() => space.value?.addDisabled ?? true),
  openAdd: () => space.value?.openAdd()
});
</script>
