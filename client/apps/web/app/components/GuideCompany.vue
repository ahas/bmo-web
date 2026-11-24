<template>
  <!-- The start guide's company step (docs/web.md, 「The start guide」): the first company unit's name, written as the next step is
       pressed, or a company made under it where none stands. -->
  <div class="flex flex-col gap-4" data-guide-company>
    <ContentSkeleton v-if="reading" :rows="1" :label="$t('guide.status.loading')">
      <SkeletonLine width="w-1/2" />
    </ContentSkeleton>
    <UFormField v-else :label="$t('guide.label.company')" name="company">
      <UInput v-model="name" class="w-full" autocomplete="organization" data-guide-company-name />
    </UFormField>
    <p v-if="failure !== ''" role="alert" class="break-words text-sm text-error" data-guide-failure>{{ failure }}</p>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import type { UnitRow } from "@web/server-client";

const done = defineModel<boolean>("done", { required: true });

const { t } = useI18n();
const reading = ref(true);
const failure = ref("");
const company = ref<UnitRow | null>(null);
const name = ref("");

watch(name, (typed) => {
  done.value = typed.trim() !== "";
});

/** The company named; true where it went through, a name unchanged asking nothing. */
async function commit(): Promise<boolean> {
  const typed = name.value.trim();

  failure.value = "";
  try {
    if (company.value === null) {
      await $fetch("/api/organization/units", { method: "POST", body: { name: typed } });
    } else if (company.value.name !== typed) {
      await $fetch(`/api/organization/units/${company.value.id}`, { method: "PATCH", body: { name: typed } });
    }

    return true;
  } catch (error) {
    failure.value = failureText(error, t("guide.error.failed"));

    return false;
  }
}

defineExpose({ commit });

onMounted(async () => {
  try {
    company.value = (await $fetch<UnitRow[]>("/api/organization/units")).find((one) => one.parent === null || one.parent === undefined) ?? null;
    name.value = company.value?.name ?? "";
  } catch (error) {
    failure.value = failureText(error, t("guide.error.read_failed"));
  } finally {
    reading.value = false;
  }
});
</script>
