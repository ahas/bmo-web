<template>
  <!-- The minutes between two of the agency's flushes of the deploy queue (docs/web.md, 「Administration」, the providers
       tab): one box in minutes, saved once it is left or Enter is pressed, emptied to return to the agency's own. A
       refusal is said under the row's label, the box keeping what was written. -->
  <SettingsGroup :title="$t('agents.title.deploy')" data-deploy-flush>
    <ContentSkeleton v-if="held === null && failure === ''" :rows="1" list-class="flex flex-col divide-y divide-default" :label="$t('agents.status.deploy_flush_loading')">
      <div class="flex items-center gap-4 py-3">
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <SkeletonLine width="w-1/3" />
          <SkeletonLine width="w-1/2" />
        </div>
        <SkeletonBar class="h-8 w-28 shrink-0 rounded-md" />
      </div>
    </ContentSkeleton>

    <FailedRead v-else-if="held === null" class="py-3" :message="failure" :reading="reading" @retry="void read()" />

    <SettingsRow v-else :label="$t('agents.label.deploy_flush')">
      <template #description>
        <span v-if="refusal !== ''" class="text-sm text-error" data-deploy-flush-refusal>{{ refusal }}</span>
        <span v-else class="text-sm text-muted">{{ $t("agents.label.deploy_flush_note") }}</span>
      </template>
      <UInput
        v-model="written"
        class="w-28 text-end tabular-nums"
        inputmode="numeric"
        :loading="saving"
        :aria-label="$t('agents.label.deploy_flush')"
        data-deploy-flush-minutes
        @keyup.enter="save"
        @blur="save"
      >
        <template #trailing>
          <span class="text-sm text-muted">{{ $t("agents.label.deploy_flush_unit") }}</span>
        </template>
      </UInput>
    </SettingsRow>
  </SettingsGroup>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import { minutesWords, minutesWritten } from "~/domain/deploy-flush";

import type { DeployFlushAsk, DeployFlushView } from "#shared/deploy-flush";

const { t } = useI18n();

const held = ref<DeployFlushView | null>(null);
// A failed read stands until a read goes through, so asking again keeps its reason in place with its button spinning.
const failure = ref("");
const reading = ref(false);
const written = ref("");
const saving = ref(false);
const refusal = ref("");
// The words the agency last refused as a value, so leaving the box after Enter does not ask it the same again; a
// failure that was no refusal of the value is asked again as the box is left.
const refused = ref<string | null>(null);

async function read(): Promise<void> {
  reading.value = true;
  try {
    held.value = await $fetch<DeployFlushView>("/api/deploy-flush-minutes");
    written.value = minutesWords(held.value.minutes);
    failure.value = "";
  } catch (error) {
    failure.value = failureText(error, t("agents.error.deploy_flush_read_failed"));
  } finally {
    reading.value = false;
  }
}

// The box saved as it is left: words that are no figure are written back to the minutes in force in silence, a
// figure the agency already holds is not sent, and the agency's answer becomes what the box shows.
async function save(): Promise<void> {
  if (held.value === null || saving.value || written.value === refused.value) return;

  const asked = minutesWritten(written.value);

  if (!asked.readable) {
    written.value = minutesWords(held.value.minutes);
    refusal.value = "";
    return;
  }
  if (asked.minutes !== null && asked.minutes === held.value.minutes) {
    written.value = minutesWords(held.value.minutes);
    refusal.value = "";
    return;
  }

  saving.value = true;
  try {
    const body: DeployFlushAsk = { minutes: asked.minutes };

    held.value = await $fetch<DeployFlushView>("/api/deploy-flush-minutes", { method: "PUT", body });
    written.value = minutesWords(held.value.minutes);
    refusal.value = "";
    refused.value = null;
  } catch (error) {
    refusal.value = failureText(error, t("common.error.save_failed"));
    refused.value = statusOf(error) === 400 ? written.value : null;
  } finally {
    saving.value = false;
  }
}

function statusOf(error: unknown): number | undefined {
  return (error as { statusCode?: number } | null)?.statusCode;
}

onMounted(() => void read());
</script>
