<template>
  <!-- The agents tab with the reader's own node chosen (docs/web.md, 「System and organisation」, the agents tab, and 「Settings」):
       their own BMO, where they may personalise it and own one, then their own agents and instructions over the set
       their organisation supplies. -->
  <div class="flex flex-col gap-6" data-org-person-agents>
    <section v-if="ownBmo?.personalize === true && ownBmo.hasBmo" class="flex flex-col gap-2" data-org-person-bmo>
      <h2 class="text-sm font-medium text-highlighted">{{ $t("settings.label.agent") }}</h2>
      <SettingsBmo />
    </section>
    <SettingsOwnAgents />
  </div>
</template>

<script setup lang="ts">
import type { OwnBmoView } from "#shared/bmo-profile";

// Whether the reader may personalise their own BMO and owns one, the read the settings dialog makes.
const { data: ownBmo } = useFetch<OwnBmoView | null>("/api/account/agent", { key: "bmo-profile", server: false, lazy: true, default: () => null });
</script>
