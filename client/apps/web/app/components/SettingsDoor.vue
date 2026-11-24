<template>
  <!-- A section of the settings that is a door (docs/web.md, 「Settings」): one row naming a tab of the organisation
       screen, which opens that tab with the reader's own node chosen, where what the section once held is set. -->
  <SettingsGroup>
    <SettingsRow :label="$t(label)">
      <UButton color="neutral" variant="outline" trailing-icon="i-material-symbols-arrow-forward" :label="$t('common.action.open')" :to="address" :data-settings-door="tab" @click="leave" />
    </SettingsRow>
  </SettingsGroup>
</template>

<script setup lang="ts">
import { PERSON_NODE, organizationLinkAddress } from "~/domain/organization";
import { useSettings } from "~/domain/settings-dialog";

interface Props {
  // The organisation screen's tab the door opens, and its name in the language pack.
  tab: string;
  label: string;
}

const props = defineProps<Props>();

// The tab the door opens at the reader's own node.
const address = computed(() => organizationLinkAddress(PERSON_NODE, {}, props.tab));
const settings = useSettings();

// The dialog is left behind as the door is followed: it stands over a screen, never in its address.
function leave(): void {
  settings.value = { ...settings.value, open: false, entered: false };
}
</script>
