<template>
  <!-- A personal app's share (docs/web.md, 「Settings」, the personal apps section): whom it is shared with in the
       reader's company — their team, the heads on their line, the whole company — each open as far as their
       organisation lets them, the team and the heads chosen as it opens. The share at the foot shares it. -->
  <SettingsDialog v-model:open="open" :title="$t('app_catalogue.title.share')" :description="props.title" :dirty="dirty">
    <div class="flex flex-col gap-4" data-catalogue-share>
      <ContentSkeleton v-if="ceiling === null && failure === ''" :rows="3" listClass="flex flex-col gap-3" :label="$t('app_catalogue.status.loading')">
        <SkeletonLine width="w-1/3" />
      </ContentSkeleton>

      <FailedRead v-else-if="ceiling === null" :message="failure" :reading="reading" @retry="void read()" />

      <div v-else role="group" :aria-label="$t('app_catalogue.label.targets')" class="flex flex-col gap-3">
        <UCheckbox
          v-for="scope in SHARE_SCOPES"
          :key="scope"
          :model-value="chosen.includes(scope)"
          :label="$t(FILTER_WORDS[scope])"
          :disabled="!ceiling.includes(scope) || busy"
          :data-catalogue-share-scope="scope"
          @update:model-value="(on: boolean | 'indeterminate') => choose(scope, on === true)"
        />
      </div>

      <p v-if="refusal !== ''" role="alert" class="text-sm text-error" data-catalogue-share-refusal>{{ refusal }}</p>
    </div>

    <template #footer="{ close }">
      <UButton color="neutral" variant="ghost" :label="$t('common.action.cancel')" :disabled="busy" @click="close" />
      <UButton :label="$t('app_catalogue.action.share')" :loading="busy" :disabled="ceiling === null || chosen.length === 0" data-catalogue-share-confirm @click="void share()" />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import { FILTER_WORDS } from "~/domain/app-catalogue";

import { SHARE_SCOPES } from "#shared/app-catalogue";

import type { Catalogue, CatalogueApp, ShareScope } from "#shared/app-catalogue";

interface Props {
  // The personal app's name, and its title as the section shows it.
  name: string;
  title: string;
}

const props = defineProps<Props>();
const open = defineModel<boolean>("open", { default: false });
const emit = defineEmits<{ shared: [app: CatalogueApp] }>();
const { t } = useI18n();

const DEFAULT: readonly ShareScope[] = ["team", "heads"];

const ceiling = ref<ShareScope[] | null>(null);
const failure = ref("");
const reading = ref(false);
const chosen = ref<ShareScope[]>([...DEFAULT]);
const busy = ref(false);
const refusal = ref("");

const dirty = computed(() => chosen.value.length !== DEFAULT.length || DEFAULT.some((scope) => !chosen.value.includes(scope)));

// Whom the reader's organisation lets them share with, read from their catalogue.
async function read(): Promise<void> {
  reading.value = true;
  failure.value = "";

  try {
    const read = await $fetch<Catalogue>("/api/account/app-catalogue");

    ceiling.value = read.ceiling;
    chosen.value = DEFAULT.filter((scope) => read.ceiling.includes(scope));
  } catch (error) {
    failure.value = failureText(error, t("app_catalogue.error.read_failed"));
  } finally {
    reading.value = false;
  }
}

watch(open, (now) => void (now ? read() : undefined), { immediate: true });

function choose(scope: ShareScope, on: boolean): void {
  chosen.value = on ? [...new Set([...chosen.value, scope])] : chosen.value.filter((one) => one !== scope);
}

async function share(): Promise<void> {
  busy.value = true;
  refusal.value = "";

  try {
    const targets = chosen.value.map((scope) => ({ [scope]: true }));
    const shared = await $fetch<CatalogueApp>("/api/account/app-catalogue", { method: "POST", body: { name: props.name, targets } });

    emit("shared", shared);
    chosen.value = [...DEFAULT];
    open.value = false;
  } catch (error) {
    refusal.value = failureText(error, t("app_catalogue.error.share_failed"));
  } finally {
    busy.value = false;
  }
}
</script>
