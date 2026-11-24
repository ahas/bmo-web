<template>
  <!-- The start guide's connection test (docs/web.md, 「The start guide」): the source chosen tried now by the agency, saying
       that it answered or the pack's sentence for the agency's reason, with a way to try again. -->
  <div class="flex flex-col gap-4" data-guide-test>
    <SkeletonStatus v-if="testing && result === null" :label="$t('guide.status.testing')">
      <SkeletonBar class="block h-12 w-full rounded-md" />
    </SkeletonStatus>
    <UAlert v-else-if="result?.ok === true" color="success" variant="subtle" icon="i-material-symbols-check-circle-outline" :description="$t('guide.status.connected')" data-guide-test-ok />
    <UAlert v-else-if="result !== null || failure !== ''" :color="waiting ? 'neutral' : 'error'" variant="subtle" :icon="waiting ? 'i-material-symbols-schedule-outline' : 'i-material-symbols-error-outline'" :description="failure !== '' ? failure : reasonText(result?.reasonCode ?? null)" :ui="{ description: 'whitespace-pre-line break-keep' }" data-guide-test-failed />
    <div v-if="result?.ok !== true" class="flex justify-end">
      <UButton color="neutral" variant="subtle" icon="i-material-symbols-refresh" :label="$t('guide.action.test_again')" :loading="testing" :disabled="testing" data-guide-test-again @click="void run()" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import type { GuideTest } from "#shared/guide";

interface Props {
  // The road tried, as the agency names its provider, and the registration a local AI stands as.
  road: string;
  model: string | null;
}

const props = defineProps<Props>();
const done = defineModel<boolean>("done", { required: true });

const { t } = useI18n();
const testing = ref(false);
const result = ref<GuideTest | null>(null);
const failure = ref("");
// A source not ready yet is still being made, no failure: it is said in the quiet colour.
const waiting = computed(() => failure.value === "" && result.value?.reasonCode === "not-ready");

// The agency's reasons, each with its sentence in the pack; one the pack has no sentence for reads as a failed try.
const REASONS: Readonly<Record<string, string>> = {
  "no-source": "guide.message.reason_no_source",
  "login-needed": "guide.message.reason_login_needed",
  "not-ready": "guide.message.reason_not_ready",
  refused: "guide.message.reason_refused",
  off: "guide.message.reason_off",
  failed: "guide.message.reason_failed"
};

function reasonText(code: string | null): string {
  return t(REASONS[code ?? "failed"] ?? "guide.message.reason_failed");
}

async function run(): Promise<void> {
  testing.value = true;
  failure.value = "";
  try {
    result.value = await $fetch<GuideTest>("/api/me/guide/test", { method: "POST", body: { road: props.road, ...(props.model === null ? {} : { model: props.model }) } });
    done.value = result.value.ok;
  } catch (error) {
    result.value = null;
    failure.value = failureText(error, t("guide.message.reason_failed"));
  } finally {
    testing.value = false;
  }
}

onMounted(() => void run());
</script>
