<template>
  <!-- The system mail tab at the platform node (docs/web.md, 「System and organisation」, the mail tab): the system mail the platform sends its own mail
       through — one of bmo-mail's outgoing servers kept for the platform, the sender and the name of the secret it signs
       in with, saved with its one save — and a test mail sent through it once it is set up. -->
  <div class="flex flex-col gap-4" data-admin-mail>
    <FailedRead v-if="view === null && failure !== ''" class="py-3" :message="failure" :reading="reading" @retry="void read()" />

    <SettingsGroup v-else :title="$t('security.label.system_mail')">
      <template #aside>
        <UBadge v-if="view !== null" :color="view.configured ? 'success' : 'neutral'" variant="subtle" size="sm" :label="view.configured ? $t('security.label.mail_on') : $t('security.label.mail_off')" data-mail-state />
      </template>

      <ContentSkeleton v-if="view === null" :rows="4" list-class="flex flex-col divide-y divide-default" :label="$t('security.message.loading')">
        <div class="flex items-center gap-4 py-3">
          <SkeletonLine width="w-1/3" />
          <SkeletonBar class="ms-auto h-8 w-40 shrink-0 rounded-md" />
        </div>
      </ContentSkeleton>

      <UForm v-else id="mail-form" :state="form" class="flex flex-col gap-4 py-3" @submit="void save()">
        <p v-if="!view.mailService" class="text-sm text-muted" data-mail-no-service>{{ $t("security.message.mail_no_service") }}</p>
        <UFormField :label="$t('security.label.mail_server')" name="server">
          <ChoiceSelect v-model="form.server" :items="serverItems" value-key="value" class="w-full" data-mail-server />
        </UFormField>
        <UFormField :label="$t('security.label.from')" name="from">
          <UInput v-model="form.from" class="w-full" type="email" autocomplete="off" data-mail-from />
        </UFormField>
        <UFormField :label="$t('security.label.from_name')" name="fromName">
          <UInput v-model="form.fromName" class="w-full" autocomplete="off" />
        </UFormField>
        <UFormField :label="$t('security.label.login_secret')" name="secret" :error="secretMissing ? $t('security.message.secret_missing') : undefined">
          <ChoiceSelect v-model="form.secret" :items="secretItems" value-key="value" class="w-full" data-mail-secret />
        </UFormField>
        <p v-if="saveFailure !== ''" role="alert" class="text-sm text-error">{{ saveFailure }}</p>
        <div class="flex justify-end">
          <UButton type="submit" form="mail-form" :label="$t('security.action.save')" :loading="saving" :disabled="saving || !changed" data-mail-save />
        </div>
      </UForm>
    </SettingsGroup>

    <SettingsGroup v-if="view !== null && view.configured" :title="$t('security.label.test_mail')">
      <UForm id="mail-test-form" :state="test" class="flex flex-wrap items-end gap-2 py-3" @submit="void sendTest()">
        <UFormField :label="$t('security.label.test_to')" name="to" class="min-w-0 grow basis-48">
          <UInput v-model="test.to" class="w-full" type="email" data-mail-test-to />
        </UFormField>
        <UButton type="submit" form="mail-test-form" color="neutral" variant="outline" :label="$t('security.action.send')" :loading="testing" :disabled="testing || test.to.trim() === ''" data-mail-test-send />
      </UForm>
      <p v-if="testLine !== ''" :role="testFailed ? 'alert' : undefined" class="break-words pb-3 text-sm" :class="testFailed ? 'text-error' : 'text-muted'" data-mail-test-line>{{ testLine }}</p>
    </SettingsGroup>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import type { SystemMail } from "@web/server-client";
import type { UserProfile } from "#shared/types";

const { t } = useI18n();
const { user } = useUserSession();

// The choice's value for none, since a select's item cannot carry null.
const NONE = "__none__";

const view = ref<SystemMail | null>(null);
const failure = ref("");
const reading = ref(false);
const secrets = ref<{ name: string; kind?: string | null }[]>([]);
const form = reactive({ server: NONE, from: "", fromName: "", secret: NONE });
const saving = ref(false);
const saveFailure = ref("");
const test = reactive({ to: "" });
const testing = ref(false);
const testLine = ref("");
const testFailed = ref(false);

const serverItems = computed(() => [
  ...(view.value?.servers ?? []).map((one) => ({ label: `${one.name} · ${one.host}`, value: one.id })),
  ...(view.value?.server && !(view.value.servers ?? []).some((one) => one.id === view.value?.server) ? [{ label: view.value.server, value: view.value.server }] : []),
  { label: t("security.label.none"), value: NONE }
]);
// The reader's own secrets of the kind a mail server's sign-in reads, then none; a name held that is none of them first.
const secretItems = computed(() => {
  const own = secrets.value.filter((one) => one.kind === "account-login").map((one) => ({ label: one.name, value: one.name }));
  const held = view.value?.secret ?? null;

  return [...(held !== null && !own.some((one) => one.value === held) ? [{ label: held, value: held }] : []), ...own, { label: t("security.label.none"), value: NONE }];
});
const secretMissing = computed(() => view.value !== null && !view.value.secretStands && form.secret === (view.value.secret ?? NONE));

const changed = computed(() => {
  const held = view.value;

  if (held === null) return false;

  return form.server !== (held.server ?? NONE) || form.from !== held.from || form.fromName !== held.fromName || form.secret !== (held.secret ?? NONE);
});

function take(read: SystemMail): void {
  view.value = read;
  Object.assign(form, { server: read.server ?? NONE, from: read.from, fromName: read.fromName, secret: read.secret ?? NONE });
}

async function read(): Promise<void> {
  reading.value = true;

  try {
    const [mail, own] = await Promise.all([$fetch<SystemMail>("/api/admin/mail"), $fetch<{ secrets: { name: string; kind?: string | null }[] }>("/api/secrets").catch(() => ({ secrets: [] }))]);

    secrets.value = own.secrets;
    take(mail);
    failure.value = "";
  } catch (error) {
    failure.value = failureText(error, t("security.error.read_failed"));
  } finally {
    reading.value = false;
  }

  // The test goes to the reader's own email where they keep one.
  const id = user.value?.id;

  if (test.to === "" && id !== undefined) {
    test.to = (await $fetch<UserProfile>(`/api/users/${id}/profile`).catch(() => null))?.email ?? "";
  }
}

async function save(): Promise<void> {
  saving.value = true;
  saveFailure.value = "";

  try {
    take(
      await $fetch<SystemMail>("/api/admin/mail", {
        method: "PUT",
        body: { server: form.server === NONE ? null : form.server, from: form.from, fromName: form.fromName, secret: form.secret === NONE ? null : form.secret }
      })
    );
  } catch (error) {
    saveFailure.value = failureText(error, t("security.error.failed"));
  } finally {
    saving.value = false;
  }
}

async function sendTest(): Promise<void> {
  testing.value = true;
  testLine.value = "";

  try {
    await $fetch("/api/admin/mail/test", { method: "POST", body: { to: test.to } });
    testFailed.value = false;
    testLine.value = t("security.message.test_sent");
  } catch (error) {
    testFailed.value = true;
    testLine.value = failureText(error, t("security.error.failed"));
  } finally {
    testing.value = false;
  }
}

onMounted(() => void read());
</script>
