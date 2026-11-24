<template>
  <!-- The join page's ask to share a PC that already has an agent (docs/web.md, 「The join page」; docs/accounts.md, 「A
       machine shared at an invitation's ask」): one muted line and the button that opens the ask in place; the machine's
       name the install's refusal gave, filled with the machine of the account the browser is signed in to where it holds
       one; and what the ask came to — bound at once, waiting for the administrator or a head, or refused. -->
  <div class="flex flex-col gap-3 border-t border-default pt-4" data-join-share>
    <p class="break-keep text-sm text-muted">{{ $t("join.message.share_line") }}</p>
    <UButton
      v-if="!opened"
      color="neutral"
      variant="subtle"
      icon="i-material-symbols-devices-outline"
      class="self-start"
      :label="$t('join.action.share_open')"
      :ui="{ label: 'whitespace-normal break-keep text-start' }"
      data-join-share-open
      @click="opened = true"
    />
    <template v-else>
      <UAlert v-if="ask?.state === 'bound'" color="success" variant="subtle" :description="$t('join.message.share_bound', { machine: ask.machine })" data-join-share-bound />
      <template v-else>
        <UAlert v-if="ask?.state === 'asked'" color="neutral" variant="subtle" icon="i-material-symbols-hourglass-outline" :description="$t('join.message.share_asked', { machine: ask.machine })" :ui="{ description: 'whitespace-pre-line break-keep' }" data-join-share-asked />
        <UAlert v-else-if="ask?.state === 'refused'" color="warning" variant="subtle" :description="$t('join.message.share_refused', { machine: ask.machine })" :ui="{ description: 'whitespace-pre-line break-keep' }" data-join-share-refused />
        <p class="break-keep text-sm text-toned">{{ $t("join.message.share_help") }}</p>
        <UForm id="join-share" :state="form" class="flex items-start gap-2" @submit="send">
          <UFormField :label="$t('join.label.share_machine')" name="machine" :error="failure || undefined" class="min-w-0 flex-1">
            <UInput v-model="form.machine" class="w-full" autocomplete="off" autocapitalize="none" spellcheck="false" :ui="{ base: 'font-mono' }" data-join-share-machine />
          </UFormField>
          <UButton type="submit" class="mt-6 shrink-0" :label="$t('join.action.share_send')" :loading="sending" data-join-share-send />
        </UForm>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import type { ShareAnswer, ShareAskState, UserNode } from "@web/server-client";

interface Props {
  // The invitation's token, whose account asks.
  token: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  // The share bound, so the page asks at once whether the account is active.
  bound: [];
}>();

const { t } = useI18n();
const { loggedIn } = useUserSession();

// What the ask came to as the page last read it: `bound` once the share is bound at once.
interface Shown {
  machine: string;
  state: "asked" | "approved" | "refused" | "bound";
}

const opened = ref(false);
const form = reactive({ machine: "" });
const failure = ref("");
const sending = ref(false);
const ask = ref<Shown | null>(null);
let timer: ReturnType<typeof setInterval> | undefined;

function shown(state: ShareAskState | ShareAnswer): Shown {
  const known = ["asked", "approved", "refused", "bound"] as const;
  const named = known.find((one) => one === state.state) ?? "asked";

  return { machine: state.machine, state: named === "approved" ? "bound" : named };
}

// While an ask waits, it is read again with every wait, so its approval leads on and its refusal is said.
function follow(): void {
  if (timer !== undefined) clearInterval(timer);
  timer = undefined;
  if (ask.value?.state === "asked") timer = setInterval(() => void read(), 5000);
}

async function read(): Promise<void> {
  try {
    const state = await $fetch<ShareAskState | null>(`/api/join/${props.token}/share`);

    if (state === null) return;

    const before = ask.value?.state;

    ask.value = shown(state);
    opened.value = true;
    if (ask.value.state === "bound" && before !== "bound") emit("bound");
    if (ask.value.state !== before) follow();
  } catch {
    // A failed read is read again at the next wait.
  }
}

async function send(): Promise<void> {
  const machine = form.machine.trim();

  failure.value = machine === "" ? t("join.error.share_empty") : "";
  if (machine === "") return;

  sending.value = true;
  try {
    ask.value = shown(await $fetch<ShareAnswer>(`/api/join/${props.token}/share`, { method: "POST", body: { machine } }));
    if (ask.value.state === "bound") emit("bound");
    follow();
  } catch (error) {
    failure.value = failureText(error, t("invites.error.failed"));
  } finally {
    sending.value = false;
  }
}

// The machine of the account the browser is signed in to, offered as the name; the person may type another.
async function offerOwnMachine(): Promise<void> {
  if (!loggedIn.value) return;

  try {
    const machine = await $fetch<UserNode>("/api/me/machine");

    if (typeof machine.agent === "string" && form.machine === "") form.machine = machine.agent;
  } catch {
    // A browser whose account cannot be read offers nothing.
  }
}

onMounted(() => {
  void read();
  void offerOwnMachine();
});
onBeforeUnmount(() => {
  if (timer !== undefined) clearInterval(timer);
});
</script>
