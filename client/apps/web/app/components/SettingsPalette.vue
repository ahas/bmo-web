<template>
  <!-- The chat room section (docs/web.md, 「Settings」): the account's palette, its preview and the way
       back. A choice changes the bubbles at once and is kept as it is made. -->
  <div class="flex flex-col gap-6">
    <SettingsGroup>
      <SettingsRow :label="$t('account.label.palette')" :description="$t('account.label.palette_description')">
        <USelect
          v-model="choice"
          :items="items"
          value-key="value"
          class="w-36"
          :ui="{ base: 'ps-12' }"
          :content="preview.list"
          :aria-label="$t('account.label.palette')"
          @update:open="preview.onOpen"
        >
          <template #leading>
            <PaletteSwatch :palette="chosen" :scheme="pageScheme" />
          </template>

          <template #item-leading="{ item }">
            <PaletteSwatch :palette="item.palette" :scheme="pageScheme" :[PREVIEW_ITEM]="item.value" />
          </template>
        </USelect>
      </SettingsRow>
    </SettingsGroup>

    <SettingsGroup :title="$t('account.label.preview')">
      <template #aside>
        <SettingsSegment v-model="previewScheme" :items="schemeItems" :label="$t('account.label.preview')" />
      </template>

      <PalettePreview class="my-3" :palette="paletteOf(preview.shown.value)" :scheme="previewScheme" :reader-name="(user?.fullName || user?.name) ?? ''" />
    </SettingsGroup>

    <UAlert v-if="failure" color="error" variant="subtle" :description="failure" />

    <div class="flex justify-end">
      <UButton
        color="neutral"
        variant="ghost"
        icon="i-material-symbols-restart-alt"
        :label="$t('account.action.reset_palette')"
        :disabled="chosen.id === DEFAULT_PALETTE.id"
        @click="choice = DEFAULT_PALETTE.id"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { DEFAULT_PALETTE, PALETTES, paletteOf } from "bmo-ui/shared/palettes";

import { failureText } from "bmo-ui/app/domain/errors";
import { PREVIEW_ITEM, useListPreview } from "bmo-ui/app/domain/list-preview";
import { choosePalette, usePalette } from "~/domain/palette";
import { usePageScheme, usePreviewScheme } from "bmo-ui/app/domain/scheme";

const { t } = useI18n();
const { user } = useUserSession();

// The account's palette, taken at once and kept as it is chosen; a refusal puts back what was kept
// and says why under the preview.
const palette = usePalette();
const chosen = computed(() => paletteOf(palette.value));
const failure = ref("");
const items = computed(() => PALETTES.map((one) => ({ label: t(one.label), value: one.id, palette: one })));
const choice = computed({
  get: () => chosen.value.id,
  set: (id: string) => {
    failure.value = "";
    choosePalette(palette, id).catch((error: unknown) => {
      failure.value = failureText(error, t("account.error.palette_failed"));
    });
  }
});

const preview = useListPreview(toRef(() => chosen.value.id));
const pageScheme = usePageScheme();
const previewScheme = usePreviewScheme(pageScheme);
const schemeItems = computed(() => [
  { label: t("app.label.mode_light"), value: "light" },
  { label: t("app.label.mode_dark"), value: "dark" }
]);
</script>
