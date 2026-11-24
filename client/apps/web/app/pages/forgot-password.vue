<template>
  <!-- A forgotten password asked by a login or an email (docs/web.md, 「Pages with no sign-in」): whatever was asked, the
       card then says one line, so it tells nobody whether an account stands. -->
  <SignInCard>
    <UForm v-if="!sent" id="forgot-form" :state="form" @submit="submit">
      <UFormField :label="$t('security.label.who')" name="who" required>
        <UInput v-model="form.who" class="w-full" autocomplete="username" data-forgot-who />
      </UFormField>
    </UForm>
    <p v-else class="whitespace-pre-line text-sm text-default" data-forgot-sent>{{ $t("security.message.link_sent") }}</p>
    <UAlert v-if="failure" color="error" variant="subtle" :description="failure" :ui="{ description: 'whitespace-pre-line' }" />

    <template #actions>
      <UButton v-if="!sent" type="submit" form="forgot-form" :label="$t('security.action.send_link')" :loading="pending" :disabled="pending || form.who.trim() === ''" data-forgot-send />
    </template>
  </SignInCard>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

definePageMeta({ layout: false });

const { t } = useI18n();
const form = reactive({ who: "" });
const sent = ref(false);
const pending = ref(false);
const failure = ref<string | null>(null);

async function submit(): Promise<void> {
  pending.value = true;
  failure.value = null;

  try {
    await $fetch("/api/auth/password-resets", { method: "POST", body: { who: form.who } });
    sent.value = true;
  } catch (error) {
    failure.value = failureText(error, t("security.error.failed"));
  } finally {
    pending.value = false;
  }
}
</script>
