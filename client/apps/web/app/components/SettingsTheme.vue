<template>
  <!-- The theme section (docs/web.md, 「Settings」): the screen mode, whether a text in another language opens
       translated, the account's theme, its preview and the way back. A choice takes effect at once and is kept as it is made. -->
  <div class="flex flex-col gap-6">
    <SettingsGroup>
      <SettingsRow :label="$t('app.label.color_mode')">
        <SettingsSegment v-model="mode" :items="modeItems" :label="$t('app.label.color_mode')" />
      </SettingsRow>

      <SettingsRow :label="$t('app.label.auto_translate')" :description="$t('app.label.auto_translate_description')">
        <USwitch v-model="autoTranslate" :aria-label="$t('app.label.auto_translate')" data-auto-translate />
      </SettingsRow>

      <SettingsRow :label="$t('account.label.theme')" :description="$t('account.label.theme_description')">
        <ChoiceSelect
          v-model="choice"
          :items="items"
          value-key="value"
          class="w-36"
          :ui="{ base: 'ps-12' }"
          :aria-label="$t('account.label.theme')"
          @highlight="preview.onHighlight"
          @update:open="preview.onOpen"
        >
          <template #leading>
            <ThemeSwatch :theme="chosen" :scheme="pageScheme" />
          </template>

          <template #item-leading="{ item }">
            <ThemeSwatch :theme="item.theme" :scheme="pageScheme" :[PREVIEW_ITEM]="item.value" />
          </template>
        </ChoiceSelect>
      </SettingsRow>
    </SettingsGroup>

    <SettingsGroup :title="$t('account.label.preview')">
      <template #aside>
        <SettingsSegment v-model="previewScheme" :items="schemeItems" :label="$t('account.label.preview')" />
      </template>

      <ThemePreview class="my-3" :theme="themeOf(preview.shown.value)" :scheme="previewScheme" />
    </SettingsGroup>

    <UAlert v-if="failure" color="error" variant="subtle" :description="failure" />

    <div class="flex justify-end">
      <UButton
        color="neutral"
        variant="ghost"
        icon="i-material-symbols-restart-alt"
        :label="$t('account.action.reset_theme')"
        :disabled="chosen.id === DEFAULT_THEME.id"
        @click="choice = DEFAULT_THEME.id"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { DEFAULT_THEME, THEMES, themeOf } from "bmo-ui/shared/themes";

import { failureText } from "bmo-ui/app/domain/errors";
import { PREVIEW_ITEM, useListPreview } from "bmo-ui/app/domain/list-preview";
import { usePageScheme, usePreviewScheme } from "bmo-ui/app/domain/scheme";
import { chooseTheme, useTheme } from "~/domain/theme";
import { useAutoTranslate } from "~/domain/text-reading";

const { t } = useI18n();
const colorMode = useColorMode();
// Whether a text in another language opens already read in the reader's own, kept by this browser.
const autoTranslate = useAutoTranslate();

const mode = computed({
  get: () => colorMode.preference,
  set: (preference: string) => {
    colorMode.preference = preference;
  }
});
const modeItems = computed(() => [
  { label: t("app.label.mode_system"), value: "system" },
  { label: t("app.label.mode_light"), value: "light" },
  { label: t("app.label.mode_dark"), value: "dark" }
]);

// The account's theme, taken at once and kept as it is chosen; a refusal puts back what was kept
// and says why under the preview.
const theme = useTheme();
const chosen = computed(() => themeOf(theme.value));
const failure = ref("");
const items = computed(() => THEMES.map((one) => ({ label: t(one.label), value: one.id, theme: one })));
const choice = computed({
  get: () => chosen.value.id,
  set: (id: string) => {
    failure.value = "";
    chooseTheme(theme, id).catch((error: unknown) => {
      failure.value = failureText(error, t("account.error.theme_failed"));
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
