<template>
  <!-- The start guide's connect step (docs/web.md, 「The start guide」): what the road chosen asks — a Claude sign-in, on the
       reader's own PC for a member and on the server for the administrator; a key typed once into the secret store; or a
       local AI's address registered with the agency. No credential is read back: a key goes to the secret store alone. -->
  <div class="flex flex-col gap-4" :data-guide-connect="road.kind">
    <template v-if="road.kind === 'login'">
      <template v-if="done">
        <UAlert color="success" variant="subtle" icon="i-material-symbols-check-circle-outline" :description="$t('guide.status.signed_in')" data-guide-connected />
      </template>
      <template v-else-if="signIn === null">
        <div class="flex justify-end">
          <UButton :label="$t('guide.action.sign_in')" icon="i-material-symbols-login" :loading="busy" data-guide-sign-in @click="void startSignIn()" />
        </div>
      </template>
      <template v-else>
        <p class="break-keep text-sm text-toned">{{ $t("agents.message.sign_in_steps") }}</p>
        <UButton :to="signIn.url" target="_blank" rel="noopener noreferrer" external color="neutral" variant="outline" icon="i-material-symbols-open-in-new" class="self-start" :label="$t('agents.action.open_sign_in')" data-sign-in-open />
        <form class="flex items-end gap-2" @submit.prevent="void finishSignIn()">
          <UFormField :label="$t('agents.label.sign_in_code')" name="code" class="min-w-0 flex-1">
            <UInput v-model="code" class="w-full font-mono" autocomplete="off" spellcheck="false" :placeholder="$t('agents.placeholder.sign_in_code')" data-sign-in-code />
          </UFormField>
          <UButton type="submit" :label="$t('agents.action.sign_in_finish')" :loading="busy" :disabled="busy || code.trim() === ''" data-guide-sign-in-finish />
        </form>
      </template>
    </template>

    <template v-else-if="road.kind === 'key'">
      <UAlert v-if="done" color="success" variant="subtle" icon="i-material-symbols-check-circle-outline" :description="$t('guide.status.key_saved')" data-guide-connected />
      <form v-else class="flex items-end gap-2" @submit.prevent="void saveKey()">
        <UFormField :label="$t('guide.label.key')" name="key" class="min-w-0 flex-1">
          <UInput v-model="key" class="w-full font-mono" type="password" autocomplete="off" spellcheck="false" data-guide-key />
        </UFormField>
        <UButton type="submit" :label="$t('common.action.save')" :loading="busy" :disabled="busy || key.trim() === ''" data-guide-key-save />
      </form>
    </template>

    <template v-else>
      <UAlert v-if="done" color="success" variant="subtle" icon="i-material-symbols-check-circle-outline" :description="$t('guide.status.local_saved', { name: local.name })" data-guide-connected />
      <form v-else class="flex flex-col gap-4" @submit.prevent="void saveLocal()">
        <UFormField :label="$t('guide.label.name')" name="name" :error="fieldError('name')">
          <UInput v-model="local.name" class="w-full font-mono" autocomplete="off" spellcheck="false" placeholder="local-model" data-guide-local-name />
        </UFormField>
        <UFormField :label="$t('guide.label.address')" name="url" :error="fieldError('url')">
          <UInput v-model="local.url" class="w-full font-mono" type="url" autocomplete="off" spellcheck="false" placeholder="http://localhost:8000/v1" data-guide-local-url />
        </UFormField>
        <UFormField :label="$t('guide.label.model')" name="model" :error="fieldError('model')">
          <UInput v-model="local.model" class="w-full font-mono" autocomplete="off" spellcheck="false" data-guide-local-model />
        </UFormField>
        <UFormField :label="$t('guide.label.key')" :hint="$t('common.label.optional')" name="key" :error="fieldError('keyFile')">
          <UInput v-model="local.key" class="w-full font-mono" type="password" autocomplete="off" spellcheck="false" data-guide-local-key />
        </UFormField>
        <div class="flex justify-end">
          <UButton type="submit" :label="$t('common.action.save')" :loading="busy" :disabled="busy || local.name.trim() === '' || local.url.trim() === '' || local.model.trim() === ''" data-guide-local-save />
        </div>
      </form>
    </template>

    <p v-if="failure !== ''" role="alert" class="break-words text-sm text-error" data-guide-failure>{{ failure }}</p>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import { REGISTRY_ROAD } from "#shared/guide";

import type { GuideFlow, GuideRoad } from "#shared/guide";
import type { ClaudeLoginStarted } from "#shared/types";

interface Props {
  flow: GuideFlow;
  road: GuideRoad;
}

const props = defineProps<Props>();
// Whether what the road asks is done; the local AI's registration name goes up with it, for the test to name.
const done = defineModel<boolean>("done", { required: true });
// Whether something typed here would be thrown away by leaving the step.
const dirty = defineModel<boolean>("dirty", { default: false });
const emit = defineEmits<{ registered: [name: string] }>();

const { t } = useI18n();
const busy = ref(false);
const failure = ref("");
const refusedField = ref<string | null>(null);

function fieldError(field: string): string | undefined {
  return refusedField.value === field ? failure.value : undefined;
}

function refused(error: unknown, otherwise: string): void {
  failure.value = failureText(error, t(otherwise));
  refusedField.value = (error as { data?: { data?: { field?: string } } }).data?.data?.field ?? null;
}

// --- A Claude sign-in: the reader's own, run on their own node, or the platform's, run on the server ---

const signIn = ref<ClaudeLoginStarted | null>(null);
const code = ref("");
const platform = computed(() => props.flow === "platform");

async function startSignIn(): Promise<void> {
  busy.value = true;
  failure.value = "";
  try {
    // No name is sent: account names are one namespace across every owner, of which the reader's list shows only
    // their own, so the agency names the new login past them all.
    signIn.value = await $fetch<ClaudeLoginStarted>(platform.value ? "/api/claude-logins" : "/api/supply/signin", { method: "POST", body: {} });
    code.value = "";
  } catch (error) {
    refused(error, "supply.error.signin_failed");
  } finally {
    busy.value = false;
  }
}

async function finishSignIn(): Promise<void> {
  const started = signIn.value;

  if (started === null || code.value.trim() === "") return;
  busy.value = true;
  failure.value = "";
  try {
    const at = platform.value ? `/api/claude-logins/${encodeURIComponent(started.login)}/code` : `/api/supply/signin/${encodeURIComponent(started.login)}/code`;

    await $fetch(at, { method: "POST", body: { code: code.value.trim() } });
    signIn.value = null;
    done.value = true;
  } catch (error) {
    // A code the sign-in did not take ends it; a fresh one starts from the button again.
    signIn.value = null;
    refused(error, "supply.error.signin_failed");
  } finally {
    busy.value = false;
  }
}

// A sign-in left standing as the step is left is given up, as closing the settings' box gives it up.
onBeforeUnmount(() => {
  const started = signIn.value;

  if (started === null) return;

  const at = platform.value ? `/api/claude-logins/${encodeURIComponent(started.login)}` : `/api/supply/signin/${encodeURIComponent(started.login)}`;

  void $fetch(at, { method: "DELETE" }).catch(() => undefined);
});

// --- A key, typed once: the reader's own into their space and added as their supply key, or the platform's into the
// file its provider reads ---

const key = ref("");

async function keepSecret(name: string, value: string): Promise<void> {
  await $fetch("/api/secrets", { method: "POST", body: { name, value, replace: true } });
}

async function saveKey(): Promise<void> {
  const value = key.value.trim();

  if (value === "") return;
  busy.value = true;
  failure.value = "";
  try {
    if (platform.value) {
      await keepSecret(props.road.keyFile ?? `${props.road.road}.key`, value);
    } else {
      const name = `${props.road.road}-key`;

      await keepSecret(name, value);
      await $fetch("/api/supply/personal", { method: "POST", body: { road: props.road.road, secret: name } });
    }
    key.value = "";
    done.value = true;
  } catch (error) {
    refused(error, "supply.error.key_failed");
  } finally {
    busy.value = false;
  }
}

// --- A local AI: its key into the platform's space, then its registration and its one address ---

const local = reactive({ name: "", url: "", model: "", key: "" });

watch([code, key, () => ({ ...local })], () => {
  dirty.value = !done.value && (code.value.trim() !== "" || key.value.trim() !== "" || Object.values(local).some((one) => one.trim() !== ""));
});
watch(done, (now) => {
  if (now) dirty.value = false;
});

async function saveLocal(): Promise<void> {
  const name = local.name.trim();

  busy.value = true;
  failure.value = "";
  refusedField.value = null;
  try {
    const keyFile = local.key.trim() === "" ? null : `local-ai-${name}`;

    if (keyFile !== null) await keepSecret(keyFile, local.key.trim());
    await $fetch("/api/me/guide/local-ai", { method: "POST", body: { name, url: local.url.trim(), model: local.model.trim(), keyFile } });
    local.key = "";
    done.value = true;
    emit("registered", `${REGISTRY_ROAD}::${name}`);
  } catch (error) {
    refused(error, "guide.error.failed");
  } finally {
    busy.value = false;
  }
}
</script>
