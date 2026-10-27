<template>
  <!-- The voice briefing's one switch, the receiver's (docs/web.md, 「Settings」, the voice briefing section): whether
       anything is spoken at all. A briefing switched on plays as it arrives, so there is nothing else to set; one the
       receiver refused springs back, and the refusal stands under the section. Under it, the console's player placed
       and tried: where it first stands, kept in this browser, and the trial voice brought to it. -->
  <div class="flex flex-col gap-6">
    <ContentSkeleton v-if="switches === null && failure === ''" :rows="2" listClass="flex flex-col divide-y divide-default" :label="$t('briefing.status.settings_loading')">
      <div class="flex items-center gap-4 py-3">
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <SkeletonLine width="w-1/3" />
          <SkeletonLine width="w-1/2" />
        </div>
        <SkeletonBar class="h-5 w-9 shrink-0 rounded-full" />
      </div>
    </ContentSkeleton>

    <div v-else-if="switches === null" class="flex flex-col items-end gap-3">
      <UAlert class="w-full" color="error" variant="subtle" :description="failure" />
      <UButton color="neutral" variant="subtle" icon="i-material-symbols-refresh" :label="$t('common.action.refresh')" @click="read" />
    </div>

    <template v-else>
      <SettingsGroup>
        <SettingsRow :label="$t('briefing.label.switch_all')" :description="$t('briefing.label.switch_all_note')">
          <USwitch :model-value="switches.on" :aria-label="$t('briefing.label.switch_all')" :disabled="busy" data-briefing-switch="on" @update:model-value="(on: boolean) => set({ on })" />
        </SettingsRow>
      </SettingsGroup>
      <p v-if="failure !== ''" role="alert" class="text-sm text-error">{{ failure }}</p>
    </template>

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
          :placeholder="$t('common.label.default_choice')"
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
import { failureText } from "bmo-ui/app/domain/errors";

import { BRIEFING_TRIAL_KEY, briefingState, playTrialBriefing } from "~/domain/briefing";
import { BRIEFING_POSITION_DEFAULT, useBriefingPosition } from "~/domain/briefing-position";
import { SETTINGS_QUERY } from "~/domain/settings-dialog";

import type { BriefingSide } from "~/domain/briefing-position";
import type { BriefingSwitches } from "#shared/types";

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
// An emptied box is the first place again: as low as the page area lets it.
const top = computed({
  get: () => position.value.top ?? undefined,
  set: (next: number | null | undefined) => keep({ ...position.value, top: next === null || next === undefined ? null : Math.max(0, Math.round(next)) })
});

// The trial voice through the player: brought to it at a press, where it waits for the play press, and taken down by
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

const switches = ref<BriefingSwitches | null>(null);
const busy = ref(false);
const failure = ref("");

async function read(): Promise<void> {
  failure.value = "";

  try {
    switches.value = await $fetch<BriefingSwitches>("/api/voice-briefing");
  } catch (error) {
    failure.value = failureText(error, t("briefing.error.settings_read_failed"));
  }
}

// The switch set; the answer is how it stands after it.
async function set(change: { on: boolean }): Promise<void> {
  const before = switches.value;

  if (before === null) return;

  busy.value = true;
  failure.value = "";
  switches.value = { ...before, ...change };

  try {
    switches.value = await $fetch<BriefingSwitches>("/api/voice-briefing", { method: "PUT", body: change });
  } catch (error) {
    switches.value = before;
    failure.value = failureText(error, t("briefing.error.settings_write_failed"));
  } finally {
    busy.value = false;
  }
}

onMounted(() => void read());
</script>
