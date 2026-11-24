<template>
  <!-- The secret store section (docs/web.md, 「Settings」, the secret store section): a door to the organisation screen's
       secrets tab, at the reader's own node, or at the platform for an administrator, whose own space is the
       platform's. -->
  <SettingsDoor tab="secrets" label="settings.label.secrets" :node="administrator ? PLATFORM_NODE : PERSON_NODE" />
</template>

<script setup lang="ts">
import { useAdministrator } from "~/domain/access";
import { PERSON_NODE, PLATFORM_NODE } from "~/domain/organization";

const administrator = useAdministrator();
</script>
