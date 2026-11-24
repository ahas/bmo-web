<template>
  <!-- An email's verification link used as the page opens (docs/web.md, 「Pages with no sign-in」). -->
  <SignInCard>
    <SkeletonStatus v-if="address === null && failure === ''" :label="$t('security.message.verifying')">
      <SkeletonBar class="block h-4 w-48" />
    </SkeletonStatus>
    <p v-else-if="address !== null" class="break-all text-sm text-default" data-verified>{{ $t("security.message.email_verified", { address }) }}</p>
    <p v-else class="text-sm text-default" data-verify-failed>{{ failure }}</p>
  </SignInCard>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

definePageMeta({ layout: false });

const { t } = useI18n();
const route = useRoute();
const address = ref<string | null>(null);
const failure = ref("");

onMounted(async () => {
  const token = typeof route.query.token === "string" ? route.query.token : "";

  try {
    address.value = (await $fetch<{ address: string }>(`/api/auth/email-verifications/${encodeURIComponent(token)}`, { method: "POST" })).address;
  } catch (error) {
    failure.value = (error as { statusCode?: number }).statusCode === 404 ? t("security.message.link_gone") : failureText(error, t("security.error.failed"));
  }
});
</script>
