<template>
  <!-- The Claude logins the agency holds, in the order the Claude Code provider walks them (docs/web.md,
       「Administration」, the providers tab). A row is carried by its handle alone, by the mouse and the finger
       the same way, and the order is saved the moment it is dropped. What a row says of a credential is the path it
       is reached by — no cell and no box here has a token to show, because none is ever sent to this screen. A new
       login is added from the add at the heading's right end, which opens the box this list keeps. The list stands as a group under its
       heading, its rows parted by hairlines with no box round them, as the providers above it do. An address naming
       the group opens with it brought to the top of the body, the body's own padding kept above it. -->
  <section :id="ACCOUNTS_GROUP" class="flex scroll-mt-4 flex-col" aria-labelledby="accounts-title">
    <div class="flex min-h-8 items-center justify-between gap-4">
      <h3 id="accounts-title" class="text-sm font-semibold text-highlighted">{{ $t("agents.title.accounts") }}</h3>
      <UButton size="xs" color="neutral" variant="ghost" icon="i-material-symbols-add" :label="$t('agents.action.account_add')" data-account-add @click="openAdd()" />
    </div>

    <ol ref="list" class="flex flex-col divide-y divide-default" :aria-label="$t('agents.title.accounts')">
      <li
        v-for="(one, index) in shown"
        :key="one.id"
        :data-order-index="index"
        :data-account="one.id"
        class="grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-x-1 py-1"
        :class="[drag.mark(index), !one.enabled && 'bg-elevated/40']"
      >
        <span
          class="flex size-11 cursor-grab touch-none select-none items-center justify-center text-muted transition-colors hover:text-highlighted active:text-primary"
          role="img"
          :aria-label="$t('agents.aria.drag_reorder')"
          @pointerdown="drag.onHandleDown(index, $event)"
        >
          <UIcon name="i-material-symbols-drag-indicator" class="size-5" />
        </span>

        <span class="flex min-w-0 flex-col gap-1 py-1">
          <span class="flex min-w-0 items-center gap-2">
            <span class="text-sm tabular-nums text-muted">{{ index + 1 }}</span>
            <UIcon :name="accountMark(one).icon" class="size-4 shrink-0" :class="accountMark(one).tone" />
            <SearchText class="truncate text-sm font-medium" :class="one.enabled ? 'text-highlighted' : 'text-muted'" :text="one.name" :query="props.query" />
            <UTooltip v-if="one.chosen" :text="$t('agents.label.account_chosen')">
              <UIcon name="i-material-symbols-keep" class="size-4 shrink-0 text-primary" role="img" :aria-label="$t('agents.label.account_chosen')" />
            </UTooltip>
          </span>
          <span class="text-sm text-muted" data-account-owner>{{ ownerText(t, one.userId, props.names) }}</span>
          <span v-if="loginText(one) !== ''" class="flex flex-wrap items-center gap-2" data-account-marks>
            <UBadge :color="one.login === 'gone' || one.login === 'none' ? 'error' : 'warning'" variant="subtle" size="sm" :label="loginText(one)" />
          </span>
          <!-- A path is allowed to run past its width and scrolls inside itself, as a worker's
               working directory does. -->
          <span data-overflow-cell class="block max-w-full overflow-x-auto whitespace-nowrap [scrollbar-width:thin]">
            <SearchText class="font-mono text-sm text-muted" :text="one.credentialPath" :query="props.query" />
          </span>
        </span>

        <span class="flex shrink-0 items-center gap-1">
          <UTooltip :text="$t('common.action.move_up')">
            <UButton color="neutral" variant="ghost" size="sm" icon="i-material-symbols-arrow-upward" :aria-label="$t('common.aria.move_up_named', { name: one.name })" :disabled="index === 0 || busy !== ''" @click="saveOrder(index, index - 1)" />
          </UTooltip>
          <UTooltip :text="$t('common.action.move_down')">
            <UButton color="neutral" variant="ghost" size="sm" icon="i-material-symbols-arrow-downward" :aria-label="$t('common.aria.move_down_named', { name: one.name })" :disabled="index === shown.length - 1 || busy !== ''" @click="saveOrder(index, index + 1)" />
          </UTooltip>
          <UDropdownMenu :items="menuOf(one)" :content="{ align: 'end' }">
            <UTooltip :text="$t('common.aria.menu_of', { name: one.name })">
              <UButton color="neutral" variant="ghost" size="sm" icon="i-material-symbols-more-vert" :aria-label="$t('common.aria.menu_of', { name: one.name })" />
            </UTooltip>
          </UDropdownMenu>
          <USwitch
            :model-value="one.enabled"
            :aria-label="$t('agents.aria.switch_on', { name: one.name })"
            :loading="busy === `account:${one.id}`"
            :disabled="busy !== ''"
            class="ps-1"
            @update:model-value="setEnabled(one, $event as boolean)"
          />
        </span>

        <!-- What the account has left, on a line of its own under the row, as wide as the row past its handle: the
             panel's own figures of that login, a skeleton while they are first read, and nothing for an account that
             is off, which answers nothing. -->
        <div v-if="one.enabled && (props.usage.initial || accountGroup(props.usage.groups, one.id) !== null)" class="col-span-2 col-start-2 pb-1" :data-account-usage="one.id">
          <SkeletonStatus v-if="props.usage.initial" :label="$t('usage.status.loading')"><SkeletonLine width="w-2/3" /></SkeletonStatus>
          <UsageFigures v-else :group="accountGroup(props.usage.groups, one.id)!" :now="props.usage.now" />
        </div>
      </li>

      <li v-if="shown.length === 0" class="py-3 text-sm text-highlighted">{{ $t("agents.status.no_accounts") }}</li>
    </ol>

    <p v-if="failed !== ''" role="alert" class="break-words text-sm text-error">{{ failed }}</p>

    <SettingsDialog v-model:open="editing" :title="adding ? $t('agents.title.account_add') : editName" :description="adding ? undefined : editId" :dirty="changes">
      <form id="account-form" class="flex flex-col gap-4" @submit.prevent="save">
        <UFormField :label="$t('common.label.name')" name="name">
          <UInput v-model="editName" class="w-full" :placeholder="adding && editKind === 'sign-in' ? $t('agents.placeholder.account_name_auto') : $t('agents.placeholder.account_name')" :aria-label="$t('common.label.name')" />
        </UFormField>

        <UFormField :label="$t('agents.label.credential')" name="kind">
          <ChoiceSelect v-model="editKind" :items="adding ? ADD_KIND_ITEMS : KIND_ITEMS" value-key="value" class="w-full" :aria-label="$t('agents.label.credential')" />
        </UFormField>

        <UFormField v-if="editKind !== 'sign-in'" :label="$t('common.label.path')" name="path" :help="editKind === 'token' ? $t('agents.placeholder.token_path') : $t('agents.placeholder.directory_path')">
          <UInput v-model="editPath" class="w-full font-mono" :placeholder="editKind === 'token' ? '~/.config/claude-sub.token' : '/home/user/.claude-sub'" :aria-label="$t('common.label.path')" />
        </UFormField>

        <p v-if="formFailed !== ''" role="alert" class="break-words text-sm text-error">{{ formFailed }}</p>
      </form>

      <template #footer="{ close }">
        <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="busy !== ''" @click="close()" />
        <UButton type="submit" form="account-form" :label="adding ? $t('common.action.add') : $t('common.action.save')" :loading="busy === 'save'" :disabled="busy !== '' || (!changes.dirty.value && editKind !== 'sign-in')" />
      </template>
    </SettingsDialog>

    <!-- The sign-in the agency runs for an account (the agency's docs/cache-fallback.md, 「Signing an account in from
         the console」): the address opens in the administrator's own browser, and the code that page shows is pasted
         back. Closing the box gives the sign-in up. Neither the address nor the code is kept by this screen. -->
    <SettingsDialog v-model:open="signingIn" :title="$t('agents.title.sign_in', { name: signInName })" :dirty="signInChanges" @update:open="(open: boolean) => { if (!open) void giveUpSignIn(); }">
      <form id="sign-in-form" class="flex flex-col gap-4" data-sign-in @submit.prevent="finishSignIn">
        <p class="text-sm text-toned">{{ $t("agents.message.sign_in_steps") }}</p>
        <UButton :to="signInUrl" target="_blank" rel="noopener noreferrer" external color="neutral" variant="outline" icon="i-material-symbols-open-in-new" class="self-start" :label="$t('agents.action.open_sign_in')" data-sign-in-open />
        <UFormField :label="$t('agents.label.sign_in_code')" name="code">
          <UInput v-model="signInCode" class="w-full font-mono" autocomplete="off" spellcheck="false" :placeholder="$t('agents.placeholder.sign_in_code')" :aria-label="$t('agents.label.sign_in_code')" data-sign-in-code />
        </UFormField>
        <p v-if="signInFailed !== ''" role="alert" class="break-words text-sm text-error">{{ signInFailed }}</p>
      </form>

      <template #footer="{ close }">
        <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="busy === 'sign-in'" @click="close()" />
        <UButton type="submit" form="sign-in-form" :label="$t('agents.action.sign_in_finish')" :loading="busy === 'sign-in'" :disabled="busy !== '' || signInCode.trim() === ''" />
      </template>
    </SettingsDialog>

    <SettingsDialog v-model:open="removing" :title="$t('common.title.delete_named', { name: removeName })">
      <p class="text-sm text-toned">{{ $t("agents.message.account_delete_confirm") }}</p>

      <template #footer>
        <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="busy !== ''" @click="removing = false" />
        <UButton :label="$t('common.action.delete')" color="error" :loading="busy === 'remove'" :disabled="busy !== ''" @click="remove" />
      </template>
    </SettingsDialog>
  </section>
</template>

<script setup lang="ts">
import { useOpenedWith } from "bmo-ui/app/domain/form-save";
import { ACCOUNT_KINDS, ACCOUNTS_GROUP, SIGN_IN_KIND, accountLoginText, accountMark } from "~/domain/accounts";
import { movedOrder } from "~/domain/agents";
import { failureText } from "bmo-ui/app/domain/errors";
import { usePolling } from "~/domain/polling";
import { useRowDrag } from "~/domain/row-drag";
import { ownerText } from "~/domain/supply";
import { accountGroup } from "~/domain/usage";

import type { ClaudeAccountView, ClaudeLoginStarted } from "#shared/types";
import type { UsageFiguresRead } from "~/domain/usage";
import type { DropdownMenuItem } from "@nuxt/ui";

interface Props {
  accounts: ClaudeAccountView[];
  // Every change is asked of the bot and then read back by the page, which this waits for.
  reread: () => Promise<void>;
  query?: string;
  // What each account has left, as the page reads it; none until it is read.
  usage?: UsageFiguresRead;
  // The names the people the accounts belong to go by, by their user id.
  names?: ReadonlyMap<string, string>;
}

const props = withDefaults(defineProps<Props>(), {
  query: "",
  usage: () => ({ groups: [], now: 0, initial: false }),
  names: () => new Map(),
});

const { t } = useI18n();
const route = useRoute();

// The group stands only once its accounts are read, after the router has scrolled for the address, so it brings itself
// into view where the address names it; the browser's scroll anchoring holds it there while the groups above it fill.
onMounted(() => {
  if (route.hash === `#${ACCOUNTS_GROUP}`) document.getElementById(ACCOUNTS_GROUP)?.scrollIntoView({ block: "start" });
});

const KIND_ITEMS = ACCOUNT_KINDS.map((one) => ({ ...one, label: t(one.label) }));
// A new account may also be signed in here, which is what its box offers first.
const ADD_KIND_ITEMS = [SIGN_IN_KIND, ...ACCOUNT_KINDS].map((one) => ({ ...one, label: t(one.label) }));

const busy = ref("");
const failed = ref("");
const formFailed = ref("");
const editing = ref(false);
const adding = ref(false);
const removing = ref(false);
const editId = ref("");
const editName = ref("");
const editKind = ref<ClaudeAccountView["credentialKind"] | "sign-in">("directory");
const editPath = ref("");
const removeId = ref("");
const removeName = ref("");
// The sign-in under way: the agency's identifier for it, the address it is approved at, and the code pasted back.
const signingIn = ref(false);
const signInId = ref("");
const signInName = ref("");
const signInUrl = ref("");
const signInCode = ref("");
const signInChanges = useOpenedWith(() => signInCode.value, { open: signingIn });
const signInFailed = ref("");

// The order while a drop is on its way: the rows stand in the new order at once, and a refusal
// takes this away so the bot's own order stands again.
const pending = ref<ClaudeAccountView[] | null>(null);
const shown = computed(() => pending.value ?? props.accounts);
const list = ref<HTMLElement | null>(null);
const drag = useRowDrag({ list, ready: () => busy.value === "" && pending.value === null, drop: (from, to) => void saveOrder(from, to) });

// The second the lengths are counted from, moved once a minute because a login's remaining life is
// said in minutes at its shortest.
const now = ref(Math.floor(Date.now() / 1000));
usePolling(() => { now.value = Math.floor(Date.now() / 1000); }, 60_000);

function loginText(account: ClaudeAccountView): string {
  return accountLoginText(t, account, now.value);
}

// The chosen account offers the way back to the order; every other offers to be the one runs go out
// on now, which an account that is off cannot be.
function choiceItem(account: ClaudeAccountView): DropdownMenuItem {
  if (account.chosen) {
    return {
      label: t("agents.action.walk_order"),
      icon: "i-material-symbols-format-list-numbered",
      disabled: busy.value !== "",
      onSelect: () => void ask({ action: "clear-account-choice" }, "choose", failed)
    };
  }

  return {
    label: t("agents.action.use_account"),
    icon: "i-material-symbols-keep-outline",
    disabled: !account.enabled || busy.value !== "",
    onSelect: () => void ask({ action: "choose-account", account: account.id }, "choose", failed)
  };
}

function menuOf(account: ClaudeAccountView): DropdownMenuItem[] {
  return [
    choiceItem(account),
    ...(account.credentialKind === "directory"
      ? [{ label: t("agents.action.sign_in_again"), icon: "i-material-symbols-login", disabled: busy.value !== "", onSelect: () => void startSignIn({ account: account.id }, account.name, failed) }]
      : []),
    { label: t("common.action.edit"), icon: "i-material-symbols-edit-outline", onSelect: () => openEdit(account) },
    {
      label: t("common.action.delete"),
      icon: "i-material-symbols-delete-outline",
      color: "error" as const,
      onSelect: () => {
        removeId.value = account.id;
        removeName.value = account.name;
        removing.value = true;
      }
    }
  ];
}

// The box's fields as they stand, and as they opened; its Save button is on only while they differ
// (docs/web.md, 「Forms」).
const changes = useOpenedWith(() => ({ name: editName.value, kind: editKind.value, path: editPath.value }), { open: editing });

function openAdd(): void {
  adding.value = true;
  editId.value = "";
  // Left empty, the agency names the login past every account's names, the people's among them, which this list
  // does not show; the owner may write a name instead.
  editName.value = "";
  editKind.value = "sign-in";
  editPath.value = "";
  formFailed.value = "";
  editing.value = true;
}

function openEdit(account: ClaudeAccountView): void {
  adding.value = false;
  editId.value = account.id;
  editName.value = account.name;
  editKind.value = account.credentialKind;
  editPath.value = account.credentialPath;
  formFailed.value = "";
  editing.value = true;
}

async function ask(body: Record<string, unknown>, mark: string, into: Ref<string>): Promise<boolean> {
  busy.value = mark;
  into.value = "";

  try {
    await $fetch("/api/fallback", { method: "POST", body });
    await props.reread();

    return true;
  } catch (error) {
    into.value = failureText(error, t("common.error.save_failed"));

    return false;
  } finally {
    busy.value = "";
  }
}

// The whole new order is what the bot is asked for; a refusal leaves the order the bot still holds.
async function saveOrder(from: number, to: number): Promise<void> {
  if (busy.value !== "") return;

  const order = movedOrder(shown.value, from, to);

  pending.value = order;

  try {
    await ask({ action: "set-account-order", order: order.map((one) => ({ id: one.id, enabled: one.enabled })) }, "set-account-order", failed);
  } finally {
    pending.value = null;
  }
}

async function setEnabled(account: ClaudeAccountView, enabled: boolean): Promise<void> {
  if (busy.value !== "") return;

  pending.value = props.accounts.map((one) => (one.id === account.id ? { ...one, enabled } : one));

  try {
    await ask({ action: "set-account-enabled", account: account.id, enabled }, `account:${account.id}`, failed);
  } finally {
    pending.value = null;
  }
}

// A sign-in started at the agency for an account there or a new one, its box opened on the address it answered and
// titled by the account's name it answered, the one the agency gave a new login named by none.
async function startSignIn(body: { account: string } | { name: string } | Record<string, never>, name: string, into: Ref<string>): Promise<boolean> {
  busy.value = "sign-in";
  into.value = "";

  try {
    const started = await $fetch<ClaudeLoginStarted>("/api/claude-logins", { method: "POST", body });

    signInId.value = started.login;
    signInUrl.value = started.url;
    signInName.value = started.name || name;
    signInCode.value = "";
    signInFailed.value = "";
    signingIn.value = true;

    return true;
  } catch (error) {
    into.value = failureText(error, t("common.error.save_failed"));

    return false;
  } finally {
    busy.value = "";
  }
}

// The pasted code handed to the sign-in; once the login is written the list is read again and the box closes. A
// refused code ends the sign-in at the agency, so the box says so and is left to be closed.
async function finishSignIn(): Promise<void> {
  if (signInCode.value.trim() === "" || busy.value !== "") return;

  busy.value = "sign-in";
  signInFailed.value = "";

  try {
    await $fetch(`/api/claude-logins/${encodeURIComponent(signInId.value)}/code`, { method: "POST", body: { code: signInCode.value.trim() } });
    signInId.value = "";
    signInCode.value = "";
    signingIn.value = false;
    await props.reread();
  } catch (error) {
    signInId.value = "";
    signInFailed.value = failureText(error, t("common.error.save_failed"));
  } finally {
    busy.value = "";
  }
}

// The box closed with the sign-in still under way: the agency is told to give it up. One already ended is let be.
async function giveUpSignIn(): Promise<void> {
  const login = signInId.value;

  signInId.value = "";
  signInCode.value = "";
  if (login === "") return;

  await $fetch(`/api/claude-logins/${encodeURIComponent(login)}`, { method: "DELETE" }).catch(() => undefined);
}

async function save(): Promise<void> {
  if (adding.value && editKind.value === "sign-in") {
    const name = editName.value.trim();

    if (await startSignIn(name === "" ? {} : { name }, name, formFailed)) editing.value = false;

    return;
  }

  const body = adding.value
    ? { action: "add-account", name: editName.value.trim(), kind: editKind.value, path: editPath.value.trim() }
    : { action: "update-account", account: editId.value, name: editName.value.trim(), kind: editKind.value, path: editPath.value.trim() };

  if (await ask(body, "save", formFailed)) {
    editing.value = false;
  }
}

async function remove(): Promise<void> {
  if (await ask({ action: "remove-account", account: removeId.value }, "remove", failed)) {
    removing.value = false;
  }
}

// The box for a new login, which the tab row's add opens.
defineExpose({ openAdd });
</script>
