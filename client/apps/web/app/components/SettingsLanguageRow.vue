<template>
  <!-- The account's language (docs/web.md, 「Settings」, the account section): one row of the account's group, each
       language named in its own script so a reader finds theirs whatever the console speaks now. A choice is taken at
       once and kept as it is chosen; a refusal puts back what was read and says why in place of the row's line. -->
  <SettingsRow :label="$t('app.label.language')" data-language-row>
    <template #description>
      <span v-if="failure !== ''" role="alert" class="text-sm text-error">{{ failure }}</span>
      <span v-else class="whitespace-pre-line text-sm text-muted">{{ $t("app.label.language_description") }}</span>
    </template>
    <ChoiceSelect v-model="spoken" :items="items" value-key="value" class="w-36" :aria-label="$t('app.label.language')" data-language-choice />
  </SettingsRow>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { CONSOLE_LANGUAGES, ownName } from "#shared/languages";

import { chooseLanguage, useLanguage } from "~/domain/language";

const { t } = useI18n();
const language = useLanguage();
const failure = ref("");
const items = CONSOLE_LANGUAGES.map((one) => ({ label: ownName(one), value: one }));
const spoken = computed({
  get: () => language.value,
  set: (chosen: (typeof CONSOLE_LANGUAGES)[number]) => {
    failure.value = "";
    chooseLanguage(language, chosen).catch((error: unknown) => {
      failure.value = failureText(error, t("account.error.language_failed"));
    });
  }
});
</script>
