<template>
  <!-- The reader's own supply (docs/web.md, 「Organisation」, the supply tab with the reader's own node chosen): their
       own Claude logins, gateway keys and local AIs, each with its switch and what it can do now, then the
       order a run of theirs falls through every source, the organisation's own among them, this month's spend and what
       their supply has left. No credential and no secret value stands on this screen: what a
       row says of a key is its name. -->
  <div class="flex flex-col gap-6">
    <p class="text-sm text-muted">{{ $t("supply.label.note") }}</p>

    <div v-if="me === null && failure === ''" class="flex flex-col gap-6" aria-busy="true">
      <ContentSkeleton v-for="group in 2" :key="group" :rows="2" list-class="flex flex-col divide-y divide-default" :label="$t('supply.status.loading')">
        <div class="flex items-center gap-4 py-3">
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <SkeletonLine width="w-1/3" />
            <SkeletonLine width="w-1/2" />
          </div>
          <SkeletonBar class="h-5 w-9 shrink-0 rounded-full" />
        </div>
      </ContentSkeleton>
    </div>

    <div v-else-if="me === null" class="flex flex-col items-end gap-3">
      <UAlert class="w-full" color="error" variant="subtle" :description="failure" />
      <UButton color="neutral" variant="subtle" icon="i-material-symbols-refresh" :label="$t('common.action.refresh')" :loading="reading" @click="load" />
    </div>

    <template v-else>
      <SettingsGroup :title="$t('supply.title.logins')">
        <template #aside>
          <UTooltip :text="$t('supply.action.login_add')">
            <UButton size="sm" color="neutral" variant="ghost" icon="i-material-symbols-add" :aria-label="$t('supply.action.login_add')" :disabled="busy !== ''" @click="openSignIn(null)" />
          </UTooltip>
        </template>

        <SettingsRow v-if="shownLogins.length === 0" :label="$t('supply.label.logins_none')" />
        <template v-else>
          <SettingsRow v-for="(one, index) in shownLogins" :key="one.id" :label="one.name" :data-supply-login="one.name">
            <template #description>
              <span class="flex min-w-0 flex-wrap items-center gap-x-2 text-sm">
                <span class="tabular-nums text-muted">{{ index + 1 }}</span>
                <span :class="loginStatus(t, one, now).tone">{{ loginStatus(t, one, now).label }}</span>
              </span>
            </template>
            <IconButton size="xs" icon="i-material-symbols-arrow-upward" :label="$t('common.aria.move_up_named', { name: one.name })" :disabled="index === 0 || busy !== ''" @click="moveLogin(index, index - 1)" />
            <IconButton size="xs" icon="i-material-symbols-arrow-downward" :label="$t('common.aria.move_down_named', { name: one.name })" :disabled="index === shownLogins.length - 1 || busy !== ''" @click="moveLogin(index, index + 1)" />
            <UDropdownMenu :items="loginMenu(one)" :content="{ align: 'end' }">
              <UTooltip :text="$t('common.aria.menu_of', { name: one.name })">
                <UButton color="neutral" variant="ghost" size="xs" icon="i-material-symbols-more-vert" :aria-label="$t('common.aria.menu_of', { name: one.name })" />
              </UTooltip>
            </UDropdownMenu>
            <USwitch :model-value="one.enabled" :loading="busy === `login:${one.id}`" :disabled="busy !== ''" :aria-label="$t('supply.aria.login_switch', { name: one.name })" @update:model-value="(on: boolean) => void setLogin(one, on)" />
          </SettingsRow>
        </template>
      </SettingsGroup>

      <SettingsGroup :title="$t('supply.title.keys')">
        <template #aside>
          <UTooltip :text="$t('supply.action.key_add')">
            <UButton size="sm" color="neutral" variant="ghost" icon="i-material-symbols-add" :aria-label="$t('supply.action.key_add')" :disabled="busy !== ''" @click="openKeyAdd" />
          </UTooltip>
        </template>

        <SettingsRow v-if="shownKeys.length === 0" :label="$t('supply.label.keys_none')" />
        <template v-else>
          <SettingsRow v-for="one in shownKeys" :key="one.id" :label="one.secret" :data-supply-key="one.secret">
            <template #description>
              <span class="flex min-w-0 flex-wrap items-center gap-x-2 text-sm">
                <span class="text-muted">{{ roadLabel(t, one.road) }}</span>
                <span :class="keyStatus(t, one).tone">{{ keyStatus(t, one).label }}</span>
              </span>
            </template>
            <IconButton size="xs" icon="i-material-symbols-arrow-upward" :label="$t('common.aria.move_up_named', { name: one.secret })" :disabled="!canMove(one, -1) || busy !== ''" @click="moveKey(one, -1)" />
            <IconButton size="xs" icon="i-material-symbols-arrow-downward" :label="$t('common.aria.move_down_named', { name: one.secret })" :disabled="!canMove(one, 1) || busy !== ''" @click="moveKey(one, 1)" />
            <IconButton size="xs" color="error" icon="i-material-symbols-delete-outline" :label="$t('common.action.delete')" :disabled="busy !== ''" @click="removeKey(one)" />
            <USwitch :model-value="one.enabled" :loading="busy === `key:${one.id}`" :disabled="busy !== ''" :aria-label="$t('supply.aria.key_switch', { name: one.secret })" @update:model-value="(on: boolean) => void setKey(one, on)" />
          </SettingsRow>
        </template>
      </SettingsGroup>

      <!-- The reader's own local AIs: servers their own PC reaches, each tried from that PC before it is kept. -->
      <ContentSkeleton v-if="localReading && localView === null" :rows="1" list-class="flex flex-col divide-y divide-default" :label="$t('supply.status.loading')">
        <div class="flex items-center gap-4 py-3">
          <SkeletonLine width="w-1/3" />
          <SkeletonBar class="ms-auto h-5 w-9 shrink-0 rounded-full" />
        </div>
      </ContentSkeleton>
      <div v-else-if="localView !== null" class="flex flex-col" data-supply-local-ai>
        <SettingsGroup :title="$t('supply.title.local_ai')">
          <template #aside>
            <UTooltip :text="$t('supply.action.local_ai_add')">
              <UButton size="sm" color="neutral" variant="ghost" icon="i-material-symbols-add" :aria-label="$t('supply.action.local_ai_add')" :disabled="busy !== '' || !localView.allowed" data-supply-local-ai-add @click="openLocalAdd" />
            </UTooltip>
          </template>

          <SettingsRow v-if="localView.items.length === 0" :label="$t('supply.label.local_ai_none')" />
          <SettingsRow v-for="one in localView.items" v-else :key="one.name" :label="one.name" :data-supply-local-ai-row="one.name">
            <template #description>
              <span class="flex min-w-0 flex-col text-sm">
                <span class="truncate font-mono text-muted">{{ one.url }}</span>
                <span class="truncate text-muted">{{ one.modelName }}</span>
              </span>
            </template>
            <IconButton size="xs" color="error" icon="i-material-symbols-delete-outline" :label="$t('supply.aria.local_ai_remove', { name: one.name })" :disabled="busy !== ''" @click="removeLocal(one)" />
            <USwitch :model-value="one.enabled" :loading="busy === `local:${one.name}`" :disabled="busy !== '' || (!one.enabled && !localView.allowed)" :aria-label="$t('supply.aria.local_ai_switch', { name: one.name })" @update:model-value="(on: boolean) => void setLocal(one, on)" />
          </SettingsRow>
        </SettingsGroup>
        <p v-if="!localView.allowed" class="text-sm text-muted" data-supply-local-ai-withheld>{{ $t("supply.label.local_ai_withheld") }}</p>
      </div>

      <!-- The order: each source the reader may shape with its arrows and its switch, one the platform locks with its
           switch disabled and the words saying so, the end of the fall last, and the sources a later layer closes greyed under them
           all with their reason. The personal credits' monthly cap stands under their row. -->
      <div class="flex flex-col">
        <SettingsGroup :title="$t('supply.title.order')">
          <template v-for="(row, index) in rows" :key="row.source">
            <SettingsRow :label="sourceLabel(t, row.source)" :class="row.kind === 'closed' ? 'opacity-60' : ''" :data-supply-source="row.source" :data-supply-locked="row.locked ? '' : undefined">
              <template #description>
                <span v-if="row.reason !== null" class="text-sm text-muted">{{ sourceReasonText(t, row.reason) }}</span>
                <span v-else-if="row.kind === 'live' && row.locked" class="text-sm text-muted">{{ $t("supply.label.locked") }}</span>
              </template>
              <template v-if="row.kind === 'live'">
                <IconButton size="xs" icon="i-material-symbols-arrow-upward" :label="$t('common.aria.move_up_named', { name: sourceLabel(t, row.source) })" :disabled="me.orderLocked || index === 0 || busy !== ''" @click="moveSource(index, index - 1)" />
                <IconButton size="xs" icon="i-material-symbols-arrow-downward" :label="$t('common.aria.move_down_named', { name: sourceLabel(t, row.source) })" :disabled="me.orderLocked || index === liveCount - 1 || busy !== ''" @click="moveSource(index, index + 1)" />
                <USwitch :model-value="row.on" :loading="busy === `source:${row.source}`" :disabled="busy !== '' || row.locked" :aria-label="$t('supply.aria.source_switch', { name: sourceLabel(t, row.source) })" @update:model-value="(on: boolean) => void setSource(row.source, on)" />
              </template>
            </SettingsRow>
            <SettingsRow v-if="row.source === 'personal_credits' && row.kind === 'live'" :label="$t('supply.label.monthly_cap')" :description="$t('supply.label.personal_credit_cap_note')" data-supply-cap>
              <UInput v-model="capWords" class="w-32 text-end tabular-nums" inputmode="numeric" :placeholder="$t('supply.label.cap_none')" :aria-label="$t('supply.label.personal_credit_cap')" :disabled="busy !== ''" @keyup.enter="saveCap" @blur="saveCap" />
            </SettingsRow>
          </template>
        </SettingsGroup>
        <p v-if="me.orderLocked" class="text-sm text-muted" data-supply-order-locked>{{ $t("supply.label.order_locked") }}</p>
      </div>

      <SettingsGroup :title="$t('supply.title.usage')">
        <SettingsRow v-if="me.usage.length === 0" :label="$t('supply.label.usage_none')" />
        <template v-else>
          <SettingsRow v-for="one in me.usage" :key="one.source" :label="sourceLabel(t, one.source)">
            <span class="text-sm tabular-nums text-highlighted" data-supply-usage>{{ creditsText(t, one.credits) }} · {{ costText(one.costMicros) }}</span>
          </SettingsRow>
        </template>
        <SettingsRow :label="$t('supply.label.global_remaining')">
          <span class="text-sm tabular-nums text-highlighted">{{ me.globalRemaining === null ? $t('supply.label.plan_none') : creditsText(t, me.globalRemaining) }}</span>
        </SettingsRow>
        <SettingsRow :label="$t('supply.label.personal_balance')">
          <span class="text-sm tabular-nums text-highlighted">{{ me.personalCredits === null ? '—' : creditsText(t, me.personalCredits) }}</span>
        </SettingsRow>
      </SettingsGroup>

      <p v-if="failure !== ''" role="alert" class="break-words text-sm text-error" data-supply-failure>{{ failure }}</p>
    </template>

    <!-- The sign-in the agency runs on the reader's own node (docs/web.md, 「Settings」, the supply section): the
         address opens in the reader's browser, the code that page shows comes back, and closing gives it up. -->
    <SettingsDialog v-model:open="signingIn" :title="$t('agents.title.sign_in', { name: signInName })" :dirty="signInChanges" @update:open="(standing: boolean) => { if (!standing) void giveUpSignIn(); }">
      <p class="text-sm text-toned">{{ $t("agents.message.sign_in_steps") }}</p>
      <UButton v-if="signInUrl !== ''" :to="signInUrl" target="_blank" rel="noopener noreferrer" external color="neutral" variant="outline" icon="i-material-symbols-open-in-new" class="self-start" :label="$t('agents.action.open_sign_in')" data-sign-in-open />
      <UFormField v-if="signInId !== ''" :label="$t('agents.label.sign_in_code')" name="code">
        <UInput v-model="signInCode" class="w-full font-mono" autocomplete="off" spellcheck="false" :placeholder="$t('agents.placeholder.sign_in_code')" :aria-label="$t('agents.label.sign_in_code')" data-sign-in-code />
      </UFormField>
      <p v-if="signInFailed !== ''" role="alert" class="break-words text-sm text-error">{{ signInFailed }}</p>

      <template #footer="{ close }">
        <UButton :label="$t('common.action.close')" color="neutral" variant="ghost" @click="close()" />
        <UButton v-if="signInId !== ''" :label="$t('agents.action.sign_in_finish')" :loading="busy === 'sign-in'" :disabled="busy !== '' || signInCode.trim() === ''" @click="finishSignIn" />
      </template>
    </SettingsDialog>

    <!-- A local AI added: its name, the address as the reader's own PC reaches it, its model and one of the reader's own
         secrets by name where it asks a key; tried from their PC, and kept only once it answers. -->
    <SettingsDialog v-model:open="addingLocal" :title="$t('supply.title.local_ai_add')" :dirty="localChanges">
      <form id="supply-local-ai-form" class="flex flex-col gap-4" @submit.prevent="void addLocal()">
        <UFormField :label="$t('guide.label.name')" name="name" :error="localField === 'name' ? localFailed : undefined">
          <UInput v-model="localForm.name" class="w-full font-mono" autocomplete="off" spellcheck="false" placeholder="ollama" data-supply-local-ai-name />
        </UFormField>
        <UFormField :label="$t('guide.label.address')" name="url" :help="$t('supply.label.local_ai_address_note')" :error="localField === 'url' ? localFailed : undefined">
          <UInput v-model="localForm.url" class="w-full font-mono" type="url" autocomplete="off" spellcheck="false" placeholder="http://localhost:11434/v1" data-supply-local-ai-url />
        </UFormField>
        <UFormField :label="$t('guide.label.model')" name="modelName" :error="localField === 'modelName' ? localFailed : undefined">
          <UInput v-model="localForm.modelName" class="w-full font-mono" autocomplete="off" spellcheck="false" placeholder="qwen3" data-supply-local-ai-model />
        </UFormField>
        <UFormField :label="$t('guide.label.key')" :hint="$t('common.label.optional')" name="keyName">
          <ChoiceSelect v-model="localForm.keyName" :items="localKeyChoices" value-key="value" class="w-full" :aria-label="$t('guide.label.key')" data-supply-local-ai-key />
        </UFormField>
        <p v-if="localFailed !== '' && localField === null" role="alert" class="break-words text-sm text-error" data-supply-local-ai-failure>{{ localFailed }}</p>
      </form>

      <template #footer="{ close }">
        <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" @click="close()" />
        <UButton type="submit" form="supply-local-ai-form" :label="$t('supply.action.local_ai_save')" :loading="busy === 'local-add'" :disabled="busy !== '' || !localReady" data-supply-local-ai-save />
      </template>
    </SettingsDialog>

    <!-- A key added: the provider, and one of the reader's own secrets picked by name — or the way to the secret
         store where their space holds none yet. The value never passes through this form. -->
    <SettingsDialog v-model:open="addingKey" :title="$t('supply.title.key_add')" :dirty="keyChanges">
      <form id="supply-key-form" class="flex flex-col gap-4" @submit.prevent="void addKey()">
        <UFormField :label="$t('supply.label.road')" name="road" :help="$t('supply.label.secret_note')">
          <ChoiceSelect v-model="keyRoad" :items="roadItems" value-key="value" class="w-full" :aria-label="$t('supply.label.road')" />
        </UFormField>

        <UFormField v-if="secretChoices.length > 0" :label="$t('supply.label.secret')" name="secret">
          <ChoiceSelect v-model="keySecret" :items="secretChoices" value-key="value" class="w-full" :aria-label="$t('supply.label.secret')" />
        </UFormField>
        <UAlert v-else color="neutral" variant="subtle" :description="$t('supply.label.secrets_none')">
          <template #actions>
            <UButton size="xs" color="neutral" variant="link" :label="$t('supply.action.open_store')" @click="openStore" />
          </template>
        </UAlert>

        <p v-if="keyFailed !== ''" role="alert" class="break-words text-sm text-error">{{ keyFailed }}</p>
      </form>

      <template #footer="{ close }">
        <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" @click="close()" />
        <UButton type="submit" form="supply-key-form" :label="$t('common.action.add')" :loading="busy === 'key-add'" :disabled="busy !== '' || keySecret === '' || secretChoices.length === 0 || !keyChanges.dirty.value" />
      </template>
    </SettingsDialog>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { useOpenedWith } from "bmo-ui/app/domain/form-save";

import { useConfirm } from "~/domain/confirm";
import { costText, creditsText, keyStatus, loginStatus, meSetting, movedSourceOrder, orderRows, roadLabel, sourceLabel, sourceReasonText, SUPPLY_ROADS } from "~/domain/supply";
import { openSettings, useSettings } from "~/domain/settings-dialog";

import { localAiNamed } from "#shared/local-ai";

import type { PersonalSupplyKey, SupplyMe, SupplyMeSetting, SpentSource } from "#shared/supply";
import type { LocalAi, LocalAiView } from "#shared/local-ai";
import type { ClaudeAccountView, ClaudeLoginStarted, FallbackView, KeptSecret, SecretList } from "#shared/types";
import type { DropdownMenuItem } from "@nuxt/ui";

// The reader's own supply, read whole when the section opens and written one setting at a time (docs/web.md,
// 「Settings」, the supply section). Every refusal is the agency's or the account service's, said by the pack's
// sentence for its code; nothing is decided here.

const { t } = useI18n();
const confirm = useConfirm();
const dialog = useSettings();

const me = ref<SupplyMe | null>(null);
const logins = ref<ClaudeAccountView[] | null>(null);
const keys = ref<PersonalSupplyKey[] | null>(null);
const secrets = ref<string[]>([]);
const failure = ref("");
const reading = ref(false);
const busy = ref("");
// The minute the section opened, counted from for a login resting under its window's reset; the section is read
// afresh every time it opens, so it never needs to tick.
const now = Math.floor(Date.now() / 1000);

// Logins walk in their own order; keys stand grouped by provider, each in its provider's order.
const shownLogins = computed(() => (logins.value ?? []).slice().sort((one, other) => one.place - other.place));
const shownKeys = computed(() => (keys.value ?? []).slice().sort((one, other) => (one.road === other.road ? one.place - other.place : one.road.localeCompare(other.road))));

async function load(): Promise<void> {
  reading.value = true;
  failure.value = "";

  try {
    const [ownView, fallback, keptKeys, kept] = await Promise.all([
      $fetch<SupplyMe>("/api/supply/me"),
      $fetch<FallbackView>("/api/supply/logins"),
      $fetch<PersonalSupplyKey[]>("/api/supply/personal"),
      $fetch<SecretList>("/api/secrets")
    ]);

    me.value = ownView;
    logins.value = fallback.accounts;
    keys.value = keptKeys;
    secrets.value = kept.secrets.map((one: KeptSecret) => one.name);
    void loadLocal();
    capWords.value = ownView.personalCreditCredits === null ? "" : String(ownView.personalCreditCredits);
  } catch (error) {
    failure.value = failureText(error, t("supply.error.read_failed"));
  } finally {
    reading.value = false;
  }
}

// --- The reader's own local AIs, at the agency ---

// Read on their own after the section: an agency that keeps none yet leaves the group out rather than the section.
const localView = ref<LocalAiView | null>(null);
const localReading = ref(true);
// A choice holds no empty value, so no key stands as a word no secret's name can be: one never begins with a dot.
const NO_KEY = ".";
const addingLocal = ref(false);
const localForm = reactive({ name: "", url: "", modelName: "", keyName: NO_KEY });
const localFailed = ref("");
const localField = ref<string | null>(null);
const localChanges = useOpenedWith(() => ({ ...localForm }), { open: addingLocal });
const localReady = computed(() => localAiNamed(localForm.name) && localForm.url.trim() !== "" && localForm.modelName.trim() !== "");
// No key first, then each of the reader's own secrets by name.
const localKeyChoices = computed(() => [{ value: NO_KEY, label: t("supply.label.local_ai_no_key") }, ...secrets.value.map((one) => ({ value: one, label: one }))]);

async function loadLocal(): Promise<void> {
  try {
    localView.value = await $fetch<LocalAiView>("/api/supply/local-ai");
  } catch {
    localView.value = null;
  } finally {
    localReading.value = false;
  }
}

function openLocalAdd(): void {
  Object.assign(localForm, { name: "", url: "", modelName: "", keyName: NO_KEY });
  localFailed.value = "";
  localField.value = null;
  addingLocal.value = true;
}

async function addLocal(): Promise<void> {
  if (!localReady.value || busy.value !== "") return;

  busy.value = "local-add";
  localFailed.value = "";
  localField.value = null;
  try {
    const name = localForm.name.trim();

    await $fetch(`/api/supply/local-ai/${encodeURIComponent(name)}`, {
      method: "PUT",
      body: { url: localForm.url.trim(), modelName: localForm.modelName.trim(), keyName: localForm.keyName === NO_KEY ? null : localForm.keyName }
    });
    addingLocal.value = false;
    await loadLocal();
  } catch (error) {
    localFailed.value = failureText(error, t("supply.error.local_ai_failed"));
    localField.value = (error as { data?: { data?: { field?: string } } }).data?.data?.field ?? null;
  } finally {
    busy.value = "";
  }
}

async function setLocal(one: LocalAi, on: boolean): Promise<void> {
  busy.value = `local:${one.name}`;
  try {
    await $fetch(`/api/supply/local-ai/${encodeURIComponent(one.name)}`, { method: "PATCH", body: { enabled: on } });
    await loadLocal();
  } catch (error) {
    failure.value = failureText(error, t("supply.error.local_ai_failed"));
  } finally {
    busy.value = "";
  }
}

async function removeLocal(one: LocalAi): Promise<void> {
  const taken = await confirm({ title: t("supply.message.local_ai_delete", { name: one.name }), effect: t("supply.message.local_ai_delete_effect"), confirm: t("common.action.delete") });

  if (!taken) return;

  busy.value = `local:${one.name}`;
  try {
    await $fetch(`/api/supply/local-ai/${encodeURIComponent(one.name)}`, { method: "DELETE" });
    await loadLocal();
  } catch (error) {
    failure.value = failureText(error, t("supply.error.local_ai_failed"));
  } finally {
    busy.value = "";
  }
}

// --- The reader's own Claude logins, at the agency ---

async function askLogins(body: Record<string, unknown>, mark: string): Promise<void> {
  busy.value = mark;

  try {
    await $fetch("/api/supply/logins", { method: "POST", body });
    logins.value = (await $fetch<FallbackView>("/api/supply/logins")).accounts;
  } catch (error) {
    failure.value = failureText(error, t("supply.error.logins_failed"));
  } finally {
    busy.value = "";
  }
}

async function moveLogin(from: number, to: number): Promise<void> {
  const order = shownLogins.value.slice();
  const [moved] = order.splice(from, 1);

  if (moved === undefined) return;
  order.splice(to, 0, moved);

  await askLogins({ action: "set-account-order", order: order.map((one) => ({ id: one.id, enabled: one.enabled })) }, "login-order");
}

async function setLogin(account: ClaudeAccountView, on: boolean): Promise<void> {
  await askLogins({ action: "set-account-enabled", account: account.id, enabled: on }, `login:${account.id}`);
}

// The row's more-menu: the sign-in again where its directory can hold one, and the taking away.
function loginMenu(account: ClaudeAccountView): DropdownMenuItem[] {
  const items: DropdownMenuItem[] = [];

  if (account.credentialKind === "directory") {
    items.push({ label: t("supply.action.login_again"), icon: "i-material-symbols-login", disabled: busy.value !== "", onSelect: () => void openSignIn(account) });
  }

  items.push({ label: t("common.action.delete"), icon: "i-material-symbols-delete-outline", color: "error" as const, onSelect: () => void removeLogin(account) });

  return items;
}

async function removeLogin(account: ClaudeAccountView): Promise<void> {
  const taken = await confirm({ title: t("supply.message.login_delete", { name: account.name }), effect: t("supply.message.login_delete_effect"), confirm: t("common.action.delete") });

  if (!taken) return;
  await askLogins({ action: "remove-account", account: account.id }, "login-remove");
}

// The sign-in under way: the agency's identifier for it, the address to approve it at, and the code pasted back;
// closing the box while it runs gives it up, as the administrator's box does.
const signingIn = ref(false);
const signInId = ref("");
const signInName = ref("");
const signInUrl = ref("");
const signInCode = ref("");
const signInFailed = ref("");
const signInChanges = useOpenedWith(() => signInCode.value, { open: signingIn });

// A new login is named by the agency, which holds every account's name where the reader sees only their own; the
// box's title carries the name it answered, and Claude's until it has.
async function openSignIn(account: ClaudeAccountView | null): Promise<void> {
  signInFailed.value = "";
  const name = account?.name ?? "Claude";

  busy.value = "sign-in";
  try {
    const started = await $fetch<ClaudeLoginStarted>("/api/supply/signin", { method: "POST", body: account === null ? {} : { account: account.id } });

    signInId.value = started.login;
    signInUrl.value = started.url;
    signInName.value = started.name || name;
    signInCode.value = "";
    signingIn.value = true;
  } catch (error) {
    signInFailed.value = failureText(error, t("supply.error.signin_failed"));
    signInName.value = name;
    signingIn.value = true;
  } finally {
    busy.value = "";
  }
}

async function finishSignIn(): Promise<void> {
  if (signInCode.value.trim() === "" || busy.value !== "") return;

  busy.value = "sign-in";
  try {
    await $fetch(`/api/supply/signin/${encodeURIComponent(signInId.value)}/code`, { method: "POST", body: { code: signInCode.value.trim() } });
    signInId.value = "";
    signingIn.value = false;
    logins.value = (await $fetch<FallbackView>("/api/supply/logins")).accounts;
  } catch (error) {
    signInId.value = "";
    signInFailed.value = failureText(error, t("supply.error.signin_failed"));
  } finally {
    busy.value = "";
  }
}

async function giveUpSignIn(): Promise<void> {
  const login = signInId.value;

  signInId.value = "";
  signInCode.value = "";
  if (login === "") return;
  await $fetch(`/api/supply/signin/${encodeURIComponent(login)}`, { method: "DELETE" }).catch(() => undefined);
}

// --- The reader's own gateway keys, at the agency ---

const addingKey = ref(false);
const keyRoad = ref("codex");
const keySecret = ref("");
const keyFailed = ref("");

// The form's opened-with values are its blanks; supply opens only while one differs (docs/web.md, 「Forms」).
const keyChanges = useOpenedWith(() => ({ road: keyRoad.value, secret: keySecret.value }), { open: addingKey });

const roadItems = computed(() => SUPPLY_ROADS.filter((one) => one.value !== "claude").map((one) => ({ value: one.value, label: t(one.label) })));
const secretChoices = computed(() => secrets.value.map((one) => ({ value: one, label: one })));

function openKeyAdd(): void {
  keyRoad.value = "codex";
  keySecret.value = "";
  keyFailed.value = "";
  addingKey.value = true;
}

// The form with nothing to pick points at the secret store instead, which opens as a section of this dialog.
function openStore(): void {
  addingKey.value = false;
  openSettings(dialog, "secrets");
}

async function addKey(): Promise<void> {
  if (keySecret.value === "" || busy.value !== "") return;

  busy.value = "key-add";
  keyFailed.value = "";
  try {
    const kept = await $fetch<PersonalSupplyKey>("/api/supply/personal", { method: "POST", body: { road: keyRoad.value, secret: keySecret.value } });

    keys.value = [...(keys.value ?? []), kept];
    addingKey.value = false;
  } catch (error) {
    keyFailed.value = failureText(error, t("supply.error.key_failed"));
  } finally {
    busy.value = "";
  }
}

function sameRoad(one: PersonalSupplyKey): PersonalSupplyKey[] {
  return shownKeys.value.filter((other) => other.road === one.road);
}

function canMove(one: PersonalSupplyKey, by: number): boolean {
  return one.place + by >= 1 && one.place + by <= sameRoad(one).length;
}

// The agency rewrites a key's whole road-order on a place change, so the keys are read back after one.
async function moveKey(one: PersonalSupplyKey, by: number): Promise<void> {
  busy.value = `key:${one.id}`;
  try {
    await $fetch(`/api/supply/personal/${encodeURIComponent(one.id)}`, { method: "PATCH", body: { place: one.place + by } });
    keys.value = await $fetch<PersonalSupplyKey[]>("/api/supply/personal");
  } catch (error) {
    failure.value = failureText(error, t("supply.error.key_failed"));
  } finally {
    busy.value = "";
  }
}

async function setKey(one: PersonalSupplyKey, on: boolean): Promise<void> {
  busy.value = `key:${one.id}`;
  try {
    await $fetch(`/api/supply/personal/${encodeURIComponent(one.id)}`, { method: "PATCH", body: { enabled: on } });
    keys.value = (keys.value ?? []).map((other) => (other.id === one.id ? { ...other, enabled: on, ...(on ? { refusedAt: null } : {}) } : other));
  } catch (error) {
    failure.value = failureText(error, t("supply.error.key_failed"));
  } finally {
    busy.value = "";
  }
}

async function removeKey(one: PersonalSupplyKey): Promise<void> {
  const taken = await confirm({ title: t("supply.message.key_delete", { name: one.secret }), effect: t("supply.message.key_delete_effect"), confirm: t("common.action.delete") });

  if (!taken) return;

  busy.value = "key-remove";
  try {
    await $fetch(`/api/supply/personal/${encodeURIComponent(one.id)}`, { method: "DELETE" });
    keys.value = (keys.value ?? []).filter((other) => other.id !== one.id);
  } catch (error) {
    failure.value = failureText(error, t("supply.error.key_failed"));
  } finally {
    busy.value = "";
  }
}

// --- The reader's own order, its switches and the personal-credit cap, at the account service ---

// The order as its rows stand (docs/web.md, 「Settings」, the supply section): what the reader shapes, on and off, the
// sources the platform locks among them, the end of the fall, and what a later layer closed.
const rows = computed(() => (me.value === null ? [] : orderRows(me.value)));
const liveCount = computed(() => rows.value.filter((one) => one.kind === "live").length);

// Every write carries the section's whole setting, and the view the service answers with stands in its place; a
// refusal says its own sentence under the groups and nothing moved.
async function saveSetting(setting: SupplyMeSetting, mark = "setting"): Promise<void> {
  if (me.value === null || busy.value !== "") return;

  busy.value = mark;
  try {
    me.value = await $fetch<SupplyMe>("/api/supply/me", { method: "PUT", body: setting });
  } catch (error) {
    failure.value = failureText(error, t("supply.error.order_failed"));
  } finally {
    busy.value = "";
  }
}

async function moveSource(from: number, to: number): Promise<void> {
  await saveSetting(meSetting(rows.value, me.value?.personalCreditCredits ?? null, { order: movedSourceOrder(rows.value, from, to) }));
}

async function setSource(source: SpentSource, on: boolean): Promise<void> {
  await saveSetting(meSetting(rows.value, me.value?.personalCreditCredits ?? null, { source, on }), `source:${source}`);
}

const capWords = ref("");

// The cap is a field of the section, and the section takes effect as it is changed: an unchanged or empty box
// stands the cap off, a whole number writes it, and a refusal puts the number back as it stood.
async function saveCap(): Promise<void> {
  const written = capWords.value.trim();
  const standing = me.value?.personalCreditCredits ?? null;
  const kept = standing === null ? "" : String(standing);

  if (written === kept || !/^[1-9][0-9]*$/.test(written)) {
    capWords.value = kept;
    return;
  }

  await saveSetting(meSetting(rows.value, standing, { cap: Number(written) }));
  capWords.value = me.value?.personalCreditCredits === null ? "" : String(me.value?.personalCreditCredits ?? "");
}

onMounted(() => void load());
</script>
