<template>
  <!-- The voice briefing's own settings (docs/web.md, 「Settings」): no unit serves a route for the briefing's
       switch or a line's reading, so the section says they cannot be read and offers none. -->
  <div class="flex flex-col gap-6">
    <SettingsGroup>
      <p class="py-3 text-sm text-muted">{{ $t("settings.status.briefing_unavailable") }}</p>
    </SettingsGroup>
  </div>
</template>
