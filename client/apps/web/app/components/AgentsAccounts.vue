<template>
  <!-- The Claude logins the agency holds, in the order the Claude Code provider walks them (docs/web.md,
       「Organisation settings」, the providers tab). A row is carried by its handle alone, by the mouse and the finger
       the same way, and the order is saved the moment it is dropped. What a row says of a credential is the path it
       is reached by — no cell and no box here has a token to show, because none is ever sent to this screen. A new
       login is added from the screen's create button, which opens the box this list keeps. -->
  <section class="flex flex-col gap-3" aria-labelledby="accounts-title">
    <h3 id="accounts-title" class="flex min-h-8 items-center text-sm font-semibold text-highlighted">{{ $t("agents.title.accounts") }}</h3>

    <ol ref="list" class="flex flex-col divide-y divide-default overflow-hidden rounded-lg border border-default" :aria-label="$t('agents.title.accounts')">
      <li
        v-for="(one, index) in shown"
        :key="one.id"
        :data-order-index="index"
        :data-account="one.id"
        class="grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-x-1 py-1 pe-2"
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

        <span class="flex min-w-0 flex-col py-1">
          <span class="flex min-w-0 items-center gap-2">
            <span class="text-sm tabular-nums text-muted">{{ index + 1 }}</span>
            <UIcon :name="accountMark(one).icon" class="size-4 shrink-0" :class="accountMark(one).tone" />
            <SearchText class="truncate text-sm font-medium" :class="one.enabled ? 'text-highlighted' : 'text-muted'" :text="one.name" :query="props.query" />
            <UTooltip v-if="one.chosen" :text="$t('agents.label.account_chosen')">
              <UIcon name="i-material-symbols-keep" class="size-4 shrink-0 text-primary" role="img" :aria-label="$t('agents.label.account_chosen')" />
            </UTooltip>
            <UBadge v-if="one.serving" color="primary" variant="subtle" size="sm" class="shrink-0" :label="$t('agents.label.account_serving')" />
            <UBadge v-if="loginText(one) !== ''" :color="one.login === 'gone' ? 'error' : 'warning'" variant="subtle" size="sm" :label="loginText(one)" />
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
      </li>

      <li v-if="shown.length === 0" class="px-4 py-3 text-sm text-muted">{{ $t("agents.status.no_accounts") }}</li>
    </ol>

    <p v-if="choiceNote !== ''" class="flex items-center gap-2 text-sm text-toned" data-choice-note>
      <UIcon name="i-material-symbols-swap-horiz" class="size-4 shrink-0 text-warning" />
      <span class="min-w-0 break-words">{{ choiceNote }}</span>
    </p>

    <p v-if="failed !== ''" role="alert" class="break-words text-sm text-error">{{ failed }}</p>

    <SettingsDialog v-model:open="editing" :title="adding ? $t('agents.title.account_add') : editName" :description="adding ? undefined : editId" :dirty="formDirty">
      <form id="account-form" class="flex flex-col gap-4" @submit.prevent="save">
        <UFormField :label="$t('common.label.name')" name="name">
          <UInput v-model="editName" class="w-full" :placeholder="$t('agents.placeholder.account_name')" :aria-label="$t('common.label.name')" />
        </UFormField>

        <UFormField :label="$t('agents.label.credential')" name="kind">
          <USelect v-model="editKind" :items="KIND_ITEMS" value-key="value" class="w-full" :aria-label="$t('agents.label.credential')" />
        </UFormField>

        <UFormField :label="$t('common.label.path')" name="path" :help="editKind === 'token' ? $t('agents.placeholder.token_path') : $t('agents.placeholder.directory_path')">
          <UInput v-model="editPath" class="w-full font-mono" :placeholder="editKind === 'token' ? '~/.config/claude-sub.token' : '/home/user/.claude-sub'" :aria-label="$t('common.label.path')" />
        </UFormField>

        <p v-if="formFailed !== ''" role="alert" class="break-words text-sm text-error">{{ formFailed }}</p>
      </form>

      <template #footer="{ close }">
        <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="busy !== ''" @click="close()" />
        <UButton type="submit" form="account-form" :label="adding ? $t('common.action.add') : $t('common.action.save')" :loading="busy === 'save'" :disabled="busy !== '' || !formDirty" />
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
import { ACCOUNT_KINDS, accountChoiceNote, accountLoginText, accountMark, nextAccountName } from "~/domain/accounts";
import { movedOrder } from "~/domain/agents";
import { failureText } from "bmo-ui/app/domain/errors";
import { usePolling } from "~/domain/polling";
import { useRowDrag } from "~/domain/row-drag";

import type { ClaudeAccountView } from "#shared/types";
import type { DropdownMenuItem } from "@nuxt/ui";

interface Props {
  accounts: ClaudeAccountView[];
  // Every change is asked of the bot and then read back by the page, which this waits for.
  reread: () => Promise<void>;
  query?: string;
}

const props = withDefaults(defineProps<Props>(), { query: "" });

const { t } = useI18n();
const KIND_ITEMS = ACCOUNT_KINDS.map((one) => ({ ...one, label: t(one.label) }));

const busy = ref("");
const failed = ref("");
const formFailed = ref("");
const editing = ref(false);
const adding = ref(false);
const removing = ref(false);
const editId = ref("");
const editName = ref("");
const editKind = ref<ClaudeAccountView["credentialKind"]>("directory");
const editPath = ref("");
const removeId = ref("");
const removeName = ref("");

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

const choiceNote = computed(() => accountChoiceNote(t, props.accounts, now.value));

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
const formFields = (): string => JSON.stringify([editName.value, editKind.value, editPath.value]);
const formOpened = ref(formFields());
const formDirty = computed(() => formFields() !== formOpened.value);

function openAdd(): void {
  adding.value = true;
  editId.value = "";
  // The next number of the list's own numbering, which the owner may write over.
  editName.value = nextAccountName(props.accounts.map((one) => one.name));
  editKind.value = "directory";
  editPath.value = "";
  formOpened.value = formFields();
  formFailed.value = "";
  editing.value = true;
}

function openEdit(account: ClaudeAccountView): void {
  adding.value = false;
  editId.value = account.id;
  editName.value = account.name;
  editKind.value = account.credentialKind;
  editPath.value = account.credentialPath;
  formOpened.value = formFields();
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

async function save(): Promise<void> {
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

// The box for a new login, which the screen's create button opens.
defineExpose({ openAdd });
</script>
