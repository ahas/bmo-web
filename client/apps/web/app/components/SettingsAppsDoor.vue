<template>
  <!-- The own apps section (docs/web.md, 「Settings」, the own apps section): a door to the one apps screen, the
       organisation screen's apps tab with the reader's own node chosen, where their apps are set. -->
  <SettingsGroup>
    <SettingsRow :label="$t('apps.label.tab')">
      <UButton color="neutral" variant="outline" trailing-icon="i-material-symbols-arrow-forward" :label="$t('common.action.open')" :to="address" data-apps-door @click="leave" />
    </SettingsRow>
  </SettingsGroup>
</template>

<script setup lang="ts">
import { PERSON_NODE, organizationLinkAddress } from "~/domain/organization";
import { useSettings } from "~/domain/settings-dialog";

// The tab the door opens at the reader's own node.
const address = organizationLinkAddress(PERSON_NODE, {}, "apps");
const settings = useSettings();

// The dialog is left behind as the door is followed: it stands over a screen, never in its address.
function leave(): void {
  settings.value = { ...settings.value, open: false, entered: false };
}
</script>
