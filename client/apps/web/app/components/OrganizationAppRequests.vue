<template>
  <!-- The requests to make a shared personal app a platform app (docs/web.md, 「System and organisation」, the apps tab with the
       platform chosen): every company's, newest first, each a row of the app's title and who asked when, with the
       note under it. The app ships as a platform tool once the administrator puts it. -->
  <SettingsGroup :title="$t('app_catalogue.label.promotions')" data-admin-promotions>
    <ContentSkeleton v-if="items === null && failure === ''" :rows="2" listClass="flex flex-col divide-y divide-default" :label="$t('app_catalogue.status.loading')">
      <div class="flex flex-col gap-1 py-3">
        <SkeletonLine width="w-1/3" />
        <SkeletonLine width="w-1/2" />
      </div>
    </ContentSkeleton>

    <FailedRead v-else-if="items === null" class="py-3" :message="failure" :reading="reading" @retry="void read()" />

    <p v-else-if="items.length === 0" class="py-3 text-sm text-muted" data-admin-promotions-none>{{ $t("app_catalogue.label.no_promotions") }}</p>

    <SettingsRow v-for="item in items ?? []" v-else :key="`${item.company}:${item.id}`" :label="item.title" :data-admin-promotion="item.id">
      <template #description>
        <span class="text-sm text-muted">{{ $t("app_catalogue.label.promotion_line", { company: item.companyName, by: item.byName, time: formatStamp(Math.floor(item.at / 1000)) }) }}</span>
        <span v-if="item.note" class="break-keep break-words text-sm text-muted">{{ item.note }}</span>
      </template>
    </SettingsRow>
  </SettingsGroup>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { formatStamp } from "bmo-ui/app/domain/time";

import type { CataloguePromotion } from "#shared/app-catalogue";

const { t } = useI18n();

const items = ref<CataloguePromotion[] | null>(null);
const failure = ref("");
const reading = ref(false);

async function read(): Promise<void> {
  reading.value = true;
  failure.value = "";

  try {
    items.value = await $fetch<CataloguePromotion[]>("/api/organization/platform/app-requests");
  } catch (error) {
    items.value = null;
    failure.value = failureText(error, t("app_catalogue.error.read_failed"));
  } finally {
    reading.value = false;
  }
}

onMounted(() => void read());
</script>
