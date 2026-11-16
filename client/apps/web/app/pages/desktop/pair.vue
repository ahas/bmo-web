<template>
  <!-- The desktop pairing page (docs/web.md, 「The desktop pairing page」): the desktop app's code, read by a signed-in
       person against the code the app shows, approved for their own machine or refused. Approved, it waits for the
       app's agent to attach. Like the join page, it stands on no shell; the credential never reaches it. -->
  <div class="relative flex overflow-y-auto bg-default p-4 text-default" :style="{ top: 'var(--bmo-screen-top)', height: 'var(--bmo-screen)' }">
    <UCard class="m-auto w-full max-w-md">
      <template #header>
        <h1 class="text-xl font-semibold text-highlighted">{{ $t("pairing.title.page") }}</h1>
      </template>

      <div class="flex flex-col gap-4" :aria-busy="loading">
        <!-- Opened with no code, as a person reaching it from a browser does, it leads to the app's download page. -->
        <template v-if="code === ''">
          <UAlert color="warning" variant="subtle" :description="$t('pairing.message.no_code')" />
          <div class="flex justify-end">
            <UButton to="/desktop" color="neutral" variant="subtle" icon="i-material-symbols-download" :label="$t('pairing.action.download')" data-pairing-download />
          </div>
        </template>

        <!-- The code's label is drawn at once; the code's place is kept at its size, empty on the server and a
             skeleton once the read has begun, until the code lands. -->
        <div v-if="code !== '' && !failed" class="flex flex-col items-center gap-2">
          <span class="text-sm text-muted">{{ $t("pairing.label.code") }}</span>
          <span v-if="view" data-pairing-code class="font-mono text-4xl font-semibold tracking-widest text-highlighted tabular-nums">{{ view.code }}</span>
          <USkeleton v-else-if="loading" class="h-10 w-56" />
          <span v-else class="h-10" />
        </div>

        <template v-if="loading">
          <span class="sr-only">{{ $t("pairing.status.loading") }}</span>
          <USkeleton class="mx-auto h-5 w-3/4" />
          <USkeleton class="h-5 w-full" />
        </template>

        <template v-else-if="view">

          <template v-if="answer === null && view.state === 'waiting'">
            <p class="text-center text-sm text-toned">{{ $t("pairing.message.check") }}</p>
            <dl class="pair-list gap-x-4 gap-y-1 text-sm">
              <dt class="text-muted">{{ $t("pairing.label.machine") }}</dt>
              <dd class="break-words font-mono text-toned">{{ view.machine ?? $t("pairing.label.machine_new") }}</dd>
            </dl>
          </template>

          <template v-else-if="answer === 'approved'">
            <dl class="pair-list gap-x-4 gap-y-1 text-sm">
              <dt class="text-muted">{{ $t("pairing.label.machine") }}</dt>
              <dd class="break-words font-mono text-toned">{{ machine }}</dd>
            </dl>
            <UAlert v-if="attached" color="success" variant="subtle" :description="$t('pairing.message.connected')" />
            <p v-else class="text-sm text-muted">{{ $t("pairing.message.connecting") }}</p>
          </template>

          <p v-else-if="answer === 'refused'" class="text-sm text-toned">{{ $t("pairing.message.refused") }}</p>

          <UAlert
            v-else
            color="warning"
            variant="subtle"
            :description="view.state === 'expired' ? $t('pairing.message.expired') : $t('pairing.message.closed')"
          />
        </template>

        <UAlert v-if="failure" color="error" variant="subtle" :description="failure" />
      </div>

      <!-- The card's two answers at the footer's right end: the way out first, the way through last. -->
      <template v-if="waiting" #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="subtle" :label="$t('pairing.action.refuse')" :loading="pending === 'refuse'" :disabled="pending !== null" @click="refuse" />
          <UButton :label="$t('pairing.action.approve')" :loading="pending === 'approve'" :disabled="pending !== null" @click="approve" />
        </div>
      </template>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import { useConfirm } from "~/domain/confirm";
import { useVisibleShell } from "~/domain/overlay";

import type { PairingApproved, PairingView, UserNode } from "@web/server-client";

definePageMeta({ layout: false, everyLogin: true });

useVisibleShell();

const { t } = useI18n();
const route = useRoute();
const askFirst = useConfirm();

// How often the page asks whether the approved machine has attached, and for how long: a pairing's own span.
const PROOF_EVERY_MS = 3000;
const PROOF_FOR_MS = 10 * 60_000;

const code = computed(() => (typeof route.query.code === "string" ? route.query.code.trim() : ""));
const view = ref<PairingView | null>(null);
// Whether the code's read is under way, which the server never draws, and whether it failed.
const loading = ref(false);
const failed = ref(false);
const failure = ref("");
const pending = ref<"approve" | "refuse" | null>(null);
// What the reader answered on this page: nothing yet, approved or refused.
const answer = ref<"approved" | "refused" | null>(null);
const machine = ref("");
const attached = ref(false);
const waiting = computed(() => view.value !== null && view.value.state === "waiting" && answer.value === null);
let timer: ReturnType<typeof setInterval> | undefined;
let provingUntil = 0;

async function read(): Promise<void> {
  if (code.value === "") return;

  loading.value = true;
  try {
    view.value = await $fetch<PairingView>(`/api/desktop/pair/${encodeURIComponent(code.value)}`);
  } catch (error) {
    failed.value = true;
    failure.value = failureText(error, t("pairing.error.not_found"));
  } finally {
    loading.value = false;
  }
}

// Approving hands the reader's machine to whatever app shows this code, so it is asked first.
async function approve(): Promise<void> {
  if (view.value === null) return;

  const effect = view.value.machine ? t("pairing.message.effect", { machine: view.value.machine }) : t("pairing.message.effect_new");
  const taken = await askFirst({ title: t("pairing.title.confirm"), item: view.value.code, effect, confirm: t("pairing.action.approve") });

  if (!taken) return;

  pending.value = "approve";
  failure.value = "";
  try {
    machine.value = (await $fetch<PairingApproved>(`/api/desktop/pair/${encodeURIComponent(code.value)}/approve`, { method: "POST" })).machine;
    answer.value = "approved";
    provingUntil = Date.now() + PROOF_FOR_MS;
    timer = setInterval(() => void prove(), PROOF_EVERY_MS);
    void prove();
  } catch (error) {
    failure.value = failureText(error, t("pairing.error.failed"));
  } finally {
    pending.value = null;
  }
}

async function refuse(): Promise<void> {
  pending.value = "refuse";
  failure.value = "";
  try {
    await $fetch(`/api/desktop/pair/${encodeURIComponent(code.value)}/refuse`, { method: "POST" });
    answer.value = "refused";
  } catch (error) {
    failure.value = failureText(error, t("pairing.error.failed"));
  } finally {
    pending.value = null;
  }
}

// Asked every few seconds until the app's agent attaches as the machine approved; a read that fails is asked again.
async function prove(): Promise<void> {
  if (Date.now() > provingUntil) {
    clearInterval(timer);
    timer = undefined;

    return;
  }

  const node = await $fetch<UserNode>("/api/me/machine/proof", { method: "POST" }).catch(() => null);

  if (node?.attached === true && node.agent === machine.value) {
    attached.value = true;
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
  }
}

onMounted(() => void read());
onBeforeUnmount(() => {
  if (timer !== undefined) clearInterval(timer);
});
</script>
