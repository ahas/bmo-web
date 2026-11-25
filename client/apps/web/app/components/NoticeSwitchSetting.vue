<template>
  <!-- The owner's private chat's notice switches (docs/web.md, 「System and organisation」, the providers tab; the receiver's
       `docs/api.md`, 「Notices」): the restart switch, the going-down and back notices, and the rest switch, the rest's beginning and
       lifting, each set as it is pressed. One the receiver refused springs back, its refusal under the group. -->
  <SettingsGroup :title="$t('agents.title.notices')" data-notice-switches>
    <ContentSkeleton v-if="held === null && failure === ''" :rows="2" list-class="flex flex-col divide-y divide-default" :label="$t('agents.status.notice_switches_loading')">
      <div class="flex items-center gap-4 py-3">
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <SkeletonLine width="w-1/3" />
          <SkeletonLine width="w-1/2" />
        </div>
        <SkeletonBar class="h-5 w-9 shrink-0 rounded-full" />
      </div>
    </ContentSkeleton>

    <FailedRead v-else-if="held === null" class="py-3" :message="failure" :reading="reading" @retry="void read()" />

    <template v-else>
      <SettingsRow v-for="row in rows" :key="row.kind" :label="row.label" :description="row.note">
        <USwitch
          :model-value="held[row.kind]"
          :loading="busy === row.kind"
          :disabled="busy !== null"
          :aria-label="row.label"
          :data-notice-switch="row.kind"
          @update:model-value="(on: boolean) => void set(row.kind, on)"
        />
      </SettingsRow>
      <p v-if="failure !== ''" role="alert" class="break-words py-2 text-sm text-error">{{ failure }}</p>
    </template>
  </SettingsGroup>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import type { NoticeSwitchesView, NoticeSwitchKind } from "#shared/rest";

const { t } = useI18n();

// Each switch by its name and what it holds back.
const rows = computed<{ kind: NoticeSwitchKind; label: string; note: string }[]>(() => [
  { kind: "restart", label: t("agents.label.notice_restart"), note: t("agents.label.notice_restart_note") },
  { kind: "rest", label: t("agents.label.notice_rest"), note: t("agents.label.notice_rest_note") }
]);

const held = ref<NoticeSwitchesView | null>(null);
// A failed read stands until a read goes through; a refused change stands under the switches until the next one.
const failure = ref("");
const reading = ref(false);
const busy = ref<NoticeSwitchKind | null>(null);

async function read(): Promise<void> {
  reading.value = true;
  try {
    held.value = await $fetch<NoticeSwitchesView>("/api/notice-switches");
    failure.value = "";
  } catch (error) {
    failure.value = failureText(error, t("agents.error.notice_switches_read_failed"));
  } finally {
    reading.value = false;
  }
}

// A switch is sent as it is pressed and stands as the receiver answers; a refusal leaves both as they were.
async function set(kind: NoticeSwitchKind, on: boolean): Promise<void> {
  busy.value = kind;
  try {
    held.value = await $fetch<NoticeSwitchesView>(`/api/notice-switches/${kind}`, { method: "PUT", body: { on } });
    failure.value = "";
  } catch (error) {
    failure.value = failureText(error, t("common.error.save_failed"));
  } finally {
    busy.value = null;
  }
}

onMounted(() => void read());
</script>
