<template>
  <!-- The server form of the mail servers tab (docs/web.md, 「System and organisation」, the mail servers tab): a new server of a
       node or a kept one, its protocol fixed once it is kept, saved through bmo-mail, which judges it; the connection test at its
       foot asks bmo-mail to reach the server as the form holds it, and a refusal is said under the form. -->
  <SettingsDialog v-model:open="open" :title="props.server === null ? $t('org_mail.action.add') : $t('org_mail.title.edit')" :dirty="changes">
    <UForm id="mail-server-form" :state="draft" class="flex flex-col gap-4" @submit="save">
      <UFormField :label="$t('org_mail.label.protocol')" name="protocol" required>
        <ChoiceSelect :model-value="draft.protocol" :items="protocolItems" value-key="value" class="w-full" :disabled="props.server !== null" data-mail-protocol @update:model-value="chooseProtocol" />
      </UFormField>
      <UFormField :label="$t('common.label.name')" name="name" :hint="$t('common.label.optional')">
        <UInput v-model="draft.name" :placeholder="draft.host.trim() || undefined" class="w-full" data-mail-input="name" />
      </UFormField>
      <UFormField :label="$t('org_mail.label.host')" name="host" required>
        <UInput v-model="draft.host" autocomplete="off" spellcheck="false" class="w-full" data-mail-input="host" />
      </UFormField>
      <UFormField :label="$t('org_mail.label.port')" name="port">
        <UInput v-model="draft.port" type="number" inputmode="numeric" :placeholder="$t('org_mail.placeholder.port', { port: usual })" class="w-full" data-mail-input="port" />
      </UFormField>
      <UFormField :label="$t('org_mail.label.security')" name="security" required>
        <ChoiceSelect v-model="draft.security" :items="securityItems" value-key="value" class="w-full" data-mail-security />
      </UFormField>
      <UFormField v-if="draft.security !== 'none'" :label="$t('org_mail.label.tls_name')" name="tlsName" :hint="$t('common.label.optional')">
        <UInput v-model="draft.tlsName" autocomplete="off" spellcheck="false" :placeholder="draft.host.trim() || undefined" class="w-full" data-mail-input="tls-name" />
      </UFormField>
      <UFormField v-if="draft.protocol === 'smtp'" :label="$t('org_mail.label.auth')" name="auth" required>
        <ChoiceSelect v-model="draft.auth" :items="authItems" value-key="value" class="w-full" data-mail-auth />
      </UFormField>
      <p v-if="tested !== null" :class="['text-sm', tested ? 'text-success' : 'text-error']" role="status" data-mail-tested>
        {{ tested ? $t("org_mail.label.test_reached") : $t("org_mail.label.test_unreached") }}
      </p>
      <UAlert v-if="failure !== ''" color="error" variant="subtle" :description="failure" class="whitespace-pre-line" data-mail-refused />
    </UForm>

    <template #footer="{ close }">
      <UButton color="neutral" variant="outline" :label="$t('org_mail.action.test')" :loading="testing" :disabled="testing || draft.host.trim() === ''" data-mail-test @click="test" />
      <UButton color="neutral" variant="ghost" :label="$t('common.action.cancel')" @click="close()" />
      <UButton type="submit" form="mail-server-form" :label="$t('common.action.save')" :loading="busy" :disabled="busy || !changes.dirty.value || draft.host.trim() === ''" data-mail-save />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { useOpenedWith } from "bmo-ui/app/domain/form-save";

import { MAIL_PROTOCOLS, protocolWord, securitiesOf, securityWord, usualPort } from "~/domain/mail-servers";

import type { MailAuth, MailLink, MailProtocol, MailSecurity, MailServerFields, MailServerTestView, MailServerView } from "#shared/mail-servers";

interface Props {
  // The node the server is kept at.
  link: MailLink;
  // The server changed, or null for a new one.
  server: MailServerView | null;
}

const props = defineProps<Props>();
const emit = defineEmits<{ saved: [] }>();
const open = defineModel<boolean>("open", { default: false });

const { t } = useI18n();

interface Draft {
  protocol: MailProtocol;
  name: string;
  host: string;
  port: string;
  security: MailSecurity;
  tlsName: string;
  auth: MailAuth;
}

const draft = reactive<Draft>(blank());
const changes = useOpenedWith(() => ({ ...draft }), { open });
const busy = ref(false);
const testing = ref(false);
const failure = ref("");
// What the last connection test came to, none until one is asked or once the form changes after it.
const tested = ref<boolean | null>(null);

const protocolItems = computed(() => MAIL_PROTOCOLS.map((value) => ({ value, label: protocolWord(t, value) })));
const securityItems = computed(() => securitiesOf(draft.protocol).map((value) => ({ value, label: securityWord(t, value) })));
const authItems = computed(() => [
  { value: "password", label: t("org_mail.label.auth_password") },
  { value: "none", label: t("org_mail.label.auth_none") }
]);
const usual = computed(() => usualPort(draft.protocol, draft.security));

function blank(): Draft {
  return { protocol: "imap", name: "", host: "", port: "", security: securitiesOf("imap")[0]!, tlsName: "", auth: "password" };
}

function filled(server: MailServerView): Draft {
  const { protocol, name, host, port, security, tlsName, auth } = server;

  return { protocol, name, host, port: String(port), security, tlsName: tlsName ?? "", auth };
}

watch(open, (now) => {
  if (!now) return;

  Object.assign(draft, props.server === null ? blank() : filled(props.server));
  failure.value = "";
  tested.value = null;
});

// A protocol chosen for a new server starts on its own usual security, as bmo-mail would keep it with none named.
function chooseProtocol(chosen: unknown): void {
  const protocol = MAIL_PROTOCOLS.find((one) => one === chosen);

  if (protocol === undefined || protocol === draft.protocol) return;

  draft.protocol = protocol;
  draft.security = securitiesOf(protocol)[0]!;
}

// A test says what the form held when it was asked, so any change takes its word away.
watch(
  () => ({ ...draft }),
  () => {
    tested.value = null;
  }
);

// The fields the form holds as bmo-mail takes them: the host's name where none is given, the usual port where none
// is, and no certificate name where the server is not encrypted.
function fields(): MailServerFields {
  const host = draft.host.trim();
  const port = Number(draft.port);

  return {
    name: draft.name.trim() || host,
    host,
    port: draft.port.trim() !== "" && Number.isInteger(port) ? port : usual.value,
    security: draft.security,
    tlsName: draft.security === "none" ? "" : draft.tlsName.trim(),
    auth: draft.protocol === "smtp" ? draft.auth : "password"
  };
}

async function test(): Promise<void> {
  testing.value = true;
  failure.value = "";
  try {
    const answer = await $fetch<MailServerTestView>("/api/organization/mail-server-tests", { method: "POST", body: { protocol: draft.protocol, ...fields() } });

    tested.value = answer.reached;
  } catch (error) {
    failure.value = failureText(error, t("org_mail.error.test_failed"));
  } finally {
    testing.value = false;
  }
}

async function save(): Promise<void> {
  busy.value = true;
  failure.value = "";
  try {
    if (props.server === null) {
      await $fetch("/api/organization/mail-servers", { method: "POST", body: { link: props.link, protocol: draft.protocol, ...fields() } });
    } else {
      await $fetch("/api/organization/mail-servers", { method: "PATCH", body: { id: props.server.id, ...fields() } });
    }
    open.value = false;
    emit("saved");
  } catch (error) {
    failure.value = failureText(error, t("org_mail.error.failed"));
  } finally {
    busy.value = false;
  }
}
</script>
