<template>
  <!-- The briefing player (docs/web.md, 「Settings」, the briefing player section): where the console's player first
       stands, kept in this browser, and the trial voice brought to it. Whether anything is spoken at all is the
       deployment's, on the organisation settings screen's voice briefing tab. -->
  <div class="flex flex-col gap-6">
    <SettingsGroup>
      <SettingsRow :label="$t('briefing.label.position_side')">
        <SettingsSegment v-model="side" :items="sideItems" :label="$t('briefing.label.position_side')" />
      </SettingsRow>
      <SettingsRow :label="$t('briefing.label.position_top')">
        <NumberInput
          v-model="top"
          :min="0"
          :step="8"
          :digits="4"
          :unit="$t('briefing.label.pixels')"
          :aria-label="$t('briefing.label.position_top')"
          data-briefing-top
        />
      </SettingsRow>
    </SettingsGroup>

    <div class="flex flex-wrap items-center justify-end gap-2">
      <UButton color="neutral" variant="ghost" icon="i-material-symbols-restart-alt" :label="$t('briefing.action.reset_position')" @click="keep(BRIEFING_POSITION_DEFAULT)" />
      <UButton
        color="neutral"
        variant="subtle"
        :icon="trialStanding ? 'i-material-symbols-stop-rounded' : 'i-material-symbols-play-arrow-rounded'"
        :label="trialStanding ? $t('briefing.action.stop_trial') : $t('briefing.action.play_trial')"
        data-briefing-trial
        @click="toggleTrial"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { BRIEFING_TRIAL_KEY, briefingState, playTrialBriefing } from "~/domain/briefing";
import { BRIEFING_POSITION_DEFAULT, useBriefingPosition } from "~/domain/briefing-position";
import { SETTINGS_QUERY } from "~/domain/settings-dialog";

import type { BriefingSide } from "~/domain/briefing-position";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

// Where the player first stands, as the player itself keeps it: each change is kept at once and moves it.
const { position, keep } = useBriefingPosition();
const sideItems = computed(() => [
  { label: t("briefing.label.side_left"), value: "left" },
  { label: t("briefing.label.side_right"), value: "right" }
]);
const side = computed({
  get: () => position.value.side,
  set: (next: string) => keep({ ...position.value, side: next as BriefingSide })
});
// An emptied box is the first place again: as low as the page area lets it. That place is no number the screen can
// write, so the box stands empty with no word (docs/web.md, 「The default among choices」).
const top = computed({
  get: () => position.value.top ?? undefined,
  set: (next: number | null | undefined) => keep({ ...position.value, top: next === null || next === undefined ? null : Math.max(0, Math.round(next)) })
});

// The trial voice through the player: brought to it at a press, where it plays as a briefing does, and taken down by
// the same button while it stands. The player's title leads back to the screen it was tried on, with this section
// open.
const shown = briefingState();
const trialStanding = computed(() => shown.value?.key === BRIEFING_TRIAL_KEY);

function toggleTrial(): void {
  if (trialStanding.value) {
    shown.value?.stop();

    return;
  }

  playTrialBriefing(router.resolve({ path: route.path, query: { ...route.query, [SETTINGS_QUERY]: "briefing" }, hash: route.hash }).fullPath);
}
</script>
