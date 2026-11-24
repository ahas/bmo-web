<template>
  <!-- The second factor's enrolment (docs/web.md, 「Settings」, 계정's 2단계 인증): the QR code the account service drew
       with its key written out under it, then the code that confirms it, then the recovery codes, shown once. -->
  <SettingsDialog v-model:open="open" :title="$t('security.label.second_factor')" :dirty="codes === null && code !== ''">
    <UAlert v-if="props.required && codes === null" color="warning" variant="subtle" :description="$t('security.message.enrol_required')" :ui="{ description: 'whitespace-pre-line' }" />

    <template v-if="codes !== null">
      <RecoveryCodes :codes="codes" />
    </template>

    <template v-else-if="enrolment !== null">
      <p class="whitespace-pre-line text-sm text-muted">{{ $t("security.message.enrol_scan") }}</p>
      <img class="mx-auto size-60 rounded-lg bg-white" :src="qrSource" :alt="$t('security.label.second_factor')" data-enrol-qr />
      <div class="flex flex-col gap-1">
        <span class="text-sm text-muted">{{ $t("security.label.secret_key") }}</span>
        <code class="break-all font-mono text-sm text-highlighted" data-enrol-secret>{{ spacedSecret }}</code>
      </div>
      <UForm id="enrol-form" :state="{ code }" class="flex flex-col gap-4" @submit="void confirm()">
        <UFormField :label="$t('security.label.code')" :description="$t('security.message.enrol_code')" name="code" required>
          <UInput v-model="code" class="w-full" inputmode="numeric" autocomplete="one-time-code" maxlength="6" data-enrol-code />
        </UFormField>
      </UForm>
    </template>

    <SkeletonStatus v-else-if="failure === ''" :label="$t('security.message.loading')">
      <SkeletonBar class="mx-auto block size-60 rounded-lg" />
    </SkeletonStatus>

    <p v-if="failure !== ''" role="alert" class="whitespace-pre-line text-sm text-error">{{ failure }}</p>

    <template #footer="{ close }">
      <template v-if="codes !== null">
        <UButton :label="$t('security.action.done')" data-enrol-done @click="finish()" />
      </template>
      <template v-else>
        <UButton color="neutral" variant="ghost" :label="$t('security.action.cancel')" @click="close()" />
        <UButton type="submit" form="enrol-form" :label="$t('security.action.confirm')" :loading="busy" :disabled="busy || code.trim().length !== 6" data-enrol-confirm />
      </template>
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import type { Enrolment } from "@web/server-client";

interface Props {
  // The reader's organisation asks for it, which the dialog says.
  required?: boolean;
}

const props = withDefaults(defineProps<Props>(), { required: false });
const open = defineModel<boolean>("open", { default: false });
const emit = defineEmits<{ done: [] }>();

const { t } = useI18n();
const enrolment = ref<Enrolment | null>(null);
const code = ref("");
const codes = ref<string[] | null>(null);
const failure = ref("");
const busy = ref(false);

// The QR code is the service's own SVG, shown as a picture so nothing of it runs on the page.
const qrSource = computed(() => (enrolment.value === null ? "" : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(enrolment.value.qr)}`));
// The key in groups of four, as an authenticator asks it typed.
const spacedSecret = computed(() => enrolment.value?.secret.replace(/(.{4})/g, "$1 ").trim() ?? "");

watch(open, (opened) => {
  if (!opened) return;

  enrolment.value = null;
  code.value = "";
  codes.value = null;
  failure.value = "";
  void start();
});

async function start(): Promise<void> {
  try {
    enrolment.value = await $fetch<Enrolment>("/api/account/second-factor", { method: "POST" });
  } catch (error) {
    failure.value = failureText(error, t("security.error.failed"));
  }
}

async function confirm(): Promise<void> {
  busy.value = true;
  failure.value = "";

  try {
    codes.value = (await $fetch<{ codes: string[] }>("/api/account/second-factor/confirm", { method: "POST", body: { code: code.value } })).codes;
    emit("done");
  } catch (error) {
    code.value = "";
    failure.value = failureText(error, t("security.error.wrong_code"));
  } finally {
    busy.value = false;
  }
}

function finish(): void {
  open.value = false;
}
</script>
