<template>
  <!-- The personal apps section (docs/web.md, 「Settings」, the personal apps section): every tool of the reader's own
       their BMO made on their PC, each a row of its name, what it does, its version and when it was put, and what it
       may reach, with its share into the company's catalogue, the way back to the version before and its deletion,
       the last two asked first. -->
  <div class="flex flex-col gap-6">
    <ContentSkeleton v-if="apps === null && failure === ''" :rows="2" listClass="flex flex-col divide-y divide-default" :label="$t('personal_apps.status.loading')">
      <div class="flex items-center gap-4 py-3">
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <SkeletonLine width="w-1/3" />
          <SkeletonLine width="w-2/3" />
          <SkeletonLine width="w-1/2" />
        </div>
        <SkeletonBar class="h-6 w-24 shrink-0 rounded-md" />
      </div>
    </ContentSkeleton>

    <div v-else-if="apps === null" class="flex flex-col items-end gap-3">
      <UAlert class="w-full" color="error" variant="subtle" :description="failure" />
      <UButton color="neutral" variant="subtle" icon="i-material-symbols-refresh" :label="$t('common.action.refresh')" :loading="reading" @click="read()" />
    </div>

    <template v-else>
      <p v-if="apps.items.length > 0 && !apps.reached" class="text-sm text-muted" data-personal-apps-unreached>{{ $t("personal_apps.label.unreached") }}</p>

      <SettingsGroup>
        <p v-if="apps.items.length === 0" class="py-3 text-sm text-muted" data-personal-apps-none>{{ $t("personal_apps.label.none") }}</p>

        <template v-else>
          <SettingsRow v-for="app in apps.items" :key="app.name" :label="appLabel(app)" :data-personal-app="app.name">
            <template #description>
              <span v-if="app.entries[0]?.description" class="text-sm text-muted">{{ app.entries[0].description }}</span>
              <span class="text-sm text-muted">{{ $t("personal_apps.label.updated", { time: formatStamp(Math.floor(app.putAt / 1000)) }) }}</span>
              <span class="text-sm text-muted" data-personal-app-version>
                {{ $t("personal_apps.label.version") }}
                <span class="font-mono">{{ app.version }}</span>
              </span>
              <AppPermissionList :permissions="app.permissions" :reach="apps.reach" class="mt-1" data-personal-app-permissions />
            </template>

            <IconButton
              size="sm"
              icon="i-material-symbols-share-outline"
              :label="$t('app_catalogue.action.share')"
              :disabled="busy !== null"
              data-personal-app-share
              @click="sharing = app"
            />
            <IconButton
              size="sm"
              icon="i-material-symbols-history"
              :label="$t('personal_apps.action.back')"
              :loading="busy === `back:${app.name}`"
              :disabled="busy !== null || !hasOlder(app)"
              data-personal-app-back
              @click="back(app)"
            />
            <IconButton
              size="sm"
              icon="i-material-symbols-delete-outline"
              :label="$t('common.action.delete')"
              :loading="busy === `delete:${app.name}`"
              :disabled="busy !== null"
              data-personal-app-delete
              @click="remove(app)"
            />
          </SettingsRow>
        </template>
      </SettingsGroup>

      <p v-if="refusal !== ''" role="alert" class="text-sm text-error" data-personal-apps-refusal>{{ refusal }}</p>
      <p v-if="sharedNote !== ''" role="status" class="text-sm text-muted" data-personal-apps-shared>{{ sharedNote }}</p>
    </template>

    <CatalogueShareDialog
      v-if="sharing !== null"
      :open="sharing !== null"
      :name="sharing.name"
      :title="appLabel(sharing)"
      @update:open="(standing: boolean) => (standing ? undefined : (sharing = null))"
      @shared="(shared) => (sharedNote = $t('app_catalogue.message.shared', { app: shared.title }))"
    />
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { formatStamp } from "bmo-ui/app/domain/time";

import { useConfirm } from "~/domain/confirm";

import type { PersonalApp, PersonalApps } from "#shared/personal-apps";

const { t } = useI18n();
const confirm = useConfirm();

const apps = ref<PersonalApps | null>(null);
const failure = ref("");
const reading = ref(false);
const busy = ref<string | null>(null);
const refusal = ref("");
const sharing = ref<PersonalApp | null>(null);
const sharedNote = ref("");

// An app by its entry's title where it gives one, else by its name.
function appLabel(app: PersonalApp): string {
  return app.entries[0]?.title ?? app.name;
}

// Whether the PC keeps a version older than the one in place.
function hasOlder(app: PersonalApp): boolean {
  return (app.kept?.length ?? 0) > 0;
}

async function read(): Promise<void> {
  reading.value = true;
  failure.value = "";

  try {
    apps.value = await $fetch<PersonalApps>("/api/account/personal-apps");
  } catch (error) {
    apps.value = null;
    failure.value = failureText(error, t("personal_apps.error.read_failed"));
  } finally {
    reading.value = false;
  }
}

onMounted(() => void read());

// One change asked first, then made, and the list read again; a refusal is said under the list.
async function act(app: PersonalApp, kind: "back" | "delete", asked: Parameters<typeof confirm>[0], failed: string): Promise<void> {
  if (!(await confirm(asked))) return;

  busy.value = `${kind}:${app.name}`;
  refusal.value = "";

  try {
    if (kind === "back") await $fetch(`/api/account/personal-apps/${app.name}/back`, { method: "POST" });
    else await $fetch(`/api/account/personal-apps/${app.name}`, { method: "DELETE" });
  } catch (error) {
    refusal.value = failureText(error, failed);
  } finally {
    await read();
    busy.value = null;
  }
}

async function back(app: PersonalApp): Promise<void> {
  await act(
    app,
    "back",
    { title: t("personal_apps.message.back_confirm"), item: appLabel(app), effect: t("personal_apps.message.back_effect"), confirm: t("personal_apps.action.back") },
    t("personal_apps.error.back_failed")
  );
}

async function remove(app: PersonalApp): Promise<void> {
  await act(
    app,
    "delete",
    { title: t("personal_apps.message.delete_confirm"), item: appLabel(app), effect: t("personal_apps.message.delete_effect"), confirm: t("common.action.delete") },
    t("personal_apps.error.delete_failed")
  );
}
</script>
