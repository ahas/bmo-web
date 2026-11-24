<template>
  <!-- A new password set by a reset link (docs/web.md, 「Pages with no sign-in」): the link read first, then the new
       password twice; a link used or past its time leads to asking a new one. -->
  <SignInCard>
    <SkeletonStatus v-if="login === null && failure === ''" :label="$t('security.message.reading_link')">
      <SkeletonBar class="block h-4 w-48" />
    </SkeletonStatus>

    <template v-else-if="gone">
      <p class="text-sm text-default" data-reset-gone>{{ $t("security.message.link_gone") }}</p>
    </template>

    <p v-else-if="done" class="text-sm text-default" data-reset-done>{{ $t("security.message.password_changed") }}</p>

    <UForm v-else-if="login !== null" id="reset-form" :state="form" class="flex flex-col gap-4" @submit="submit">
      <p class="text-sm text-muted">{{ $t("security.message.reset_for", { login }) }}</p>
      <UFormField :label="$t('security.label.new_password')" name="password" required>
        <UInput v-model="form.password" class="w-full" type="password" autocomplete="new-password" data-reset-password />
      </UFormField>
      <UFormField :label="$t('security.label.new_password_again')" name="again" required>
        <UInput v-model="form.again" class="w-full" type="password" autocomplete="new-password" data-reset-again />
      </UFormField>
    </UForm>

    <UAlert v-if="failure !== ''" color="error" variant="subtle" :description="failure" />

    <template #actions>
      <UButton v-if="gone" to="/forgot-password" :label="$t('security.action.ask_again')" data-reset-ask-again />
      <UButton
        v-else-if="!done && login !== null"
        type="submit"
        form="reset-form"
        :label="$t('security.action.change_password')"
        :loading="pending"
        :disabled="pending || form.password === '' || form.again === ''"
        data-reset-submit
      />
    </template>
  </SignInCard>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

definePageMeta({ layout: false });

const { t } = useI18n();
const route = useRoute();
const token = computed(() => (typeof route.query.token === "string" ? route.query.token : ""));
const login = ref<string | null>(null);
const gone = ref(false);
const done = ref(false);
const pending = ref(false);
const failure = ref("");
const form = reactive({ password: "", again: "" });

async function read(): Promise<void> {
  try {
    login.value = (await $fetch<{ login: string }>(`/api/auth/password-resets/${encodeURIComponent(token.value)}`)).login;
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 404 || token.value === "") gone.value = true;
    else failure.value = failureText(error, t("security.error.failed"));
  }
}

async function submit(): Promise<void> {
  failure.value = "";

  if (form.password.length < 8) {
    failure.value = t("security.error.weak_password");

    return;
  }

  if (form.password !== form.again) {
    failure.value = t("security.error.mismatch");

    return;
  }

  pending.value = true;

  try {
    await $fetch(`/api/auth/password-resets/${encodeURIComponent(token.value)}`, { method: "POST", body: { password: form.password } });
    done.value = true;
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 404) gone.value = true;
    else failure.value = failureText(error, t("security.error.failed"));
  } finally {
    pending.value = false;
  }
}

onMounted(() => void read());
</script>
